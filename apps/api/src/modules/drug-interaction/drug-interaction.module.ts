import { Module } from '@nestjs/common';
import { DrugInteractionController } from './drug-interaction.controller';
import { DrugInteractionService } from './drug-interaction.service';

/**
 * Drug interaction check (task 2.11). PrismaService comes from the global
 * PrismaModule, so nothing to import here.
 */
@Module({
  controllers: [DrugInteractionController],
  providers: [DrugInteractionService],
})
export class DrugInteractionModule {}
