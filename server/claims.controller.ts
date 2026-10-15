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
import { OcrService } from './ocr.service';

@Controller('api')
export class ClaimsController {
  constructor(
    @Inject(ClaimsService) private readonly claimsService: ClaimsService,
    @Inject(OcrService) private readonly ocrService: OcrService,
  ) {}

  @Get()
  getApiRoot() {
    return {
      name: 'ClaimsDigi API',
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints: [
        'GET /api',
        'GET /api/health',
        'GET /api/claims',
        'GET /api/claims/:id',
        'POST /api/claims',
        'PUT /api/claims/:id',
        'POST /api/upload',
        'GET /api/ocr/jobs/:jobId',
        'GET /api/ocr/results/:jobId',
      ],
    };
  }

  @Get('health')
  async getHealth() {
    const baseUrl = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001';
    let ocrService: { status: string; detail?: string; version?: string } = { status: 'Unavailable', detail: 'OCR service check failed' };

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        const body = await response.json();
        ocrService = {
          status: body?.status || 'Healthy',
          detail: 'OCR worker is reachable',
          version: body?.version,
        };
      }
    } catch {
      ocrService = { status: 'Unavailable', detail: 'OCR service unreachable' };
    }

    return {
      status: 'Healthy',
      timestamp: new Date().toISOString(),
      database: 'SQLite (data/claims.db)',
      storage: 'Local filesystem (uploads/)',
      ocrService,
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
  async uploadFiles(
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
        ocrStatus: 'Queued',
        docType: 'Unclassified',
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

    const targetClaimId = claimId || uid('CLM');
    let targetClaimExists = false;
    try {
      this.claimsService.getClaimById?.(targetClaimId);
      targetClaimExists = true;
    } catch {
      targetClaimExists = false;
    }

    if (!targetClaimExists) {
      const now = new Date().toISOString();
      const sourceName = uploadedDocs.map(doc => doc.name).join(', ') || 'Manual upload';
      this.claimsService.createClaim({
        id: targetClaimId,
        patient: 'OCR in progress',
        memberId: '',
        policy: '',
        providerId: 'PRV-001',
        hospital: '',
        city: '',
        admission: '',
        discharge: '',
        admissionISO: '',
        source: sourceName,
        receivedAt: now,
        status: 'Processing',
        stage: 1,
        lob: 'Group Health',
        claimType: 'Cashless',
        billed: 0,
        docs: [],
        facts: {
          patient: 'OCR in progress',
          memberId: '',
          policy: '',
          hospital: '',
          city: '',
          admission: '',
          discharge: '',
          admissionISO: '',
          billed: 0,
        },
        diagnoses: [],
        procedures: [],
        lineItems: [],
        audit: [],
        notes: ['Upload received. OCR is processing the document set.'],
        claimCore: {
          status: 'Processing',
          attempts: 0,
          history: [],
          idempotencyKey: null,
        },
        assignee: null,
        reviewer: 'Rahul Patel',
        ocrFallback: { status: 'queued' },
      } as any);
    }

    const result = await this.ocrService.enqueue(
      (files || []).map(file => ({
        name: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
      })),
      targetClaimId
    );

    return {
      success: true,
      count: uploadedDocs.length,
      jobId: result.jobId,
      claimId: targetClaimId,
      status: result.status,
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

  @Get('ocr/jobs/:jobId')
  async getOcrJobStatus(@Param('jobId') jobId: string) {
    const job = await this.ocrService.getJobStatus(jobId);
    if (!job) {
      throw new NotFoundException(`OCR job ${jobId} not found`);
    }
    return job;
  }

  @Get('ocr/results/:jobId')
  async getOcrJobResult(@Param('jobId') jobId: string) {
    const result = await this.ocrService.getResult(jobId);
    if (!result) {
      throw new NotFoundException(`OCR result for ${jobId} not found`);
    }
    return result;
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
