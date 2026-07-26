import { Module } from '@nestjs/common';
import { SettingModule } from '../../services/setting.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [SettingModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
