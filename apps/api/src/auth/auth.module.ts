import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
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
  providers: [AuthService],
  // Exported for 1.3's guard, which verifies the tokens this module issues.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
