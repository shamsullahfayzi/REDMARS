import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthContext } from '../../auth/auth-context';
import type { AccessTokenPayload } from '../../auth/auth.service';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import type { RoleCode } from '../../auth/permissions';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Authentication. Answers "who are you" and nothing else — whether they may do
 * the thing is PermissionsGuard's question.
 *
 * Global, so every route needs a valid token unless it carries @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    let payload: AccessTokenPayload;
    try {
      // algorithms is pinned at verification, not only at signing. The signing
      // options in AuthModule constrain what we mint; they say nothing about
      // what we accept. Leaving this open is how a verifier ends up honouring
      // alg:none, or an RS256 token whose "signature" is our HS256 secret used
      // as a public key. State what you accept.
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      // Expired, wrong signature, garbage — one message for all of them. The
      // caller learns their token is no good, not which way it was no good.
      throw new UnauthorizedException('Invalid or expired token');
    }

    // The token is proof of identity, not proof of standing. It was minted up
    // to JWT_ACCESS_TTL_SECONDS ago and says nothing about what has happened
    // since. This read is what makes "deactivate this user" mean now instead of
    // "within 15 minutes" — the roles have to be fetched anyway, so the
    // freshness costs nothing beyond the columns.
    const user = await this.prisma.appUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        facilityId: true,
        username: true,
        isActive: true,
        deletedAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                code: true,
                rolePermissions: {
                  select: {
                    condition: true,
                    permission: { select: { code: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      // Same message a bad signature gets. A distinct "your account is
      // disabled" would confirm to whoever holds this token that the account is
      // real — and a token in the wrong hands is exactly when that matters.
      this.logger.warn(
        `Rejected token for user ${payload.sub} (${payload.username}): ` +
          (!user ? 'no such user' : user.deletedAt !== null ? 'deleted' : 'deactivated'),
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (user.facilityId !== payload.facilityId) {
      // Cannot happen today: one database per hospital, one facility in it, and
      // the signature covers the claim. It is checked because the day that
      // stops being true, this is the line between "a user moved facilities" and
      // "a token reads another hospital's patients", and finding out by
      // accident is not an option.
      this.logger.error(
        `Facility mismatch for ${user.username}: token says ${payload.facilityId}, user is in ${user.facilityId}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.auth = buildAuthContext(user);
    return true;
  }
}

/** The shape the query above selects. Named so buildAuthContext can be read on its own. */
interface UserWithGrants {
  id: string;
  facilityId: string;
  username: string;
  userRoles: Array<{
    role: {
      code: string;
      rolePermissions: Array<{
        condition: string | null;
        permission: { code: string };
      }>;
    };
  }>;
}

function buildAuthContext(user: UserWithGrants): AuthContext {
  const roles: RoleCode[] = [];
  const permissions = new Map<string, string | null>();

  for (const { role } of user.userRoles) {
    roles.push(role.code as RoleCode);

    for (const grant of role.rolePermissions) {
      const code = grant.permission.code;
      const existing = permissions.get(code);

      // Least restrictive wins across roles. Someone holding both admin and
      // doctor has patient.read_clinical twice: ⚠️ R2 as an admin, ✅ as a
      // doctor. They read it as a doctor — a role you hold does not take away
      // what another role you hold gives you.
      //
      // Two different conditions on the same code (R2 and R7, say) keeps the
      // first seen. Arbitrary, and it does not matter yet: no rule is enforced
      // from this map today (see PermissionsGuard), so nothing reads the value.
      // Whoever wires up the first real rule has to decide this properly.
      if (existing === undefined || grant.condition === null) {
        permissions.set(code, grant.condition);
      }
    }
  }

  return {
    userId: user.id,
    facilityId: user.facilityId,
    username: user.username,
    roles,
    permissions,
  };
}

/**
 * "Bearer <token>" and nothing else. Case-insensitive on the scheme because
 * RFC 7235 says the scheme is; strict about the rest because being lenient with
 * the shape of credentials is how you end up parsing something you did not mean.
 */
function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token, ...rest] = header.split(' ');
  if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
