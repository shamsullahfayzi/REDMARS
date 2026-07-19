import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceCatalogService } from './service.service';

@Module({
  controllers: [ServiceController],
  providers: [ServiceCatalogService],
})
export class ServiceModule {}
