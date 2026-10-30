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
  CancelComparisonRequest,
  ComparisonEnquiryOptionsQuery,
  ComparisonGridQuery,
  ComparisonListQuery,
  CreateComparisonRequest,
  UpdateComparisonRequest,
  type ComparisonDetailResponse,
  type ComparisonEnquiryOptionsResponse,
  type ComparisonGridResponse,
  type ComparisonResponse,
  type PagedComparisonsResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf, actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ComparisonsService } from './comparisons.service';

@Controller('comparisons')
export class ComparisonsController {
  constructor(private readonly comparisons: ComparisonsService) {}

  @Get()
  @RequirePermissions('purchase.comparisons.view')
  list(
    @Query(new ZodValidationPipe(ComparisonListQuery)) query: ComparisonListQuery,
    @Req() request: Request,
  ): Promise<PagedComparisonsResponse> {
    return this.comparisons.list(query, accessOf(request));
  }

  // Static routes before ':id'.
  @Get('enquiry-options')
  @RequirePermissions('purchase.comparisons.manage')
  enquiryOptions(
    @Query(new ZodValidationPipe(ComparisonEnquiryOptionsQuery))
    query: ComparisonEnquiryOptionsQuery,
    @Req() request: Request,
  ): Promise<ComparisonEnquiryOptionsResponse> {
    return this.comparisons.enquiryOptions(query, accessOf(request));
  }

  @Get('grid')
  @RequirePermissions('purchase.comparisons.manage')
  grid(
    @Query(new ZodValidationPipe(ComparisonGridQuery)) query: ComparisonGridQuery,
    @Req() request: Request,
  ): Promise<ComparisonGridResponse> {
    return this.comparisons.grid(query, accessOf(request));
  }

  @Get(':id')
  @RequirePermissions('purchase.comparisons.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ComparisonDetailResponse> {
    return this.comparisons.get(id, accessOf(request));
  }

  @Post()
  @RequirePermissions('purchase.comparisons.manage')
  create(
    @Body(new ZodValidationPipe(CreateComparisonRequest)) body: CreateComparisonRequest,
    @Req() request: Request,
  ): Promise<ComparisonResponse> {
    return this.comparisons.create(body, actorIdOf(request), accessOf(request));
  }

  @Patch(':id')
  @RequirePermissions('purchase.comparisons.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateComparisonRequest)) body: UpdateComparisonRequest,
    @Req() request: Request,
  ): Promise<ComparisonResponse> {
    return this.comparisons.update(id, body, actorIdOf(request), accessOf(request));
  }

  @Post(':id/finalise')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.comparisons.manage')
  finalise(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ComparisonResponse> {
    return this.comparisons.finalise(id, actorIdOf(request), accessOf(request));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase.comparisons.manage')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CancelComparisonRequest)) body: CancelComparisonRequest,
    @Req() request: Request,
  ): Promise<ComparisonResponse> {
    return this.comparisons.cancel(id, body, actorIdOf(request), accessOf(request));
  }
}
