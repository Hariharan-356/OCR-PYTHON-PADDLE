import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
  Res,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import type { Response } from 'express';
import * as fs from 'fs';
import { ClaimsService } from './claims.service';
import { uid } from '../lib/data';

@Controller('api')
export class ClaimsController {
  constructor(@Inject(ClaimsService) private readonly claimsService: ClaimsService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'Healthy',
      timestamp: new Date().toISOString(),
      database: 'SQLite (data/claims.db)',
      storage: 'Local filesystem (uploads/)',
    };
  }

  @Get('claims')
  getAllClaims() {
    return this.claimsService.getAllClaims();
  }

  @Get('claims/:id')
  getClaimById(@Param('id') id: string) {
    return this.claimsService.getClaimById(id);
  }

  @Post('claims')
  createClaim(@Body() claim: any) {
    return this.claimsService.createClaim(claim);
  }

  @Put('claims/:id')
  updateClaim(@Param('id') id: string, @Body() claimData: any) {
    return this.claimsService.updateClaim(id, claimData);
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
          const ext = extname(file.originalname);
          cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
    })
  )
  uploadFiles(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body('claimId') claimId?: string
  ) {
    const uploadedDocs = (files || []).map(file => {
      const docId = uid('DOC');
      const targetClaimId = claimId || 'PENDING';
      const ext = extname(file.originalname).replace(/^\./, '').toLowerCase();

      this.claimsService.saveDocumentRecord({
        id: docId,
        claimId: targetClaimId,
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        filePath: file.path,
        fileExt: ext,
        ocrStatus: 'Completed',
        docType: file.originalname.includes('Bill')
          ? 'Hospital Bill'
          : file.originalname.includes('Discharge')
          ? 'Discharge Summary'
          : 'Pre-Auth Form (Form C)',
        metadata: {
          destination: file.destination,
          encoding: file.encoding,
        },
      });

      return {
        id: docId,
        name: file.originalname,
        filename: file.filename,
        size: (file.size / 1048576).toFixed(1) + ' MB',
        sizeBytes: file.size,
        path: file.path,
        ext,
      };
    });

    return {
      success: true,
      count: uploadedDocs.length,
      files: uploadedDocs,
    };
  }

  @Get('documents/:id/file')
  serveFile(@Param('id') id: string, @Res() res: any) {
    const doc = this.claimsService.getDocumentRecord(id) as any;
    if (!doc || !doc.filePath || !fs.existsSync(doc.filePath)) {
      throw new NotFoundException(`File for document ${id} not found on local filesystem`);
    }
    return res.sendFile(doc.filePath);
  }

  @Get('providers')
  getProviders() {
    return this.claimsService.getProviders();
  }

  @Get('rules')
  getRules() {
    return this.claimsService.getRules();
  }

  @Put('rules')
  updateRules(@Body() rules: any) {
    return this.claimsService.updateRules(rules);
  }

  @Get('logs')
  getLogs() {
    return this.claimsService.getSystemLogs();
  }
}
