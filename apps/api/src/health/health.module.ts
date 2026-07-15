import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// PrismaService comes from the global PrismaModule.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
