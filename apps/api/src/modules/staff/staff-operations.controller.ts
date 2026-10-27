import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  copyRosterSchema,
  createLeaveRequestSchema,
  decideLeaveSchema,
  markAttendanceSchema,
  publishRosterSchema,
  saveHolidaySchema,
  saveLeaveTypeSchema,
  saveRosterEntrySchema,
  saveShiftTypeSchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { StaffOperationsService } from './staff-operations.service';

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BadRequestException({
      code: 'invalid_hr_input',
      message: 'Check the HR form fields.',
      errors: r.error.flatten().fieldErrors,
    });
  return r.data;
};
const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedException();
  return req.auth;
};
const dateRange = z.object({
  from: z.string(),
  to: z.string(),
  departmentId: z.string().uuid().optional(),
});

@Controller('hr')
@RequiresModule('hr')
export class StaffOperationsController {
  constructor(private readonly operations: StaffOperationsService) {}
  @Get('leave-types') @RequirePermission('hr.leave.request') leaveTypes(@Req() req: Request) {
    return this.operations.leaveTypes(auth(req));
  }
  @Post('leave-types') @RequirePermission('hr.leave.approve') createLeaveType(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.operations.createLeaveType(auth(req), parse(saveLeaveTypeSchema, body));
  }
  @Patch('leave-types/:id') @RequirePermission('hr.leave.approve') updateLeaveType(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.operations.updateLeaveType(
      auth(req),
      id,
      parse(saveLeaveTypeSchema.partial(), body),
    );
  }
  @Get('holidays') @RequirePermission('hr.attendance.view') holidays(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.operations.holidays(auth(req), from, to);
  }
  @Post('holidays') @RequirePermission('hr.attendance.mark') createHoliday(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.operations.createHoliday(auth(req), parse(saveHolidaySchema, body));
  }
  @Get('leave-requests') @RequirePermission('hr.leave.approve') leaveRequests(@Req() req: Request) {
    return this.operations.leaveRequests(auth(req));
  }
  @Get('leave-requests/mine') @RequirePermission('hr.leave.request') myLeave(@Req() req: Request) {
    return this.operations.leaveRequests(auth(req), true);
  }
  @Post('leave-requests') @RequirePermission('hr.leave.request') createLeave(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.operations.createLeaveRequest(auth(req), parse(createLeaveRequestSchema, body));
  }
  @Post('leave-requests/:id/decision') @RequirePermission('hr.leave.approve') decide(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parse(decideLeaveSchema, body);
    return this.operations.decideLeave(auth(req), id, input.decision, input.note);
  }
  @Post('leave-requests/:id/cancel') @RequirePermission('hr.leave.request') cancel(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.cancelLeave(auth(req), id);
  }
  @Get('leave-balances/:employeeId') @RequirePermission('hr.attendance.view') balances(
    @Req() req: Request,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.operations.leaveBalance(auth(req), employeeId);
  }
  @Get('attendance') @RequirePermission('hr.attendance.view') attendance(
    @Req() req: Request,
    @Query('date') date: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.operations.attendance(auth(req), date, departmentId);
  }
  @Put('attendance') @RequirePermission('hr.attendance.mark') mark(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.operations.markAttendance(auth(req), parse(markAttendanceSchema, body));
  }
  @Get('shift-types') @RequirePermission('hr.roster.view') shifts(@Req() req: Request) {
    return this.operations.shiftTypes(auth(req));
  }
  @Post('shift-types') @RequirePermission('hr.roster.edit') createShift(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.operations.createShiftType(auth(req), parse(saveShiftTypeSchema, body));
  }
  @Patch('shift-types/:id') @RequirePermission('hr.roster.edit') updateShift(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.operations.updateShiftType(
      auth(req),
      id,
      parse(saveShiftTypeSchema.partial(), body),
    );
  }
  @Get('roster') @RequirePermission('hr.roster.view') roster(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    const q = parse(dateRange, query);
    return this.operations.roster(auth(req), q.from, q.to, q.departmentId);
  }
  @Post('roster') @RequirePermission('hr.roster.edit') createRoster(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.operations.createRoster(auth(req), parse(saveRosterEntrySchema, body));
  }
  @Post('roster/copy') @RequirePermission('hr.roster.edit') copy(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const x = parse(copyRosterSchema, body);
    return this.operations.copyRoster(
      auth(req),
      x.sourceStartsOn,
      x.targetStartsOn,
      x.departmentId,
    );
  }
  @Post('roster/publish') @RequirePermission('hr.roster.edit') publish(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const x = parse(publishRosterSchema, body);
    return this.operations.publishRoster(auth(req), x.startsOn, x.endsOn, x.departmentId);
  }
  @Post('roster/:id/cancel') @RequirePermission('hr.roster.edit') cancelRoster(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.cancelRoster(auth(req), id);
  }
  @Get('roster-warnings') @RequirePermission('hr.roster.view') warnings(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    const q = parse(dateRange, query);
    return this.operations.rosterWarnings(auth(req), q.from, q.to, q.departmentId);
  }
  @Get('on-duty') @RequirePermission('hr.roster.view') onDuty(
    @Req() req: Request,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.operations.onDuty(auth(req), departmentId);
  }
  @Get('reports/attendance') @RequirePermission('hr.report.view') report(
    @Req() req: Request,
    @Query() query: unknown,
  ) {
    const q = parse(dateRange.omit({ departmentId: true }), query);
    return this.operations.report(auth(req), q.from, q.to);
  }
}
