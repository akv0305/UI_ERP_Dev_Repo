import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApproveIndentRequest,
  CancelIndentRequest,
  CreateIndentRequest,
  IndentItemOptionsQuery,
  IndentListQuery,
  RejectIndentRequest,
  UpdateIndentRequest,
  type IndentDetailResponse,
  type IndentFormOptionsResponse,
  type IndentItemOptionsResponse,
  type IndentResponse,
  type PagedIndentsResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IndentsService } from './indents.service';

@Controller('indents')
export class IndentsController {
  constructor(private readonly indents: IndentsService) {}

  @Get()
  @RequirePermissions('purchase.indents.view')
  list(
    @Query(new ZodValidationPipe(IndentListQuery)) query: IndentListQuery,
    @Req() request: Request,
  ): Promise<PagedIndentsResponse> {
    return this.indents.list(query, actorIdOf(request), accessOf(request));
  }

  // Static routes before ':id'.
  @Get('form-options')
  @RequirePermissions('purchase.indents.manage')
  formOptions(@Req() request: Request): Promise<IndentFormOptionsResponse> {
    return this.indents.formOptions(accessOf(request));
  }

  @Get('item-options')
  @RequirePermissions('purchase.indents.manage')
  itemOptions(
    @Query(new ZodValidationPipe(IndentItemOptionsQuery)) query: IndentItemOptionsQuery,
  ): Promise<IndentItemOptionsResponse> {
    return this.indents.itemOptions(query);
  }

  @Get(':id')
  @RequirePermissions('purchase.indents.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<IndentDetailResponse> {
    return this.indents.get(id, actorIdOf(request), accessOf(request));
  }

  @Post()
  @RequirePermissions('purchase.indents.manage')
  create(
    @Body(new ZodValidationPipe(CreateIndentRequest)) body: CreateIndentRequest,
    @Req() request: Request,
  ): Promise<IndentResponse> {
    return this.indents.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('purchase.indents.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateIndentRequest)) body: UpdateIndentRequest,
    @Req() request: Request,
  ): Promise<IndentResponse> {
    return this.indents.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.indents.manage')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<IndentResponse> {
    return this.indents.submit(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.indents.approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ApproveIndentRequest)) body: ApproveIndentRequest,
    @Req() request: Request,
  ): Promise<IndentResponse> {
    return this.indents.approve(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.indents.approve')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RejectIndentRequest)) body: RejectIndentRequest,
    @Req() request: Request,
  ): Promise<IndentResponse> {
    return this.indents.reject(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.indents.manage')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CancelIndentRequest)) body: CancelIndentRequest,
    @Req() request: Request,
  ): Promise<IndentResponse> {
    return this.indents.cancel(id, body, actorIdOf(request), accessOf(request));
  }
}
