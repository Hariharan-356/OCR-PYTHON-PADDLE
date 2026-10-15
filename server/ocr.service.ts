import { Inject, Injectable } from '@nestjs/common';
import { ClaimsService } from './claims.service';
import { uid } from '../lib/data';

export interface OcrFileInput {
  name: string;
  path: string;
  size: number;
  mimetype?: string;
}

export interface OcrJobResult {
  claimId?: string;
  facts?: Record<string, any>;
  documents?: any[];
  lineItems?: any[];
  diagnoses?: any[];
  procedures?: any[];
  warnings?: any[];
  metadata?: Record<string, any>;
}

export interface OcrJobStatus {
  jobId: string;
  remoteJobId?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'needs_review';
  progress?: number;
  result?: OcrJobResult;
  error?: string;
}

@Injectable()
export class OcrService {
  private readonly baseUrl = process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001';
  private readonly secret = process.env.OCR_SERVICE_SECRET || 'claims-digi-local';
  private readonly jobs = new Map<string, OcrJobStatus>();

  constructor(@Inject(ClaimsService) private readonly claimsService: ClaimsService) {}

  static mapResultToClaim(result: OcrJobResult, defaultClaimId?: string): any {
    const claimId = result.claimId || defaultClaimId || `CLM-${Date.now()}`;
    const facts = result.facts || {};
    const normalizeSourceName = (value: any): string => {
      const trimmed = String(value ?? '').trim();
      if (!trimmed || /^ocr$/i.test(trimmed)) {
        return '';
      }
      return trimmed;
    };
    const docs = (result.documents || []).map((doc: any, idx: number) => ({
      id: doc.id || uid(`DOC-${idx + 1}`),
      name: doc.name || `Document ${idx + 1}`,
      type: doc.type || 'Unclassified',
      source: normalizeSourceName(doc.source) || normalizeSourceName(doc.name) || 'OCR',
      size: doc.size || '0.0 MB',
      ext: doc.ext || (String(doc.name || '').split('.').pop() || 'pdf').toLowerCase(),
      uploaded: new Date().toISOString(),
      ocrStatus: doc.ocrStatus || 'Completed',
      handwritten: !!doc.handwritten,
      language: doc.language || 'English',
      pages: Array.isArray(doc.pages) && doc.pages.length
        ? doc.pages
        : [{ n: 1, cls: doc.type || 'Unclassified', conf: doc.conf || 88, label: doc.type || 'Unclassified' }],
      fields: Array.isArray(doc.fields) ? doc.fields : [],
      detections: Array.isArray(doc.detections) ? doc.detections : [],
      medical: doc.medical !== undefined ? !!doc.medical : true,
      validated: !!doc.validated,
      masked: !!doc.masked,
    }));

    const normalizeValue = (value: any): string => {
      const trimmed = String(value ?? '').trim();
      if (!trimmed) return '';
      const lower = trimmed.toLowerCase();
      if (/(unidentified|unknown|not available|n\/a|not provided)/i.test(lower)) {
        return '';
      }
      return trimmed;
    };

    const findFieldValue = (patterns: RegExp[], fallback = ''): string => {
      for (const doc of docs) {
        for (const field of doc.fields || []) {
          const label = String(field.label || '').toLowerCase();
          if (patterns.some(pattern => pattern.test(label))) {
            const value = normalizeValue(field.value);
            if (value) return value;
          }
        }
      }
      return normalizeValue(fallback);
    };

    const derivedPatient = findFieldValue([/patient\s+name|name\s+of\s+the\s+patient|claimant\s+name/], facts.patient) || 'Unidentified claimant';
    const derivedHospital = findFieldValue([/name\s+of\s+the\s+hospital|name\s+of\s+biller|hospital\s+name|biller\s+name/], facts.hospital) || 'Unidentified hospital';
    const derivedCity = findFieldValue([/address\s+of\s+biller|hospital\s+address|city/], facts.city) || '';

    const lineItems = Array.isArray(result.lineItems) ? result.lineItems : [];
    const diagnoses = Array.isArray(result.diagnoses) ? result.diagnoses : [];
    const procedures = Array.isArray(result.procedures) ? result.procedures : [];
    const lowFieldCount = docs.reduce(
      (count, doc) => count + (doc.fields || []).filter((field: any) => Number(field.conf || 0) < 85).length,
      0
    );
    const hasWarnings = Array.isArray(result.warnings) && result.warnings.length > 0;

    const status = lowFieldCount > 0 || hasWarnings ? 'In review' : 'Processing';
    const totalBilled = Number(facts.billed || lineItems.reduce((sum, li) => sum + Number(li.net || li.gross || 0), 0) || 0);
    const sourceName = Array.from(new Set(
      (docs || [])
        .map((doc: any) => normalizeSourceName(doc.source) || normalizeSourceName(doc.name))
        .filter(Boolean),
    )).join(', ') || 'OCR';

    const claim: any = {
      id: claimId,
      patient: derivedPatient,
      memberId: facts.memberId || '',
      policy: facts.policy || '',
      providerId: facts.providerId || 'PRV-001',
      hospital: derivedHospital,
      city: derivedCity || '',
      admission: facts.admission || '',
      discharge: facts.discharge || '',
      admissionISO: facts.admissionISO || '',
      source: sourceName,
      receivedAt: new Date().toISOString(),
      status,
      stage: lowFieldCount > 0 ? 2 : 3,
      lob: 'Group Health',
      claimType: 'Cashless',
      billed: totalBilled,
      docs,
      facts: {
        ...facts,
        patient: derivedPatient,
        gender: facts.gender || '',
        age: facts.age || 0,
        dob: facts.dob || '',
        phone: facts.phone || '',
        memberId: facts.memberId || '',
        policy: facts.policy || '',
        hospital: derivedHospital,
        city: derivedCity || facts.city || '',
        rohini: facts.rohini || '',
        doctor: facts.doctor || '',
        admission: facts.admission || '',
        discharge: facts.discharge || '',
        admissionISO: facts.admissionISO || '',
        los: facts.los || 0,
        icuDays: facts.icuDays || 0,
        billed: totalBilled,
      },
      diagnoses,
      procedures,
      icpSummary: facts.icpSummary || `OCR extracted ${docs.length} document(s) for ${facts.patient || 'the claimant'}.`,
      lineItems,
      tariffVersionId: null,
      tariffOverride: false,
      matchOverrides: {},
      decisions: {},
      escalations: [],
      audit: [
        {
          id: uid('AUD'),
          ts: new Date().toISOString(),
          user: 'system',
          entity: 'Document',
          action: 'Ingested',
          detail: `${docs.length} document(s) processed via OCR service`,
        },
        ...(Array.isArray(result.warnings) ? result.warnings.map((w: any, idx: number) => ({
          id: uid(`WRN-${idx + 1}`),
          ts: new Date().toISOString(),
          user: 'system',
          entity: 'Field',
          action: 'Warning',
          detail: w,
        })) : []),
      ],
      notes: Array.isArray(result.warnings) ? result.warnings.slice(0, 10) : [],
      claimCore: {
        status: 'Not pushed',
        attempts: 0,
        history: [],
        idempotencyKey: null,
      },
      assignee: null,
      ocrFallback: result.metadata || {},
      reviewer: 'Rahul Patel',
    };

    return claim;
  }

