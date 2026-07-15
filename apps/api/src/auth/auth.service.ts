import { randomBytes, createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type { LoginRequest, LoginResponse } from '@redmars/shared';
import { PrismaService } from '../prisma/prisma.service';

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
    private readonly config: ConfigService,
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
    const user = await this.prisma.appUser.findFirst({
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

    const refreshTtlDays = this.config.get<number>('JWT_REFRESH_TTL_DAYS', { infer: true })!;
    const expiresAt = new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000);

    // One transaction: a Session that exists without its lastLoginAt is a
    // cosmetic lie, but a lastLoginAt recorded for a session that failed to
    // persist is an audit trail claiming a login that never happened.
    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash,
          expiresAt,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      }),
      this.prisma.appUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<number>('JWT_ACCESS_TTL_SECONDS', { infer: true })!,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        facilityId: user.facilityId,
      },
    };
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
