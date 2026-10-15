import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ITEM_IMPORT_MAX_FILE_BYTES,
  ITEM_IMPORT_MAX_ROWS,
  ItemImportCheckRequest,
  type ItemImportCheckResponse,
  type ItemImportPreviewResponse,
} from '@uie/contracts';
import type { Request } from 'express';
import { accessOf } from '../../auth/actor-id';
import { RequirePermissions } from '../../auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { importFileInvalid, importFileRequired } from './item-import-errors';
import { ItemImportService } from './item-import.service';
import { readWorkbook } from './xlsx-reader';

/** The parts of the uploaded file we use (kept in memory only; nothing is stored, PD-042). */
interface UploadedXlsx {
  originalname: string;
  size: number;
  buffer: Buffer;
}

@Controller('items/import')
export class ItemImportController {
  constructor(private readonly imports: ItemImportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ITEM_IMPORT_MAX_FILE_BYTES, files: 1 } }),
  )
  preview(
    @UploadedFile() file: UploadedXlsx | undefined,
    @Req() request: Request,
  ): Promise<ItemImportPreviewResponse> {
    if (file === undefined || file.size === 0) {
      throw importFileRequired();
    }

    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw importFileInvalid();
    }

    return this.imports.preview(accessOf(request), () =>
      readWorkbook(file.buffer, ITEM_IMPORT_MAX_ROWS),
    );
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('masters.items.manage')
  check(
    @Body(new ZodValidationPipe(ItemImportCheckRequest)) body: ItemImportCheckRequest,
    @Req() request: Request,
  ): Promise<ItemImportCheckResponse> {
    return this.imports.check(body, accessOf(request));
  }
}
