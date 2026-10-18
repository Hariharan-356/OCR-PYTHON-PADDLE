import fs from 'node:fs';
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

test('OCR text parser extracts common hospital-bill fields using real label patterns', () => {
  const service = new OcrService({
    getAllClaims: () => [],
    createClaim: () => undefined,
    updateClaim: () => undefined,
  } as any);

  const result = (service as any).buildResultFromText('hospital_bill.pdf', 'uploads/hospital_bill.pdf', [
    'Name of the Hospital: Apollo Hospitals, Chennai',
    'Name of the patient: Sandeep Sharma',
    'Member ID: MEM-7781203',
    'Policy No.: GHP-2026-009090',
    'Date of Admission: 12/09/2026',
    'Date of Discharge: 18/09/2026',
    'Total Amount Paid: Rs 1,46,250.00',
  ].join('\n'));

  assert.equal(result.facts.hospital, 'Apollo Hospitals, Chennai');
  assert.equal(result.facts.patient, 'Sandeep Sharma');
  assert.equal(result.facts.memberId, 'MEM-7781203');
  assert.equal(result.facts.policy, 'GHP-2026-009090');
  assert.equal(result.facts.admission, '12/09/2026');
  assert.equal(result.facts.discharge, '18/09/2026');
  assert.equal(result.facts.billed, 146250);
});

test('OCR prefers Google Document AI when configured and falls back to Tesseract otherwise', async () => {
  const service = new OcrService({
    getAllClaims: () => [],
    createClaim: () => undefined,
    updateClaim: () => undefined,
  } as any);

  const previousEnv = { ...process.env };
  const previousFetch = globalThis.fetch;
  const tempPath = 'report.pdf';

  process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID = 'demo-project';
  process.env.GOOGLE_DOCUMENT_AI_LOCATION = 'us';
  process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID = 'demo-processor';
  process.env.GOOGLE_DOCUMENT_AI_API_KEY = 'demo-api-key';

  fs.writeFileSync(tempPath, 'dummy pdf content');

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /demo-project/);
    return {
      ok: true,
      async json() {
        return {
          document: {
            text: 'Name of the patient: Rahul Kumar\nPolicy No.: GHP-2026-777777',
          },
        };
      },
    } as Response;
  };

  try {
    const text = await (service as any).recognizeFile(tempPath);
    assert.match(text, /Rahul Kumar/);
    assert.match(text, /GHP-2026-777777/);
  } finally {
    process.env = previousEnv;
    globalThis.fetch = previousFetch;
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
});

test('OCR text parser extracts hospital address from alias labels and retains the full address value', () => {
  const service = new OcrService({
    getAllClaims: () => [],
    createClaim: () => undefined,
    updateClaim: () => undefined,
  } as any);

  const result = (service as any).buildResultFromText('hospital_bill.pdf', 'uploads/hospital_bill.pdf', [
    'Name of the Hospital: Apollo Hospitals, Chennai',
    'Hospital Address: No. 21, Greams Road, Chennai, Tamil Nadu - 600006',
    'Name of the patient: Sandeep Sharma',
    'Member ID: MEM-7781203',
    'Policy No.: GHP-2026-009090',
    'Date of Admission: 12/09/2026',
    'Date of Discharge: 18/09/2026',
    'Total Amount Paid: Rs 1,46,250.00',
  ].join('\n'));

  assert.equal(result.facts.hospital, 'Apollo Hospitals, Chennai');
  assert.equal(result.facts.hospAddress, 'No. 21, Greams Road, Chennai, Tamil Nadu - 600006');
  const addressField = result.documents[0].fields.find((field: any) => field.label === 'Address of biller');
  assert.ok(addressField);
  assert.equal(addressField.value, 'No. 21, Greams Road, Chennai, Tamil Nadu - 600006');
});

test('OCR text parser keeps full multi-line hospital addresses together', () => {
  const service = new OcrService({
    getAllClaims: () => [],
    createClaim: () => undefined,
    updateClaim: () => undefined,
  } as any);

  const result = (service as any).buildResultFromText('hospital_bill.pdf', 'uploads/hospital_bill.pdf', [
    'Name of the Hospital: Greenfield General Hospital',
    'Hospital Address:',
    '78, 100 Feet Road, Indiranagar, Bengaluru, Karnataka - 560038',
    'Name of the patient: Ananya Iyer',
    'Member ID: MEM-7781203',
    'Policy No.: GHP-2026-009090',
    'Date of Admission: 21/10/2026',
    'Date of Discharge: 25/10/2026',
    'Total Amount Paid: Rs 61,425.00',
  ].join('\n'));

  const expected = '78, 100 Feet Road, Indiranagar, Bengaluru, Karnataka - 560038';
  assert.equal(result.facts.hospAddress, expected);
  const addressField = result.documents[0].fields.find((field: any) => field.label === 'Address of biller');
  assert.ok(addressField);
  assert.equal(addressField.value, expected);
});

