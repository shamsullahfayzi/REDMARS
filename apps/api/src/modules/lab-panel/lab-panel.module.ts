import { Module } from '@nestjs/common';
import { LabPanelController } from './lab-panel.controller';
import { LabPanelService } from './lab-panel.service';

@Module({
  controllers: [LabPanelController],
  providers: [LabPanelService],
})
export class LabPanelModule {}
