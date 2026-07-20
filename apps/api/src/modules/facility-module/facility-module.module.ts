import { Module } from '@nestjs/common';
import { FacilityModuleController } from './facility-module.controller';
import { FacilityModuleService } from './facility-module.service';

/**
 * Facility module toggles (task 2.12). The service is exported so the ModuleGuard
 * (task 2.13) can read module state without a second copy of the query.
 */
@Module({
  controllers: [FacilityModuleController],
  providers: [FacilityModuleService],
  exports: [FacilityModuleService],
})
export class FacilityModuleModule {}
