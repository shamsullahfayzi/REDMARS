import { Module } from '@nestjs/common';
import { SettingService } from './setting.service';

/**
 * Infrastructure module (task 6b.1), same shape as NumberSequenceModule — exports the
 * service so any module that needs a facility setting can import this rather than
 * reimplementing the get/set against the Setting table.
 */
@Module({
  providers: [SettingService],
  exports: [SettingService],
})
export class SettingModule {}