test('OCR text parser accepts real-world alias labels used by different hospitals', () => {
  const service = new OcrService({
    getAllClaims: () => [],
    createClaim: () => undefined,
    updateClaim: () => undefined,
  } as any);

  const result = (service as any).buildResultFromText('sample_bill.pdf', 'uploads/sample_bill.pdf', [
    'Hospital Name: Sunrise Multispeciality Hospital',
    'Patient Name: Hariharan',
    'UHID / Member Number: M-99011234',
    'Policy Number: 29AABCA0000X1ZQ',
    'Admission Date: 14/10/2026',
    'Discharge Date: 16/10/2026',
    'Final Settlement Amount: Rs 52,500.00',
  ].join('\n'));

  assert.equal(result.facts.hospital, 'Sunrise Multispeciality Hospital');
  assert.equal(result.facts.patient, 'Hariharan');
  assert.equal(result.facts.memberId, 'M-99011234');
  assert.equal(result.facts.policy, '29AABCA0000X1ZQ');
  assert.equal(result.facts.admission, '14/10/2026');
  assert.equal(result.facts.discharge, '16/10/2026');
  assert.equal(result.facts.billed, 52500);
});

test('OCR text parser captures the attached hospital bill layout without swallowing the next field', () => {
  const service = new OcrService({
    getAllClaims: () => [],
    createClaim: () => undefined,
    updateClaim: () => undefined,
  } as any);

  const result = (service as any).buildResultFromText('sunrise_bill.pdf', 'uploads/sunrise_bill.pdf', [
    'Sunrise Multispeciality Hospital',
    '45, Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu - 641004',
    'Hospital Reg. No.: TN/CBE/HOS/2014/08721 | GST No.: 29AABCA0000X1ZQ',
    'HOSPITAL BILL',
    'Bill No. HB/2026/600112 Bill Date 2026-10-16',
    'Name of Patient Hariharan Treating Doctor Dr. Rajesh Kumar, MS (Ortho)',
    'Date of Admission 14/10/2026 Date of Discharge 16/10/2026',
    'Gross Amount 52,000.00',
    'Discount 2,000.00',
    'GST Amount (5%) 2,500.00',
    'Total Amount Paid 52,500.00',
  ].join('\n'));

  assert.equal(result.facts.hospital, 'Sunrise Multispeciality Hospital');
  assert.equal(result.facts.patient, 'Hariharan');
  assert.equal(result.facts.admission, '14/10/2026');
  assert.equal(result.facts.discharge, '16/10/2026');
  assert.equal(result.facts.billed, 52500);
  assert.equal(result.facts.billNo, 'HB/2026/600112');
  assert.equal(result.facts.billDate, '2026-10-16');
});

test('OCR text parser handles the Indian multi-column hospital bill layout in the screenshot', () => {
  const service = new OcrService({
    getAllClaims: () => [],
    createClaim: () => undefined,
    updateClaim: () => undefined,
  } as any);

  const result = (service as any).buildResultFromText('sri_lakshmi_bill.pdf', 'uploads/sri_lakshmi_bill.pdf', [
    'Sri Lakshmi Multi Speciality Hospital',
    '78, 100 Feet Road, Indiranagar, Bengaluru, Karnataka - 560038',
    'Hospital Reg. No.: TN/CBE/HOS/2014/08721 | GST No.: 29AABCA0000X1ZQ',
    'HOSPITAL BILL',
    'Bill No. SHL/BL/2026/09876 Bill Date 22-09-2026',
    'Patient Name: RAMESH KUMAR S',
    'Age / Gender : 56 Yrs / Male',
    'Patient ID : SLH/INP/2026/0145',
    'UHID : 10345676',
    'Admission No : IP26091567',
    'Consultant : Dr. Anitha Rao (Cardiology)',
    'Department : Cardiology',
    'Room Type : Deluxe Room',
    'Date of Admission 22-09-2026 Date of Discharge 22-09-2026',
    'Gross Amount 1,06,200.00',
    'Discount 5,000.00',
    'GST Amount (9%) 8,100.00',
    'Total Amount Paid 1,06,200.00',
  ].join('\n'));

  assert.equal(result.facts.hospital, 'Sri Lakshmi Multi Speciality Hospital');
  assert.equal(result.facts.hospAddress, '78, 100 Feet Road, Indiranagar, Bengaluru, Karnataka - 560038');
  assert.equal(result.facts.city, 'Bengaluru');
  assert.equal(result.facts.hospReg, 'TN/CBE/HOS/2014/08721');
  assert.equal(result.facts.gstNo, '29AABCA0000X1ZQ');
  assert.equal(result.facts.patient, 'RAMESH KUMAR S');
  assert.equal(result.facts.patientId, 'SLH/INP/2026/0145');
  assert.equal(result.facts.memberId, '10345676');
  assert.equal(result.facts.billNo, 'SHL/BL/2026/09876');
  assert.equal(result.facts.billDate, '22-09-2026');
  assert.equal(result.facts.admission, '22-09-2026');
  assert.equal(result.facts.discharge, '22-09-2026');
  assert.equal(result.facts.billed, 106200);
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
