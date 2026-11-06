import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import {
  SaveApprovalWorkflowRequest,
  type ApprovalWorkflowFormOptionsResponse,
  type ApprovalWorkflowListResponse,
  type ApprovalWorkflowResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApprovalWorkflowsService } from './approval-workflows.service';

/** Administration → Approval matrix. administration.* permissions are GLOBAL only (PD-037). */
@Controller('approval-workflows')
export class ApprovalWorkflowsController {
  constructor(private readonly workflows: ApprovalWorkflowsService) {}

  @Get()
  @RequirePermissions('administration.approvalMatrix.view')
  list(): Promise<ApprovalWorkflowListResponse> {
    return this.workflows.listCurrent();
  }

  /** Declared before ':id' so "form-options" is not parsed as an id. */
  @Get('form-options')
  @RequirePermissions('administration.approvalMatrix.manage')
  formOptions(): Promise<ApprovalWorkflowFormOptionsResponse> {
    return this.workflows.formOptions();
  }

  @Get(':id')
  @RequirePermissions('administration.approvalMatrix.view')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ApprovalWorkflowResponse> {
    return this.workflows.get(id);
  }

  @Post()
  @RequirePermissions('administration.approvalMatrix.manage')
  save(
    @Body(new ZodValidationPipe(SaveApprovalWorkflowRequest)) body: SaveApprovalWorkflowRequest,
    @Req() request: Request,
  ): Promise<ApprovalWorkflowResponse> {
    return this.workflows.save(body, actorIdOf(request));
  }
}
