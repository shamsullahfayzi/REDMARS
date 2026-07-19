import { Module } from '@nestjs/common';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';

@Module({
  controllers: [DepartmentController],
  providers: [DepartmentService],
  // Exported so the Room module (next in 2.1) can reuse it if it needs to.
  exports: [DepartmentService],
})
export class DepartmentModule {}
