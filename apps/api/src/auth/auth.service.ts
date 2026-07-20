import { randomBytes, createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { AuditAction } from '@prisma/client';
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RefreshResponse,
  SessionEndedReason,
} from '@redmars/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FacilityModuleService } from '../modules/facility-module/facility-module.service';
import type { Env } from '../config/env.validation';
import type { AuthContext } from './auth-context';

/**
 * A 401 whose body carries WHY the session ended, so the web app can show the
 * right message instead of a blank "signed out". The AllExceptionsFilter spreads
 * this object into the response, so `reason` reaches the client alongside the 401.
 */
function sessionEndedException(reason: SessionEndedReason): UnauthorizedException {
  return new UnauthorizedException({ message: 'Session ended', reason });
}

/** Where the request came from. Recorded on the Session so 1.8 can show a user their sessions. */
export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

/** The claims we sign. Kept deliberately small — see issueAccessToken. */
export interface AccessTokenPayload {
  /** AppUser.id. 'sub' is the JWT standard claim for the subject. */
  sub: string;
  facilityId: string;
  username: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  /**
   * An argon2 hash of a value nobody knows, verified against when the username
   * does not exist. See login() — this exists purely to burn the same CPU time.
   */
  private dummyHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    // Typed <Env, true>: the generic gives get() the real key→type map from the
    // zod schema (so 'JWT_REFRESH_TTL_DAYS' is a number, not `any`), and the
    // `true` (WasValidated) says every key is present — validateEnv guarantees
    // it at boot — so get() returns T, never T | undefined. That is what kills
    // the two no-unsafe-assignment errors AND the `!` we used to paper over them.
    private readonly config: ConfigService<Env, true>,
    private readonly modules: FacilityModuleService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Computed once at boot, not per request: argon2 is ~100ms by design and we
    // only need one throwaway hash of the right shape.
    this.dummyHash = await hash(randomBytes(32).toString('hex'));
  }

  async login(input: LoginRequest, ctx: LoginContext): Promise<LoginResponse> {
    // findFirst, not findUnique, because AppUser is unique on (facilityId, username)
    // and login has no facility to key on — the user has not identified one yet.
    //
    // This is correct ONLY because of the deployment model: one database per
    // hospital, so exactly one Facility row exists and usernames are globally
    // unique within it. If two facilities ever share a database, this silently
    // picks one of them, which is a cross-tenant login. That day, login needs a
    // facility discriminator; it is not something to paper over here.
    const user = await this.prisma.db.appUser.findFirst({
      where: { username: input.username, deletedAt: null },
    });

    // Always run argon2, even when the username is wrong.
    //
    // The obvious version returns early on a missing user. That reply comes back
    // in ~1ms instead of ~100ms, and the difference is measurable over the
    // network — so an attacker can enumerate valid staff usernames by timing
    // alone, without ever guessing a password. Knowing "dr.ahmadi exists" is the
    // first half of the attack.
    const passwordOk = await verify(user?.passwordHash ?? this.dummyHash, input.password);

    // One error for every failure: no such user, wrong password, disabled
    // account, soft-deleted account. Anything more specific is a free oracle —
    // "wrong password" tells the caller the username was right.
    //
    // isActive is checked here rather than in the query above so that a disabled
    // account still costs a full argon2 verify. Filtering it in SQL would leak
    // disabled accounts through the same timing channel.
    if (!user || !passwordOk || !user.isActive) {
      // Server-side the distinction matters — this is what an admin needs when a
      // real doctor reports "it says invalid credentials". The client is told
      // nothing. Never log input.password.
      this.logger.warn(
        `Failed login for "${input.username}" from ${ctx.ipAddress ?? 'unknown'}: ` +
          (!user ? 'no such user' : !passwordOk ? 'bad password' : 'account disabled'),
      );
      throw new UnauthorizedException('Invalid username or password');
    }

    const accessToken = this.issueAccessToken(user.id, user.facilityId, user.username);
    const { token: refreshToken, hash: refreshTokenHash } = this.issueRefreshToken();

    const refreshTtlDays = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);

    // One transaction, three steps in order (task 1.8):
    //  1. Revoke this user's other live sessions — single-session policy. Their
    //     next refresh fails with 'superseded', which is what "signed in elsewhere"
    //     means. Done FIRST and scoped to revokedAt: null so it cannot touch the
    //     session created in step 2.
    //  2. Create the new session.
    //  3. Stamp lastLoginAt.
    // Atomic because a half-applied login — old sessions killed but the new one
    // not persisted — would lock the user out of the account they just signed into.
    await this.prisma.db.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'superseded' },
      });
      await tx.session.create({
        data: {
          userId: user.id,
          refreshTokenHash,
          expiresAt,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      });
      await tx.appUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    });

    // The dedicated login audit action (deferred here from 1.4). Best-effort — a
    // failed audit write must not fail a successful login.
    await this.prisma.recordAuthEvent(AuditAction.login, {
      userId: user.id,
      facilityId: user.facilityId,
      ipAddress: ctx.ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        facilityId: user.facilityId,
      },
    };
  }

  /**
   * POST /auth/refresh — spend a refresh token for a new access token (task 1.8).
   *
   * Standing is read from the database, not from the token: the session must exist,
   * be unrevoked, be unexpired, and its user still active. Any of those failing
   * throws with a reason the web app turns into a message ("signed in elsewhere",
   * "expired", …). No rotation — the refresh token is unchanged and only a fresh
   * access token comes back.
   */
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const session = await this.prisma.db.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
      select: {
        revokedAt: true,
        revokedReason: true,
        expiresAt: true,
        user: {
          select: { id: true, facilityId: true, username: true, isActive: true, deletedAt: true },
        },
      },
    });

    if (!session) {
      throw sessionEndedException('invalid');
    }
    if (session.revokedAt !== null) {
      // A superseded session is the "signed in elsewhere" case; anything else
      // revoked (logout) is just gone.
      throw sessionEndedException(
        session.revokedReason === 'superseded' ? 'superseded' : 'invalid',
      );
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw sessionEndedException('expired');
    }
    if (!session.user.isActive || session.user.deletedAt !== null) {
      throw sessionEndedException('deactivated');
    }

    const accessToken = this.issueAccessToken(
      session.user.id,
      session.user.facilityId,
      session.user.username,
    );
    return {
      accessToken,
      expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
    };
  }

  /**
   * POST /auth/logout — revoke the caller's own session (task 1.8). Idempotent: an
   * already-revoked or unknown token is a no-op returning success, never an error,
   * because "make this session not work" is satisfied either way and a logout that
   * can fail is one users learn to distrust.
   */
  async logout(refreshToken: string, ipAddress?: string): Promise<void> {
    const session = await this.prisma.db.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
      select: { id: true, revokedAt: true, user: { select: { id: true, facilityId: true } } },
    });

    if (!session || session.revokedAt !== null) {
      return;
    }

    await this.prisma.db.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });

    await this.prisma.recordAuthEvent(AuditAction.logout, {
      userId: session.user.id,
      facilityId: session.user.facilityId,
      ipAddress,
    });
  }

  /**
   * GET /auth/me — the identity behind the token the caller presented.
   *
   * Roles come straight from the AuthContext the JwtAuthGuard already built (a
   * fresh DB read per request), so they cannot be staler than this request. The
   * user's own fields need one small read: AuthContext deliberately does not carry
   * fullName — it is on the hot path of every request, and this is the only place
   * that wants the name, called once per app load. Paying a read here keeps every
   * other request lean.
   */
  async me(auth: AuthContext): Promise<MeResponse> {
    const user = await this.prisma.db.appUser.findUnique({
      where: { id: auth.userId },
      select: { id: true, username: true, fullName: true, facilityId: true },
    });

    if (!user) {
      // The guard validated this user microseconds ago, so a miss means they were
      // deleted mid-request. Report it as the token no longer being good.
      throw new UnauthorizedException('Invalid or expired token');
    }

    const enabledModules = await this.modules.enabledKeys(auth.facilityId);
    return { user, roles: auth.roles, enabledModules };
  }

  /**
   * A JWT is signed, not encrypted — anyone holding it can read these claims.
   * So this carries identity and nothing else: no email, no name, no roles.
   *
   * Roles are absent for a second reason beyond "they do not exist until 1.2":
   * claims baked into a stateless token cannot be withdrawn. Strip a doctor's
   * prescribing rights and a role-carrying token keeps prescribing until it
   * expires. Where the permission check reads from is 1.3's decision.
   */
  private issueAccessToken(userId: string, facilityId: string, username: string): string {
    const payload: AccessTokenPayload = { sub: userId, facilityId, username };
    return this.jwt.sign(payload);
  }

  /**
   * Opaque random bytes, not a JWT: there is nothing in a refresh token to read,
   * its only job is to be presented back and matched.
   *
   * The plaintext goes to the client exactly once, in the login response. Only
   * the hash is stored, because Session rows land in the nightly pg_dump that
   * leaves the building (0.9) — plaintext refresh tokens in a backup file are a
   * login as any doctor, for anyone who reads that file.
   *
   * SHA-256 rather than argon2 on purpose. Argon2 is slow to defeat offline
   * brute force of low-entropy human passwords. This is 32 bytes of CSPRNG
   * output: there is no dictionary, no guessing, nothing for slowness to buy.
   * Argon2 here would spend ~100ms per refresh to protect against an attack that
   * does not exist.
   */
  private issueRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashRefreshToken(token) };
  }
}

/**
 * Exported because 1.8's refresh endpoint must hash an incoming token the exact
 * same way to find its Session. Two copies of this line drifting apart would
 * mean every refresh silently fails to match.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
