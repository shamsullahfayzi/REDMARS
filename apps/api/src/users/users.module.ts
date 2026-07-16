import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * PrismaService is global (PrismaModule), and the guards are global via AuthModule,
 * so this module only has to bring its own controller and service.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
