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
  CreateProjectRequest,
  ProjectListQuery,
  UpdateProjectRequest,
  type PagedProjectsResponse,
  type ProjectResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { actorIdOf } from '../auth/actor-id';
import { RequirePermissions } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions('masters.projects.view')
  list(
    @Query(new ZodValidationPipe(ProjectListQuery)) query: ProjectListQuery,
  ): Promise<PagedProjectsResponse> {
    return this.projects.list(query);
  }

  @Get(':id')
  @RequirePermissions('masters.projects.view')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProjectResponse> {
    return this.projects.get(id);
  }

  @Post()
  @RequirePermissions('masters.projects.manage')
  create(
    @Body(new ZodValidationPipe(CreateProjectRequest)) body: CreateProjectRequest,
    @Req() request: Request,
  ): Promise<ProjectResponse> {
    return this.projects.create(body, actorIdOf(request));
  }

  @Patch(':id')
  @RequirePermissions('masters.projects.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateProjectRequest)) body: UpdateProjectRequest,
    @Req() request: Request,
  ): Promise<ProjectResponse> {
    return this.projects.update(id, body, actorIdOf(request));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.projects.manage')
  deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ProjectResponse> {
    return this.projects.deactivate(id, actorIdOf(request));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.projects.manage')
  reactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request,
  ): Promise<ProjectResponse> {
    return this.projects.reactivate(id, actorIdOf(request));
  }
}
