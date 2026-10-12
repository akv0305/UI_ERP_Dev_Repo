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
  CreateSiteRequest,
  CreateStoreRequest,
  SiteListQuery,
  UpdateSiteRequest,
  UpdateStoreRequest,
  type PagedSitesResponse,
  type SiteResponse,
  type StoreListResponse,
  type StoreResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SitesService } from './sites.service';
import { StoresService } from './stores.service';

@Controller()
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly stores: StoresService,
  ) {}

  @Get('sites')
  @RequirePermissions('masters.sitesAndStores.view')
  list(
    @Query(new ZodValidationPipe(SiteListQuery)) query: SiteListQuery,
  ): Promise<PagedSitesResponse> {
    return this.sites.list(query);
  }

  @Get('sites/:id')
  @RequirePermissions('masters.sitesAndStores.view')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<SiteResponse> {
    return this.sites.get(id);
  }

  @Post('sites')
  @RequirePermissions('masters.sitesAndStores.manage')
  create(
    @Body(new ZodValidationPipe(CreateSiteRequest)) body: CreateSiteRequest,
    @Req() request: Request,
  ): Promise<SiteResponse> {
    return this.sites.create(body, actorIdOf(request));
  }

  @Patch('sites/:id')
  @RequirePermissions('masters.sitesAndStores.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateSiteRequest)) body: UpdateSiteRequest,
    @Req() request: Request,
  ): Promise<SiteResponse> {
    return this.sites.update(id, body, actorIdOf(request));
  }

  @Post('sites/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.sitesAndStores.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<SiteResponse> {
    return this.sites.deactivate(id, actorIdOf(request));
  }

  @Post('sites/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.sitesAndStores.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<SiteResponse> {
    return this.sites.reactivate(id, actorIdOf(request));
  }

  @Get('sites/:id/stores')
  @RequirePermissions('masters.sitesAndStores.view')
  listStores(@Param('id', new ParseUUIDPipe()) id: string): Promise<StoreListResponse> {
    return this.stores.listForSite(id);
  }

  @Post('sites/:id/stores')
  @RequirePermissions('masters.sitesAndStores.manage')
  createStore(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateStoreRequest)) body: CreateStoreRequest,
    @Req() request: Request,
  ): Promise<StoreResponse> {
    return this.stores.create(id, body, actorIdOf(request));
  }

  @Patch('stores/:id')
  @RequirePermissions('masters.sitesAndStores.manage')
  updateStore(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateStoreRequest)) body: UpdateStoreRequest,
    @Req() request: Request,
  ): Promise<StoreResponse> {
    return this.stores.update(id, body, actorIdOf(request));
  }

  @Post('stores/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.sitesAndStores.manage')
  deactivateStore(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<StoreResponse> {
    return this.stores.deactivate(id, actorIdOf(request));
  }

  @Post('stores/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.sitesAndStores.manage')
  reactivateStore(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<StoreResponse> {
    return this.stores.reactivate(id, actorIdOf(request));
  }
}
