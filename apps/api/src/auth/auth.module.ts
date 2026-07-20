import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { FacilityModuleModule } from '../modules/facility-module/facility-module.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    // ModuleGuard and /auth/me both read facility module state through this service.
    FacilityModuleModule,
    // registerAsync, not register: the secret comes from ConfigService, which is
    // only populated after validateEnv has run. Registering synchronously would
    // read JWT_SECRET before it has been checked and sign tokens with undefined.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<number>('JWT_ACCESS_TTL_SECONDS'),
          // Pinned explicitly. jsonwebtoken picks HS256 by default anyway, but
          // leaving it implicit is how a verifier ends up accepting alg:none or
          // a downgrade. State the algorithm you mean.
          algorithm: 'HS256',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,

    // Global, not per-controller. Opt-in protection means an endpoint added in
    // a hurry is unprotected until someone remembers, and the one nobody
    // remembers is the one that matters. Every route is closed; @Public() opens
    // one, and that shows up in a diff.
    //
    // ORDER IS LOAD-BEARING. Nest runs global guards in provider order, and
    // PermissionsGuard reads the request.auth that JwtAuthGuard writes. Swap
    // these two and every protected route 403s with "JwtAuthGuard did not run"
    // in the log — it fails closed, but it fails.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // After both auth guards: ModuleGuard reads request.auth.facilityId (written by
    // JwtAuthGuard) to look up whether the route's module is on. Order still load-
    // bearing — it must not run before the identity it depends on exists.
    { provide: APP_GUARD, useClass: ModuleGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