  async enqueue(files: OcrFileInput[], claimId?: string): Promise<OcrJobStatus> {
    const jobId = `ocr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const job: OcrJobStatus = {
      jobId,
      status: 'queued',
      progress: 0,
    };
    this.jobs.set(jobId, job);

    try {
      const payload = {
        claimId,
        files: files.map(file => ({
          name: file.name,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype || 'application/octet-stream',
        })),
      };

      const response = await fetch(`${this.baseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-shared-secret': this.secret,
        },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.detail || 'OCR service rejected the job');
      }

      const created = body as OcrJobStatus;
      const remoteJobId = created.jobId || jobId;
      this.jobs.set(jobId, {
        ...job,
        jobId,
        remoteJobId,
        status: created.status || 'queued',
        progress: created.progress || 0,
      });

      setTimeout(() => {
        this.poll(jobId).catch(() => {});
      }, 1200);

      return this.jobs.get(jobId) || job;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR service unavailable';
      this.jobs.set(jobId, {
        ...job,
        status: 'failed',
        error: message,
      });
      return this.jobs.get(jobId) || job;
    }
  }

  async getJobStatus(jobId: string): Promise<OcrJobStatus | null> {
    const trackedJob = this.jobs.get(jobId);
    if (trackedJob) {
      return trackedJob;
    }

    try {
      const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
        headers: { 'x-shared-secret': this.secret },
      });
      if (!response.ok) {
        return null;
      }
      const body = await response.json();
      const normalized = { ...body, jobId: body.jobId || jobId } as OcrJobStatus;
      this.jobs.set(jobId, normalized);
      return normalized;
    } catch {
      return null;
    }
  }

  async getResult(jobId: string): Promise<OcrJobResult | null> {
    const trackedJob = this.jobs.get(jobId);
    const remoteJobId = trackedJob?.remoteJobId || jobId;
    try {
      const response = await fetch(`${this.baseUrl}/jobs/${remoteJobId}/result`, {
        headers: { 'x-shared-secret': this.secret },
      });
      if (!response.ok) {
        return null;
      }
      const body = await response.json();
      return body as OcrJobResult;
    } catch {
      return null;
    }
  }

  private async poll(jobId: string): Promise<void> {
    const trackedJob = this.jobs.get(jobId);
    const remoteJobId = trackedJob?.remoteJobId || jobId;
    try {
      const response = await fetch(`${this.baseUrl}/jobs/${remoteJobId}`, {
        headers: { 'x-shared-secret': this.secret },
      });
      if (!response.ok) {
        return;
      }
      const job = await response.json() as OcrJobStatus;
      this.jobs.set(jobId, {
        ...(trackedJob || { jobId, status: 'queued' }),
        ...job,
        jobId,
        remoteJobId: job.jobId || remoteJobId,
      });

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'needs_review') {
        const result = job.result || await this.getResult(jobId);
        if (result && result.documents && result.documents.length > 0) {
          const claim = OcrService.mapResultToClaim(result, result.claimId);
          const existing = this.claimsService.getAllClaims().find(c => c.id === claim.id);
          if (existing) {
            this.claimsService.updateClaim(claim.id, claim);
          } else {
            this.claimsService.createClaim(claim);
          }
        }
        return;
      }

      setTimeout(() => {
        this.poll(jobId).catch(() => {});
      }, 1500);
    } catch {
      // Ignore transient polling failures and retry on the next tick.
    }
  }
}
