import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  activeAccountSchema,
  createEmployeeAccountSchema,
  createEmployeeSchema,
  createHrPositionSchema,
  documentTypeSchema,
  employeeQuerySchema,
  exitEmployeeSchema,
  hrConfigSchema,
  resetEmployeePasswordSchema,
  saveHrCredentialSchema,
  updateEmployeeSchema,
  updateHrPositionSchema,
} from '@redmars/shared';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequiresModule } from '../../auth/decorators/requires-module.decorator';
import { StaffService } from './staff.service';

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'invalid_hr_input',
      message: 'Check the HR form fields.',
      errors: result.error.flatten().fieldErrors,
    });
  return result.data;
};
const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedException();
  return req.auth;
};
const documentMetaSchema = z.object({
  type: documentTypeSchema,
  title: z.string().trim().min(2).max(160),
  issuedOn: z.string().optional(),
  expiresOn: z.string().optional(),
  note: z.string().max(500).optional(),
});

@Controller('employees')
@RequiresModule('hr')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get('me') @RequirePermission('hr.self.view') me(@Req() req: Request) {
    return this.staff.me(auth(req));
  }
  @Get() @RequirePermission('hr.employee.view') list(@Req() req: Request, @Query() query: unknown) {
    return this.staff.list(auth(req), parse(employeeQuerySchema, query));
  }
  @Post() @RequirePermission('hr.employee.create') create(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.staff.create(auth(req), parse(createEmployeeSchema, body));
  }
  @Get(':id') @RequirePermission('hr.employee.view') detail(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staff.detail(auth(req), id);
  }
  @Patch(':id') @RequirePermission('hr.employee.edit') update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.staff.update(auth(req), id, parse(updateEmployeeSchema, body));
  }
  @Post(':id/exit') @RequirePermission('hr.employee.exit') exit(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.staff.exit(auth(req), id, parse(exitEmployeeSchema, body));
  }

  @Post(':id/documents')
  @RequirePermission('hr.document.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  addDocument(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    return this.staff.addDocument(auth(req), id, parse(documentMetaSchema, body), file);
  }
  @Get(':id/documents/:documentId/download')
  @RequirePermission('hr.document.manage')
  async download(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ) {
    const d = await this.staff.document(auth(req), id, documentId);
    res.setHeader('Content-Type', d.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,
    );
    res.send(Buffer.from(d.content));
  }
  @Delete(':id/documents/:documentId') @RequirePermission('hr.document.manage') removeDocument(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.staff.removeDocument(auth(req), id, documentId);
  }
  @Post(':id/credentials') @RequirePermission('hr.credential.manage') credential(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.staff.addCredential(auth(req), id, parse(saveHrCredentialSchema, body));
  }
  @Post(':id/account') @RequirePermission('user.create') account(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.staff.createAccount(auth(req), id, parse(createEmployeeAccountSchema, body));
  }
  @Patch(':id/account/active') @RequirePermission('user.deactivate') active(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.staff.setAccountActive(auth(req), id, parse(activeAccountSchema, body).active);
  }
  @Post(':id/account/reset-password') @RequirePermission('user.reset_password') reset(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.staff.resetPassword(
      auth(req),
      id,
      parse(resetEmployeePasswordSchema, body).password,
    );
  }
}

@Controller('hr')
@RequiresModule('hr')
export class HrFoundationController {
  constructor(private readonly staff: StaffService) {}
  @Get('positions') @RequirePermission('hr.employee.view') positions(@Req() req: Request) {
    return this.staff.positions(auth(req));
  }
  @Post('positions') @RequirePermission('hr.employee.edit') createPosition(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.staff.createPosition(auth(req), parse(createHrPositionSchema, body));
  }
  @Patch('positions/:id') @RequirePermission('hr.employee.edit') updatePosition(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.staff.updatePosition(auth(req), id, parse(updateHrPositionSchema, body));
  }
  @Get('credentials') @RequirePermission('hr.credential.manage') credentials(
    @Req() req: Request,
    @Query('state') state?: string,
  ) {
    return this.staff.credentials(auth(req), state);
  }
  @Patch('credentials/:id') @RequirePermission('hr.credential.manage') updateCredential(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.staff.updateCredential(
      auth(req),
      id,
      parse(saveHrCredentialSchema.partial(), body),
    );
  }
  @Delete('credentials/:id') @RequirePermission('hr.credential.manage') removeCredential(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staff.removeCredential(auth(req), id);
  }
  @Post('credentials/reminders/run') @RequirePermission('hr.credential.manage') reminders(
    @Req() req: Request,
  ) {
    return this.staff.runCredentialReminders(auth(req));
  }
  @Get('config') @RequirePermission('hr.employee.view') config(@Req() req: Request) {
    return this.staff.getConfig(auth(req));
  }
  @Put('config') @RequirePermission('hr.employee.edit') setConfig(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.staff.setConfig(auth(req), parse(hrConfigSchema, body));
  }
  @Get('orphans') @RequirePermission('user.read') orphans(@Req() req: Request) {
    return this.staff.orphans(auth(req));
  }
}
