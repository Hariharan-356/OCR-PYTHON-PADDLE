import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';

import { ClaimsController } from './claims.controller';
import { OcrService } from './ocr.service';
import { USERS, ROLES } from '../lib/data';

const sampleResult = {
  claimId: 'CLM-OCR-TEST',
  facts: {
    patient: 'Rahul Kumar',
    memberId: 'MEM-7841203',
    policy: 'GHP-2026-0044817',
    hospital: 'Apollo Hospitals, Chennai',
    city: 'Chennai',
    admission: '16-09-2026',
    discharge: '21-09-2026',
    admissionISO: '2026-09-16',
    billed: 150000,
  },
  documents: [
    {
      id: 'DOC-1',
      name: 'FormC_PreAuth_RahulKumar.pdf',
      type: 'Pre-Auth Form (Form C)',
      pages: [{ n: 1, cls: 'Pre-Auth Form (Form C)', conf: 92, label: 'Pre-Auth Form (Form C)' }],
      fields: [
        {
          id: 'FLD-1',
          section: 'Insured / patient',
          label: 'Name of the patient',
          value: 'Rahul Kumar',
          conf: 94,
          original: 'Rahul Kumar',
          verified: false,
          history: [],
        },
      ],
      detections: ['stamp'],
      medical: true,
      validated: false,
      handwritten: false,
      language: 'English',
      ocrStatus: 'Completed',
      source: 'OCR',
      size: '2.4 MB',
      ext: 'pdf',
      uploaded: new Date().toISOString(),
    },
  ],
  lineItems: [{
    id: 'LI-1',
    bill: 'Hospital Bill',
    desc: 'Registration charges',
    code: 'ADM-01',
    qty: 1,
    unit: 'per admission',
    unitPrice: 500,
    gross: 500,
    discount: 0,
    net: 500,
    category: 'Admin',
    medical: false,
    date: '2026-09-16',
  }],
  diagnoses: [],
  procedures: [],
  warnings: ['One low-conf field kept for review'],
};

test('API root exposes the backend contract', () => {
  const controller = new ClaimsController({} as any, {} as any);
  const root = controller.getApiRoot();

  assert.equal(root.name, 'ClaimsDigi API');
  assert.equal(root.status, 'ok');
  assert.ok(Array.isArray(root.endpoints));
});

test('OCR mapping preserves claim/doc/field shape expected by the frontend', () => {
  const claim = OcrService.mapResultToClaim(sampleResult, 'CLM-OCR-TEST');
  assert.equal(claim.patient, 'Rahul Kumar');
  assert.equal(claim.docs[0].type, 'Pre-Auth Form (Form C)');
  assert.equal(claim.docs[0].fields[0].label, 'Name of the patient');
  assert.equal(claim.status, 'In review');
  assert.equal(claim.lineItems[0].code, 'ADM-01');
  assert.equal(claim.source, 'FormC_PreAuth_RahulKumar.pdf');
  assert.ok(Array.isArray(claim.audit));
});

test('The sidebar user switch starts with a populated role roster', () => {
  assert.ok(Array.isArray(USERS) && USERS.length > 0);
  assert.deepEqual(ROLES, ['Claims Processor', 'Team Lead', 'Network Manager', 'Compliance', 'Admin']);
  assert.ok(USERS.some(user => user.role === 'Claims Processor'));
  assert.ok(USERS.every(user => user.status === 'Active' || user.status === 'Inactive'));
});

test('OCR result mapping falls back to the extracted biller name when the hospital field is empty', () => {
  const claim = OcrService.mapResultToClaim({
    claimId: 'CLM-FALLBACK-1',
    facts: {
      patient: 'Karan Mehta',
      memberId: 'MEM-9001',
      policy: 'GHP-2026-001',
      hospital: '',
      city: 'Chennai',
      admission: '2026-10-10',
      discharge: '2026-10-13',
      admissionISO: '2026-10-10',
      billed: 134030,
    },
    documents: [{
      id: 'DOC-FALLBACK-1',
      name: 'hospital_bill.pdf',
      type: 'Hospital Bill',
      fields: [{
        id: 'FLD-1',
        section: 'Biller',
        label: 'Name of biller',
        value: 'Apollo Hospitals, Chennai',
        conf: 99,
        original: 'Apollo Hospitals, Chennai',
        verified: false,
        history: [],
      }],
      detections: ['stamp'],
      medical: true,
      validated: false,
      handwritten: false,
      language: 'English',
      ocrStatus: 'Completed',
      source: 'OCR',
      size: '1.1 MB',
      ext: 'pdf',
      uploaded: new Date().toISOString(),
    }],
    lineItems: [],
    diagnoses: [],
    procedures: [],
  }, 'CLM-FALLBACK-1');

  assert.equal(claim.hospital, 'Apollo Hospitals, Chennai');
  assert.equal(claim.facts.hospital, 'Apollo Hospitals, Chennai');
});

