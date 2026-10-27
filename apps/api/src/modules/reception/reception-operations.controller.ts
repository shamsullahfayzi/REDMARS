import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Res } from '@nestjs/common';
import {
  handoverInputSchema,
  handoverUpdateSchema,
  patientContactInputSchema,
  patientCoverageInputSchema,
  patientDepositCloseSchema,
  patientDepositInputSchema,
  patientDocumentInputSchema,
  receptionAuditQuerySchema,
  receptionBedInputSchema,
  receptionBedUpdateSchema,
  receptionCareRequestInputSchema,
  receptionCareReviewSchema,
  receptionTillCloseInputSchema,
  reminderInputSchema,
  reminderUpdateSchema,
  waitlistInputSchema,
  waitlistUpdateSchema,
} from '@redmars/shared';
import type { ZodType } from 'zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import type { AuthContext } from '../../auth/auth-context';
import { ReceptionOperationsService } from './reception-operations.service';

@Controller('reception/operations')
export class ReceptionOperationsController {
  constructor(private readonly operations: ReceptionOperationsService) {}

  @Get()
  @RequirePermission('reception.read')
  workspace(@Req() req: Request) {
    return this.operations.workspace(this.auth(req).facilityId);
  }

  @Post('beds')
  @HttpCode(201)
  @RequirePermission('reception.manage_beds')
  createBed(@Req() req: Request, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.createBed(auth.facilityId, auth.userId, this.parse(receptionBedInputSchema, body));
  }

  @Patch('beds/:id')
  @RequirePermission('reception.manage_beds')
  updateBed(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.updateBed(auth.facilityId, auth.userId, id, this.parse(receptionBedUpdateSchema, body));
  }

  @Post('requests')
  @HttpCode(201)
  @RequirePermission('reception.coordinate')
  createRequest(@Req() req: Request, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.createCareRequest(auth.facilityId, auth.userId, this.parse(receptionCareRequestInputSchema, body));
  }

  @Patch('requests/:id/review')
  @RequirePermission('reception.clinical_review')
  reviewRequest(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.reviewCareRequest(auth.facilityId, auth.userId, id, this.parse(receptionCareReviewSchema, body));
  }

  @Post('waitlist')
  @HttpCode(201)
  @RequirePermission('reception.coordinate')
  createWaitlist(@Req() req: Request, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.createWaitlist(auth.facilityId, auth.userId, this.parse(waitlistInputSchema, body));
  }

  @Patch('waitlist/:id')
  @RequirePermission('reception.coordinate')
  updateWaitlist(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.updateWaitlist(auth.facilityId, auth.userId, id, this.parse(waitlistUpdateSchema, body));
  }

  @Get('patients/:patientId')
  @RequirePermission('reception.coordinate')
  patientProfile(@Req() req: Request, @Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.operations.patientProfile(this.auth(req).facilityId, patientId);
  }

  @Post('patients/:patientId/documents')
  @HttpCode(201)
  @RequirePermission('reception.coordinate')
  addDocument(@Req() req: Request, @Param('patientId', ParseUUIDPipe) patientId: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.addDocument(auth.facilityId, auth.userId, patientId, this.parse(patientDocumentInputSchema, body));
  }

  @Get('patients/:patientId/documents/:documentId')
  @RequirePermission('reception.coordinate')
  async document(
    @Req() req: Request,
    @Res() response: Response,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    const file = await this.operations.document(this.auth(req).facilityId, patientId, documentId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/["\\\r\n]/g, '_')}"`);
    response.send(Buffer.from(file.contentBase64, 'base64'));
  }

  @Post('patients/:patientId/contacts')
  @HttpCode(201)
  @RequirePermission('reception.coordinate')
  addContact(@Req() req: Request, @Param('patientId', ParseUUIDPipe) patientId: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.addContact(auth.facilityId, auth.userId, patientId, this.parse(patientContactInputSchema, body));
  }

  @Patch('contacts/:id/archive')
  @RequirePermission('reception.coordinate')
  archiveContact(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const auth = this.auth(req);
    const parsed = this.parse(receptionCareReviewSchema.pick({ idempotencyKey: true }), body);
    return this.operations.archiveContact(auth.facilityId, auth.userId, id, parsed.idempotencyKey);
  }

  @Post('patients/:patientId/coverages')
  @HttpCode(201)
  @RequirePermission('reception.coordinate')
  addCoverage(@Req() req: Request, @Param('patientId', ParseUUIDPipe) patientId: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.addCoverage(
      auth.facilityId,
      auth.userId,
      patientId,
      this.parse(patientCoverageInputSchema, body),
      auth.permissions.has('reception.supervise'),
    );
  }

  @Post('deposits')
  @HttpCode(201)
  @RequirePermission('payment.receive')
  createDeposit(@Req() req: Request, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.createDeposit(auth.facilityId, auth.userId, this.parse(patientDepositInputSchema, body));
  }

  @Patch('deposits/:id/close')
  @RequirePermission('payment.refund')
  closeDeposit(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.closeDeposit(auth.facilityId, auth.userId, id, this.parse(patientDepositCloseSchema, body));
  }

  @Post('reminders')
  @HttpCode(201)
  @RequirePermission('reception.coordinate')
  createReminder(@Req() req: Request, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.createReminder(auth.facilityId, auth.userId, this.parse(reminderInputSchema, body));
  }

  @Patch('reminders/:id')
  @RequirePermission('reception.supervise')
  updateReminder(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.updateReminder(auth.facilityId, auth.userId, id, this.parse(reminderUpdateSchema, body));
  }

  @Post('handovers')
  @HttpCode(201)
  @RequirePermission('reception.coordinate')
  createHandover(@Req() req: Request, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.createHandover(auth.facilityId, auth.userId, this.parse(handoverInputSchema, body));
  }

  @Patch('handovers/:id')
  @RequirePermission('reception.coordinate')
  updateHandover(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.updateHandover(auth.facilityId, auth.userId, id, this.parse(handoverUpdateSchema, body));
  }

  @Post('till-closes')
  @HttpCode(201)
  @RequirePermission('payment.receive')
  closeTill(@Req() req: Request, @Body() body: unknown) {
    const auth = this.auth(req);
    return this.operations.closeTill(auth.facilityId, auth.userId, this.parse(receptionTillCloseInputSchema, body));
  }

  @Patch('till-closes/:id/approve')
  @RequirePermission('reception.supervise')
  approveTill(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const auth = this.auth(req);
    const parsed = this.parse(receptionCareReviewSchema.pick({ idempotencyKey: true }), body);
    return this.operations.approveTill(auth.facilityId, auth.userId, id, parsed.idempotencyKey);
  }

  @Get('audit')
  @RequirePermission('reception.supervise')
  audit(@Req() req: Request, @Query() query: unknown) {
    const parsed = this.parse(receptionAuditQuerySchema, query);
    return this.operations.audit(this.auth(req).facilityId, parsed.from, parsed.to, parsed.entity);
  }

  private parse<T>(schema: ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({ message: 'Invalid reception request', errors: parsed.error.flatten().fieldErrors });
    return parsed.data;
  }

  private auth(req: Request): AuthContext {
    if (!req.auth) throw new UnauthorizedException('Invalid or expired token');
    return req.auth;
  }
}