test('OCR result mapping ignores generic placeholder hospital names when a real biller is present', () => {
  const claim = OcrService.mapResultToClaim({
    claimId: 'CLM-FALLBACK-2',
    facts: {
      patient: 'Karan Mehta',
      memberId: 'MEM-9002',
      policy: 'GHP-2026-002',
      hospital: 'Unidentified hospital',
      city: 'Chennai',
      admission: '2026-10-10',
      discharge: '2026-10-13',
      admissionISO: '2026-10-10',
      billed: 134030,
    },
    documents: [{
      id: 'DOC-FALLBACK-2',
      name: 'hospital_bill.pdf',
      type: 'Hospital Bill',
      fields: [{
        id: 'FLD-2',
        section: 'Biller',
        label: 'Name of biller',
        value: 'Apollo Hospitals, Chennai',
        conf: 99,
        original: 'Apollo Hospitals, Chennai',
        verified: false,
        history: [],
      }],
      detections: ['stamp'],
      medical: true,
      validated: false,
      handwritten: false,
      language: 'English',
      ocrStatus: 'Completed',
      source: 'OCR',
      size: '1.1 MB',
      ext: 'pdf',
      uploaded: new Date().toISOString(),
    }],
    lineItems: [],
    diagnoses: [],
    procedures: [],
  }, 'CLM-FALLBACK-2');

  assert.equal(claim.hospital, 'Apollo Hospitals, Chennai');
  assert.equal(claim.facts.hospital, 'Apollo Hospitals, Chennai');
});

test('OCR enqueue keeps the remote OCR job id for polling and result fetches', async () => {
  const service = new OcrService({
    getAllClaims: () => [],
    createClaim: () => undefined,
    updateClaim: () => undefined,
  } as any);

  const originalFetch = global.fetch;
  const calls: string[] = [];
  global.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/jobs')) {
      return {
        ok: true,
        json: async () => ({ jobId: 'job-remote-123', status: 'queued', progress: 0 }),
      } as any;
    }
    if (url.endsWith('/jobs/job-remote-123')) {
      return {
        ok: true,
        json: async () => ({ jobId: 'job-remote-123', status: 'completed', progress: 100 }),
      } as any;
    }
    if (url.endsWith('/jobs/job-remote-123/result')) {
      return {
        ok: true,
        json: async () => ({ claimId: 'CLM-OCR-TEST', facts: { patient: 'Rahul' }, documents: [] }),
      } as any;
    }
    return { ok: false, json: async () => ({}) } as any;
  };

  try {
    const result = await service.enqueue([
      { name: 'bill.pdf', path: 'uploads/bill.pdf', size: 42, mimetype: 'application/pdf' },
    ], 'CLM-OCR-TEST');

    await new Promise(resolve => setTimeout(resolve, 1600));

    assert.equal(result.status, 'queued');
    assert.equal(result.remoteJobId, 'job-remote-123');
    assert.deepEqual(calls.filter(url => url.includes('/jobs')), [
      'http://127.0.0.1:8001/jobs',
      'http://127.0.0.1:8001/jobs/job-remote-123',
      'http://127.0.0.1:8001/jobs/job-remote-123/result',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('upload creates a pending claim immediately so the user sees it without waiting for OCR completion', async () => {
  const createdClaims: any[] = [];
  const controller = new ClaimsController({
    saveDocumentRecord: () => undefined,
    createClaim: (claim: any) => {
      createdClaims.push(claim);
      return claim;
    },
    getAllClaims: () => [],
    getClaimById: () => null,
  } as any, {
    enqueue: async () => ({ jobId: 'job-123', status: 'queued', progress: 0 }),
  } as any);

  const files = [{
    originalname: 'Hospital_Bill.pdf',
    filename: 'upload-1.pdf',
    path: 'uploads/upload-1.pdf',
    size: 42,
    mimetype: 'application/pdf',
    destination: 'uploads',
    encoding: '7bit',
  }] as any[];

  const response = await controller.uploadFiles(files, 'CLM-IMMEDIATE');

  assert.equal(response.success, true);
  assert.equal(createdClaims.length, 1);
  assert.equal(createdClaims[0].id, 'CLM-IMMEDIATE');
  assert.equal(createdClaims[0].status, 'Processing');
  assert.equal(createdClaims[0].source, 'Hospital_Bill.pdf');
});

test('upload tolerates a missing claim lookup instead of crashing the upload flow', async () => {
  const createdClaims: any[] = [];
  const controller = new ClaimsController({
    saveDocumentRecord: () => undefined,
    createClaim: (claim: any) => {
      createdClaims.push(claim);
      return claim;
    },
    getAllClaims: () => [],
    getClaimById: () => {
      throw new NotFoundException('Claim not found');
    },
  } as any, {
    enqueue: async () => ({ jobId: 'job-456', status: 'queued', progress: 0 }),
  } as any);

  const files = [{
    originalname: 'Rotated_PDF.pdf',
    filename: 'upload-2.pdf',
    path: 'uploads/upload-2.pdf',
    size: 42,
    mimetype: 'application/pdf',
    destination: 'uploads',
    encoding: '7bit',
  }] as any[];

  const response = await controller.uploadFiles(files, 'CLM-ROTATED');

  assert.equal(response.success, true);
  assert.equal(createdClaims.length, 1);
  assert.equal(createdClaims[0].id, 'CLM-ROTATED');
  assert.equal(createdClaims[0].source, 'Rotated_PDF.pdf');
});
