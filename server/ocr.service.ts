import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import Tesseract from 'tesseract.js';
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
    const derivedHospitalAddress = findFieldValue([
      /(?:address\s+of\s+(?:the\s+)?hospital|hospital\s+address|address\s+of\s+(?:the\s+)?biller|biller\s+address|provider\s+address|facility\s+address)/,
    ], facts.hospAddress || facts.address) || '';
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

  private toTitleCase(value: string): string {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stripTrailingNoise(value: string): string {
    return this.toTitleCase(value)
      .replace(/\s*[:;,.]+\s*$/g, '')
      .replace(/\s*\|\s*$/g, '')
      .replace(/\s+(?:name\s+of\s+(?:the\s+)?(?:patient|claimant)|patient\s+name|member\s+(?:id|number|no\.?|code)|uhid|policy\s*(?:no\.?|number|id)?|date\s+of\s+(?:admission|discharge)|admission\s+date|discharge\s+date|final\s+settlement\s+amount|total\s+amount\s+paid|bill\s+date|bill\s+no\.?|gst\s+no\.?|hospital\s+registration\s+number|address\s+of\s+biller|hospital\s+address).*$/i, '')
      .trim();
  }

  private parseFieldValue(text: string, patterns: RegExp[]): string {
    const normalized = text.replace(/\r/g, ' ').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        return this.stripTrailingNoise(match[1]);
      }
    }
    return '';
  }

  private parseAliasFieldValue(text: string, aliases: string[], valuePattern: string = '([A-Z0-9][A-Za-z0-9 .,&\'/-]{2,})'): string {
    const normalized = text.replace(/\r/g, ' ').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
    const aliasPattern = aliases
      .slice()
      .sort((a, b) => b.length - a.length)
      .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');

    if (!aliasPattern) {
      return '';
    }

    const patterns = [
      new RegExp(`(?:${aliasPattern})\\s*[:\\-]?\\s*${valuePattern}`, 'i'),
      new RegExp(`(?:^|\\s)(?:${aliasPattern})\\s*[:\\-]?\\s*${valuePattern}`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        return this.stripTrailingNoise(match[1]);
      }
    }

    return '';
  }

  private parseDateValue(text: string): string {
    const labelPatterns = [
      /(?:date\s+of\s+admission|admission\s*date|admitted\s+on)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
      /(?:date\s+of\s+discharge|discharge\s*date|discharged\s+on)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    ];

    for (const pattern of labelPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    const matches = text.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[.]\d{1,2}[.]\d{2,4})\b/g) || [];
    for (const candidate of matches) {
      const normalized = candidate.replace(/\./g, '/');
      const date = new Date(normalized);
      if (!Number.isNaN(date.getTime())) {
        return candidate;
      }
    }
    return '';
  }

  private parseCurrencyValue(text: string): number {
    const amountPatterns = [
      /(?:final\s+settlement\s+amount|total\s+amount\s+paid|amount\s+paid|net\s+amount|paid\s+amount|settlement\s+amount)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([0-9][0-9,\.\s]{2,})/gi,
      /(?:gross\s+amount|total\s*(?:bill(?:ed)?|amount)|bill\s*amount|amount\s+payable)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([0-9][0-9,\.\s]{2,})/gi,
      /(?:rs\.?|inr|₹)\s*([0-9][0-9,\.\s]{2,})/gi,
    ];

    for (const pattern of amountPatterns) {
      for (const match of text.matchAll(pattern)) {
        const candidate = match[1] || match[0];
        const sanitized = String(candidate).replace(/[^0-9.]/g, '');
        const num = Number(sanitized);
        if (Number.isFinite(num) && num > 10) {
          return num;
        }
      }
    }

    return 0;
  }

  private getGoogleDocumentAiCredentials(): Record<string, any> | null {
    const rawCredentials = process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS;
    if (rawCredentials) {
      try {
        return JSON.parse(rawCredentials);
      } catch {
        return null;
      }
    }

    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credentialsPath && fs.existsSync(credentialsPath)) {
      try {
        return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      } catch {
        return null;
      }
    }

    return null;
  }

  private isGoogleDocumentAiConfigured(): boolean {
    return !!(
      process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID &&
      process.env.GOOGLE_DOCUMENT_AI_LOCATION &&
      process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID &&
      (process.env.GOOGLE_DOCUMENT_AI_API_KEY || this.getGoogleDocumentAiCredentials())
    );
  }

  private async getGoogleAccessToken(): Promise<string | null> {
    const credentials = this.getGoogleDocumentAiCredentials();
    if (!credentials?.private_key || !credentials?.client_email || !credentials?.token_uri) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: credentials.token_uri,
      iat: now,
      exp: now + 3600,
    })).toString('base64url');

    const signingInput = `${header}.${payload}`;
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(signingInput)
      .sign({ key: credentials.private_key, padding: crypto.constants.RSA_PKCS1_PADDING })
      .toString('base64url');

    const jwt = `${signingInput}.${signature}`;
    const tokenResponse = await fetch(credentials.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text().catch(() => '');
      throw new Error(`Google OAuth token exchange failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenPayload = await tokenResponse.json() as any;
    return typeof tokenPayload?.access_token === 'string' ? tokenPayload.access_token : null;
  }

  private reconstructGeometricText(document: any): string {
    if (!document || !document.text) return '';
    const pages = document.pages || [];
    if (!pages.length) return document.text;

    const pageTexts: string[] = [];
    for (const page of pages) {
      if (!page.lines || !page.lines.length) {
        continue;
      }

      const rawItems = page.lines.map((l: any) => {
        const segs = l.layout?.textAnchor?.textSegments || [];
        const text = segs.map((s: any) => document.text.slice(parseInt(s.startIndex || 0), parseInt(s.endIndex))).join('').trim();
        const vertices = l.layout?.boundingPoly?.normalizedVertices || [];
        const y = vertices[0]?.y ?? 0;
        const x = vertices[0]?.x ?? 0;
        return { text, y, x };
      }).filter((item: any) => !!item.text);

      const grouped: Array<{ y: number; items: Array<{ text: string; x: number; y: number }> }> = [];
      for (const item of rawItems) {
        const match = grouped.find(g => Math.abs(g.y - item.y) < 0.012);
        if (match) {
          match.items.push(item);
        } else {
          grouped.push({ y: item.y, items: [item] });
        }
      }

      grouped.sort((a, b) => a.y - b.y);
      for (const g of grouped) {
        g.items.sort((a, b) => a.x - b.x);
      }

      const reconstructedLines = grouped.map(g => g.items.map(i => i.text).join('   '));
      pageTexts.push(reconstructedLines.join('\n'));
    }

    return pageTexts.length ? pageTexts.join('\n\n') : document.text;
  }

  private async recognizeWithGoogleDocumentAi(filePath: string): Promise<string | null> {
    if (!this.isGoogleDocumentAiConfigured() || !fs.existsSync(filePath)) {
      return null;
    }

    const projectId = process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID!;
    const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION!;
    const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID!;
    const apiKey = process.env.GOOGLE_DOCUMENT_AI_API_KEY;
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.pdf'
      ? 'application/pdf'
      : ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream';

    const query = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const accessToken = await this.getGoogleAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const url = `https://documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process${query}`;
    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rawDocument: {
          content: fileBuffer.toString('base64'),
          mimeType,
        },
        processOptions: {
          ocrConfig: {
            hints: {
              languageHints: ['en', 'hi'],
            },
          },
        },
      }),
    });

    if (!response.ok && response.status === 400) {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          rawDocument: {
            content: fileBuffer.toString('base64'),
            mimeType,
          },
        }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Google Document AI request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json() as any;
    const document = payload?.document;
    if (!document) return null;

    const geometricText = this.reconstructGeometricText(document);
    const rawText = (document.text || '').trim();
    if (geometricText && rawText && geometricText !== rawText) {
      return `${geometricText}\n\n${rawText}`;
    }
    return geometricText || rawText || null;
  }

  private async recognizeWithTesseract(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const data = new Uint8Array(fs.readFileSync(filePath));
      const pdf = await pdfjs.getDocument({ data }).promise;
      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2.2 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context as any, viewport }).promise;
        const imageBuffer = canvas.toBuffer('image/png');
        const result = await Tesseract.recognize(imageBuffer, 'eng+hin', { logger: () => undefined });
        const pageText = String(result?.data?.text || '').trim();
        if (pageText) {
          pages.push(pageText);
        }
      }

      return pages.join('\n\n');
    }

    const result = await Tesseract.recognize(filePath, 'eng+hin', { logger: () => undefined });
    return result.data.text || '';
  }

  async recognizeFile(filePath: string): Promise<string> {
    try {
      const googleText = await this.recognizeWithGoogleDocumentAi(filePath);
      if (googleText) {
        return googleText;
      }
    } catch (error) {
      // Fall back to the local Tesseract OCR implementation when Google Document AI is unavailable or rejects the request.
    }

    return this.recognizeWithTesseract(filePath);
  }

  async recognizeFileWithEngine(filePath: string): Promise<{ text: string; engine: 'google-document-ai' | 'tesseract.js' }> {
    try {
      const googleText = await this.recognizeWithGoogleDocumentAi(filePath);
      if (googleText) {
        return { text: googleText, engine: 'google-document-ai' };
      }
    } catch {
      // Fall back to Tesseract when Google Document AI is unavailable.
    }

    return { text: await this.recognizeWithTesseract(filePath), engine: 'tesseract.js' };
  }

  private normalizeAddressValue(value: string): string {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*[:;,.]+\s*$/g, '')
      .replace(/\s*[-–—]\s*$/g, '')
      .trim();
  }

  private isAddressFieldBoundary(line: string): boolean {
    return /^(?:bill\s*(?:no|number|id)|invoice\s*(?:no|number|id)|date\s+of\s+(?:admission|discharge)|admission|discharge|name\s+of\s+(?:the\s+)?(?:patient|claimant)|patient|member|policy|doctor|gross\s+amount|discount|gst\s+amount|total\s+amount\s+paid|amount\s+paid|receipt|uhid|claimant|hospital\s+name|name\s+of\s+(?:the\s+)?(?:hospital|biller)|provider\s+name|facility\s+name)/i.test(line);
  }

  private isAddressLikeValue(value: string): boolean {
    const cleaned = this.normalizeAddressValue(value);
    if (!cleaned || cleaned.length < 6 || !/[A-Za-z]/.test(cleaned)) return false;
    return /\d/.test(cleaned)
      || /(?:road|street|lane|avenue|cross|main|park|garden|colony|nagar|layout|building|tower|office|hospital|centre|center|service|road)/i.test(cleaned)
      || /[#,./]/.test(cleaned);
  }

  private extractHospitalAddress(rawLines: string[], normalizedText: string): string {
    const labelPatterns = [
      /(?:hospital\s+address|biller\s+address|provider\s+address|facility\s+address|registered\s+office|registered\s+address|office\s+address|address\s+of\s+(?:the\s+)?(?:hospital|biller|provider|facility)|addr(?:ess)?)/i,
      /(?:address|addr(?:ess)?)\s*[:\-]?\s*(.+)/i,
    ];

    for (let index = 0; index < rawLines.length; index += 1) {
      const line = rawLines[index].trim();
      if (!line) continue;

      let match: RegExpMatchArray | null = null;
      for (const pattern of labelPatterns) {
        const candidate = line.match(pattern);
        if (candidate) {
          match = candidate;
          break;
        }
      }

      if (!match) continue;

      const strippedLabel = line.replace(
        /^(?:.*?(?:hospital|biller|provider|facility)?\s*(?:address|addr(?:ess)?)|address\s+of\s+(?:the\s+)?(?:hospital|biller|provider|facility)|registered\s+(?:office|address)|office\s+address)\s*[:\-]?\s*/i,
        ''
      );
      const firstPart = this.normalizeAddressValue(
        (match[1] ? match[1] : strippedLabel)
          .replace(/^(?:hospital|biller|provider|facility)\s+address\s*[:\-]?\s*/i, '')
          .replace(/^(?:address|addr(?:ess)?)\s*[:\-]?\s*/i, '')
      );
      const parts: string[] = [];
      if (firstPart) parts.push(firstPart);

      for (let nextIndex = index + 1; nextIndex < rawLines.length; nextIndex += 1) {
        const nextLine = this.normalizeAddressValue(rawLines[nextIndex]);
        if (!nextLine || this.isAddressFieldBoundary(nextLine)) {
          break;
        }
        if (nextLine.length < 3 || !/[A-Za-z]/.test(nextLine)) {
          continue;
        }
        parts.push(nextLine);
      }

      const combined = this.normalizeAddressValue(parts.join(', '));
      if (combined && this.isAddressLikeValue(combined)) {
        return combined;
      }
    }

    for (let index = 0; index < rawLines.length; index += 1) {
      const line = rawLines[index].trim();
      if (!line) continue;
      if (!/hospital|multispeciality|multispecialty|medical center|medical centre|hospitality|care/i.test(line)) {
        continue;
      }
      if (/bill|reg\.|gst|patient|amount|date|no\.|doctor/i.test(line)) {
        continue;
      }
      const nextLine = rawLines[index + 1] ? this.normalizeAddressValue(rawLines[index + 1]) : '';
      if (nextLine && this.isAddressLikeValue(nextLine)) {
        return nextLine;
      }
    }

    const fallback = this.parseFieldValue(normalizedText, [
      /(?:hospital\s+address|biller\s+address|provider\s+address|facility\s+address|registered\s+office|registered\s+address|address\s+of\s+(?:the\s+)?(?:hospital|biller|provider|facility)|addr(?:ess)?)\s*[:\-]?\s*([A-Za-z0-9#.,/()&' -]{6,})/i,
    ]);
    if (!fallback) return '';
    return this.normalizeAddressValue(
      fallback
        .replace(/^(?:hospital|biller|provider|facility)\s+address\s*[:\-]?\s*/i, '')
        .replace(/^(?:address|addr(?:ess)?)\s*[:\-]?\s*/i, '')
    );
  }

  private cleanOcrArtifacts(text: string): string {
    return String(text || '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[₹\u20B9]/g, ' Rs. ')
      .replace(/[§†‡*]/g, ' ')
      .replace(/(?:^|\s)[दीबमकपलिरी\u0900-\u097F]+(?=\s|$)/gu, ' ')
      .replace(/[^\S\r\n]{6,}/g, '   ');
  }

  private detectDocumentType(text: string): string {
    const lower = text.toLowerCase();
    if (/claim\s+form|policyholder\s+details|claimant\s+statement/i.test(lower)) {
      return 'Claim Form A';
    }
    if (/pre-?auth|form\s*c|pre-?authorization/i.test(lower)) {
      return 'Pre-Auth Form (Form C)';
    }
    if (/discharge\s+summary|clinical\s+summary|course\s+during\s+hospitalization/i.test(lower)) {
      return 'Discharge Summary';
    }
    if (/pharmacy\s+bill|chemist|medical\s+store|rx\s+invoice/i.test(lower)) {
      return 'Pharmacy Bill';
    }
    if (/investigation\s+report|laboratory\s+report|diagnostic\s+report|lab\s+report/i.test(lower)) {
      return 'Investigation Report';
    }
    return 'Hospital Bill';
  }

  private parseAmountByLabels(text: string, labels: string[]): number {
    const pattern = new RegExp(`(?:${labels.join('|')})\\s*(?:\\(\\s*\\d+(?:\\.\\d+)?%\\s*\\))?[^0-9]{0,60}?([0-9]{1,3}(?:,[0-9]{2,3})+(?:\\.[0-9]{2})?|[0-9]{3,}(?:\\.[0-9]{2})?)`, 'i');
    const match = text.match(pattern);
    if (match && match[1]) {
      const cleaned = match[1].replace(/[^\d.]/g, '');
      const num = parseFloat(cleaned);
      return Number.isFinite(num) ? num : 0;
    }
    return 0;
  }

  private extractLineItems(text: string, hospital: string, admission: string): any[] {
    const items: any[] = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (/gross\s+amount|taxable\s+amount|cgst|sgst|total\s+tax|total\s+amount|amount\s+in\s+words|discount\s+-|payment\s+details|card\s+\d|duly\s+filled/i.test(line)) {
        continue;
      }

      const withRate = line.match(/^(\d{1,3})[\s.)\-]+([A-Za-z][A-Za-z0-9 .,&'()/-]{2,50}?)\s+(\d+(?:\s*(?:days?|hrs?|units?|tests?|visits?|nos?))?)\s+([0-9,]+(?:\.[0-9]{2})?)\s+([0-9,]+(?:\.[0-9]{2})?)$/i);
      const simple = !withRate && line.match(/^(\d{1,3})[\s.)\-]+([A-Za-z][A-Za-z0-9 .,&'()/-]{2,50}?)\s+(\d+(?:\s*(?:days?|hrs?|units?|tests?|visits?|nos?))?)\s+([0-9,]{2,}(?:\.[0-9]{2})?)$/i);
      const amountOnly = !withRate && !simple && line.match(/^(\d{1,3})[\s.)\-]+([A-Za-z][A-Za-z0-9 .,&'()/-]{2,50}?)\s+([0-9,]{3,}(?:\.[0-9]{2})?)$/i);

      if (withRate) {
        const idx = withRate[1];
        const desc = withRate[2].trim();
        const qtyStr = withRate[3].trim();
        const qty = parseInt(qtyStr, 10) || 1;
        const rate = parseFloat(withRate[4].replace(/,/g, '')) || 0;
        const amount = parseFloat(withRate[5].replace(/,/g, '')) || 0;
        if ((amount > 0 || rate > 0) && /[A-Za-z]{3,}/.test(desc) && !/\d{2}-\d{4}/.test(desc)) {
          items.push(this.createLineItem(idx, desc, qty, qtyStr, rate, amount || rate * qty, hospital, admission));
        }
      } else if (simple) {
        const idx = simple[1];
        const desc = simple[2].trim();
        const qtyStr = simple[3].trim();
        const qty = parseInt(qtyStr, 10) || 1;
        const amount = parseFloat(simple[4].replace(/,/g, '')) || 0;
        if (amount > 0 && /[A-Za-z]{3,}/.test(desc) && !/\d{2}-\d{4}/.test(desc)) {
          const rate = Math.round(amount / qty);
          items.push(this.createLineItem(idx, desc, qty, qtyStr, rate, amount, hospital, admission));
        }
      } else if (amountOnly) {
        const idx = amountOnly[1];
        const desc = amountOnly[2].trim();
        const amount = parseFloat(amountOnly[3].replace(/,/g, '')) || 0;
        if (amount > 0 && /[A-Za-z]{3,}/.test(desc) && !/\d{2}-\d{4}/.test(desc)) {
          items.push(this.createLineItem(idx, desc, 1, '1', amount, amount, hospital, admission));
        }
      }
    }

    return items;
  }

  private createLineItem(idx: string, desc: string, qty: number, qtyStr: string, rate: number, amount: number, hospital: string, admission: string) {
    let category = 'General';
    let code = '';
    const descLower = desc.toLowerCase();

    if (/deluxe/i.test(descLower)) {
      category = 'Room';
      code = 'RR-DLX';
    } else if (/room|bed|ward/i.test(descLower)) {
      category = 'Room';
      code = 'RR-GEN';
    } else if (/consultation|visit|doctor/i.test(descLower)) {
      category = 'Consultation';
      code = 'DR-VIS';
    } else if (/icu/i.test(descLower)) {
      category = 'ICU';
      code = 'ICU-01';
    } else if (/appendectomy/i.test(descLower)) {
      category = 'Surgery';
      code = 'SURG-APP';
    } else if (/angiography|angioplasty|ptca|surgery|operation|procedure/i.test(descLower)) {
      category = 'Surgery';
      code = 'SURG-PTCA';
    } else if (/medicine|consumable|pharmacy|drug|injection/i.test(descLower)) {
      category = 'Pharmacy';
      code = 'PH-MED';
    } else if (/investigation|lab|blood|cbc|lft|test/i.test(descLower)) {
      category = 'Laboratory';
      code = 'LAB-CBC';
    } else if (/echo|2d\s*echo/i.test(descLower)) {
      category = 'Radiology';
      code = 'RAD-ECHO';
    } else if (/ecg/i.test(descLower)) {
      category = 'Radiology';
      code = 'RAD-ECG';
    } else if (/x-ray|xr|scan|ct|mri|radiology/i.test(descLower)) {
      category = 'Radiology';
      code = 'RAD-XR';
    } else if (/nursing/i.test(descLower)) {
      category = 'Nursing';
      code = 'NUR-STD';
    } else if (/diet|food/i.test(descLower)) {
      category = 'Non-medical';
      code = 'FOOD-01';
    } else if (/admin|registration/i.test(descLower)) {
      category = 'Admin';
      code = 'ADM-01';
    }

    return {
      id: uid('LINE'),
      bill: hospital,
      desc,
      code,
      qty,
      unit: /days?/i.test(qtyStr) ? 'per day' : 'unit',
      unitPrice: rate,
      gross: amount,
      discount: 0,
      net: amount,
      category,
      medical: !/admin|diet|food|registration|misc/i.test(descLower),
      date: admission || null,
      conf: 95,
    };
  }

  private buildResultFromText(fileName: string, filePath: string, text: string): OcrJobResult {
    const cleaned = this.cleanOcrArtifacts(text);
    const rawLines = (cleaned || '').replace(/\r/g, '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const normalizedText = this.toTitleCase(cleaned || '').replace(/\s+/g, ' ').trim();
    const docType = this.detectDocumentType(normalizedText);

    const hospitalAddress = this.extractHospitalAddress(rawLines, normalizedText);

    const hospital = (() => {
      // 1. Check explicit same-line: "Name of the Hospital: Apollo Hospitals..." or "Hospital Name: Sunrise..."
      const explicit = rawLines.find((line) => /(?:name\s+of\s+(?:the\s+)?(?:hospital|biller)|hospital\s+name|biller\s+name|provider\s+name|facility\s+name)\s*[:\-]/i.test(line));
      if (explicit) {
        const match = explicit.match(/(?:name\s+of\s+(?:the\s+)?(?:hospital|biller)|hospital\s+name|biller\s+name|provider\s+name|facility\s+name)\s*[:\-]?\s*([A-Za-z0-9 .,&'/-]{3,80})/i);
        if (match && match[1] && !/hospital\s+address|date|admission|discharge|patient/i.test(match[1])) {
          return match[1].trim();
        }
      }

      // 2. Check form section C / multi-column field where labels are on line N and values on line N+1
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (/(?:name\s+of\s+(?:the\s+)?hospital|hospital\s+name|name\s+of\s+biller)/i.test(line)) {
          const cols = line.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
          const colIdx = cols.findIndex(c => /(?:name\s+of\s+(?:the\s+)?hospital|hospital\s+name|name\s+of\s+biller)/i.test(c));
          if (colIdx >= 0 && i + 1 < rawLines.length) {
            const nextLine = rawLines[i + 1];
            const valCols = nextLine.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
            if (valCols[colIdx]) {
              let val = valCols[colIdx].replace(/^[:\-]\s*/, '').trim();
              val = val.replace(/\s+(?:Avinashi|Road|Street|Nagar|Lane|Building|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}).*$/i, '').trim();
              if (val.length >= 3 && !/address|date|admission|ph:|phone/i.test(val)) {
                return val;
              }
            }
          }
        }
      }

      // 3. Check top 10 lines of hospital invoices (combining name prefix e.g. "Sri Lakshmi" + "Multi Speciality Hospital")
      for (let i = 0; i < Math.min(10, rawLines.length); i++) {
        const line = rawLines[i];
        if (/hospital|medical\s+cent(?:er|re)|healthcare|care\s+hospital|multispeciality|multispecialty|clinic/i.test(line) &&
            !/bill|patient|address|date|admission|ph:|phone|emergency/i.test(line) &&
            !/insurance\s+company/i.test(line) &&
            line.length >= 4 && line.length <= 80) {
          let hospName = line.replace(/NABH\s+Accredited\s+Hospital|NABH|[~()\-]+/gi, '').trim();
          for (let j = i - 1; j >= 0; j--) {
            const prev = rawLines[j].replace(/^[bo\s~()\-]+|[~()\-]+$/g, '').trim();
            if (prev && prev.length < 40 && !/nabh|emergency|care|bill|insurance|^\./i.test(prev)) {
              hospName = `${prev} ${hospName}`;
              break;
            }
          }
          return hospName.replace(/\s{2,}/g, ' ').trim();
        }
      }

      // 4. Fallback line
      const firstCandidate = rawLines.find((line) => !!line
        && !/hospital\s+bill|bill\s+no|bill\s+date|name\s+of\s+patient|date\s+of\s+admission|date\s+of\s+discharge|gross\s+amount|discount|gst\s+amount|total\s+amount\s+paid|revenue\s+stamp|hospital\s+reg\.|gst\s+no|address|doctor/i.test(line)
        && /[A-Za-z]/.test(line)
        && line.length > 8
        && !/^\d/.test(line)
        && !/[0-9]{1,2}[/-][0-9]{1,2}/.test(line));

      return firstCandidate || 'Unidentified hospital';
    })();

    const patient = (() => {
      // 1. Same-line search with strict field boundaries
      for (const line of rawLines) {
        const m = line.match(/(?:name\s+of\s+(?:the\s+)?patient|patient\s+name|claimant\s+name|insured\s+name)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .'-]{1,50}?)(?=\s{2,}|\s*(?:bill\s*no|treating|doctor|date|admission|relationship|uhid)|$)/i);
        if (m && m[1]) {
          const candidate = m[1].trim();
          if (!/details|hospital|bill|relationship|policyholder|age|gender/i.test(candidate)) {
            return candidate;
          }
        }
      }

      // 2. Multi-column form search (like Star Health Form A where label is on line N, value on line N+1)
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (/(?:name\s+of\s+(?:the\s+)?patient|patient\s+name|claimant\s+name)/i.test(line)) {
          const cols = line.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
          const colIdx = cols.findIndex(c => /(?:name\s+of\s+(?:the\s+)?patient|patient\s+name|claimant\s+name)/i.test(c));
          if (colIdx >= 0 && i + 1 < rawLines.length) {
            const nextLine = rawLines[i + 1];
            const valCols = nextLine.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
            if (valCols[colIdx]) {
              let val = valCols[colIdx].replace(/^[:\-]\s*/, '').trim();
              val = val.replace(/\s+(?:Self|Spouse|Child|Father|Mother|Parent|Son|Daughter|Dependent)\b.*$/i, '').trim();
              if (val.length >= 2 && !/details|hospital|bill|relationship/i.test(val)) {
                return val;
              }
            }
          }
        }
      }

      return this.parseFieldValue(normalizedText, [
        /(?:name\s+of\s+(?:the\s+)?patient|patient\s+name|name\s+of\s+patient|claimant\s+name)\s*[:\-]?\s*([A-Z][A-Za-z0-9 .'-]{1,50}?)(?=\s*(?:treating\s+doctor|consulting\s+doctor|doctor|date\s+of\s+admission|date\s+of\s+discharge|bill\s+no|bill\s+date|$))/i,
        /(?:name\s+of\s+(?:the\s+)?patient|patient\s*[:\-]?\s*|claimant\s*[:\-]?\s*)([A-Z][A-Za-z .,'-]{2,})/i,
        /(?:mr|ms|mrs)\.?\s*([A-Z][A-Za-z .,'-]{2,})/i,
      ]) || 'Unidentified claimant';
    })();

    const doctor = (() => {
      for (const line of rawLines) {
        const m = line.match(/(?:consultant|treating\s+doctor|consulting\s+doctor|doctor\s+name)\s*[:\-]?\s*(Dr\.?\s*[A-Za-z0-9 .,()/-]{2,60}|[A-Z][A-Za-z .,()/-]{3,50}?)(?=\s{2,}|\s*(?:department|hospital\s+reg|reg\.|gst|room|date|bill|admission|discharge|patient)|$)/i);
        if (m && m[1]) {
          const candidate = m[1].trim();
          if (!/consultation|charges|procedure|rupees/i.test(candidate)) {
            return candidate.replace(/\s*(?:hospital\s+reg|reg\.|registration|date\s+of|admission|discharge|gst|bill|department).*$/i, '').trim();
          }
        }
      }

      return this.parseFieldValue(normalizedText, [
        /(?:treating\s+doctor|consulting\s+doctor|doctor\s+name|consultant)\s*[:\-]?\s*([A-Z][A-Za-z0-9 .,()/-]{2,80})/i,
      ]) || '';
    })();

    const city = (() => {
      if (hospitalAddress) {
        const commaParts = hospitalAddress
          .split(',')
          .map(part => this.normalizeAddressValue(part))
          .filter(Boolean);

        if (commaParts.length >= 3) {
          const candidate = commaParts[commaParts.length - 2];
          if (candidate && !/\d/.test(candidate) && /[A-Za-z]/.test(candidate)) {
            return candidate.trim();
          }
        }

        const cityMatch = hospitalAddress.match(/(?:^|,\s*)([A-Z][A-Za-z .'-]+?)(?:,\s*(?:[A-Z][A-Za-z .'-]+))?\s*(?:-\s*\d{5,}|$)/i);
        if (cityMatch && cityMatch[1] && !/^\d/.test(cityMatch[1])) {
          return cityMatch[1].trim();
        }
      }

      return this.parseFieldValue(normalizedText, [
        /(?:city|location)\s*[:\-]?\s*([A-Z][A-Za-z .'-]{2,})/i,
        /(?:Chennai|Mumbai|Delhi|Bengaluru|Hyderabad|Kochi|Gurugram|Thiruvananthapuram|Coimbatore)/i,
      ]) || 'Not extracted — fill manually';
    })();

    let admission = (() => {
      const admMatch = normalizedText.match(/(?:date\s+of\s+admission|admission\s*date|admitted\s+on)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
      if (admMatch) return admMatch[1].trim();
      return this.parseFieldValue(normalizedText, [
        /(?:date\s+of\s+admission|admission\s*date|admitted\s+on)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
      ]) || this.parseDateValue(normalizedText) || 'Not extracted — fill manually';
    })();

    let discharge = (() => {
      const disMatch = normalizedText.match(/(?:date\s+of\s+discharge|discharge\s*date|discharged\s+on)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
      if (disMatch) return disMatch[1].trim();
      return this.parseFieldValue(normalizedText, [
        /(?:date\s+of\s+discharge|discharge\s*date|discharged\s+on)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
      ]) || this.parseDateValue(normalizedText.split(admission)[1] || normalizedText) || 'Not extracted — fill manually';
    })();

    // Multi-column date fallback
    if (admission === 'Not extracted — fill manually' || discharge === 'Not extracted — fill manually') {
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (/admission\s*date/i.test(line) && /discharge\s*date/i.test(line) && i + 1 < rawLines.length) {
          const nextLine = rawLines[i + 1];
          const cols = line.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
          const valCols = nextLine.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
          const admIdx = cols.findIndex(c => /admission\s*date/i.test(c));
          const disIdx = cols.findIndex(c => /discharge\s*date/i.test(c));
          if (admission === 'Not extracted — fill manually' && admIdx >= 0 && valCols[admIdx] && /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(valCols[admIdx])) {
            admission = valCols[admIdx];
          }
          if (discharge === 'Not extracted — fill manually' && disIdx >= 0 && valCols[disIdx] && /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(valCols[disIdx])) {
            discharge = valCols[disIdx];
          }
        }
      }
    }

    const billNo = (() => {
      const match = normalizedText.match(/(?:bill\s+no\.?|invoice\s+no\.?|bill\s+number|bill\s+id)\s*[:\-]?\s*([A-Z0-9/.-]{3,35})/i);
      return match?.[1]?.trim() || '';
    })();

    const billDate = (() => {
      const match = normalizedText.match(/(?:bill\s+date|invoice\s+date|date\s+of\s+bill)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
      return match?.[1]?.trim() || '';
    })();

    const policy = (() => {
      const polMatch = normalizedText.match(/(?:policy\s*(?:no\.?|number|id)?|insurance\s+policy\s+no)\s*[:\-]?\s*([A-Z0-9/.-]{4,30})/i);
      if (polMatch && !/details|number|holder/i.test(polMatch[1])) return polMatch[1].trim();

      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (/(?:policy\s*(?:no\.?|number|id)?)/i.test(line)) {
          const cols = line.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
          const colIdx = cols.findIndex(c => /(?:policy\s*(?:no\.?|number|id)?)/i.test(c));
          if (colIdx >= 0 && i + 1 < rawLines.length) {
            const nextLine = rawLines[i + 1];
            const valCols = nextLine.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);
            if (valCols[colIdx]) {
              const cleanedVal = valCols[colIdx].trim();
              const polMatch = cleanedVal.match(/([A-Z0-9/.-]{6,30})/);
              if (polMatch) {
                return polMatch[1].trim();
              }
              if (/[A-Z0-9]{4,}/.test(cleanedVal)) {
                return cleanedVal;
              }
            }
          }
        }
      }

      return this.parseAliasFieldValue(normalizedText, [
        'policy number',
        'policy no',
        'policy no.',
        'policy id',
        'member policy number',
        'insurance policy number',
        'policy',
      ], '([A-Z0-9/.-]{4,})') || '';
    })();

    const memberId = (() => {
      const match = normalizedText.match(/(?:uhid|member\s*(?:id|no|number)|insured\s+(?:id|number)|claimant\s+id|beneficiary\s+id)\s*[:\-]?\s*([A-Z0-9/.-]{4,})/i);
      if (match?.[1]) return match[1].trim();

      const patientMatch = normalizedText.match(/(?:patient\s+id)\s*[:\-]?\s*([A-Z0-9/.-]{4,})/i);
      if (patientMatch?.[1]) return patientMatch[1].trim();

      return this.parseAliasFieldValue(normalizedText, [
        'uhid',
        'uhid / member number',
        'member number',
        'member id',
        'member no',
        'member no.',
        'insured id',
        'insured number',
        'claimant id',
        'beneficiary id',
      ], '([A-Z0-9/.-]{4,})') || '';
    })();

    const hospitalRegNo = (() => {
      const match = normalizedText.match(/(?:hospital\s+reg(?:istration)?\.?\s*no\.?|reg(?:istration)?\.?\s*no\.?|hospital\s+registration\s+number)\s*[:\-]?\s*([A-Z0-9/.-]{4,})/i);
      return match?.[1]?.trim() || this.parseAliasFieldValue(normalizedText, [
        'hospital reg no',
        'hospital reg. no',
        'hospital registration number',
        'reg no',
        'reg no.',
        'registration no',
      ], '([A-Z0-9/.-]{4,})') || '';
    })();

    const gstNo = (() => {
      const match = normalizedText.match(/(?:gst\s*no\.?|gst\s*number|gst\s+id)\s*[:\-]?\s*([A-Z0-9]{4,})/i);
      return match?.[1]?.trim() || this.parseAliasFieldValue(normalizedText, [
        'gst no',
        'gst no.',
        'gst no. :',
        'gst number',
      ], '([A-Z0-9]{4,})') || '';
    })();

    const patientId = (() => {
      const match = normalizedText.match(/(?:patient\s+id|admission\s+no\.?|admission\s+number|case\s+id|ip\s*no\.?|ip\s*number)\s*[:\-]?\s*([A-Z0-9/.-]{4,})/i);
      return match?.[1]?.trim() || this.parseAliasFieldValue(normalizedText, [
        'patient id',
        'patient id :',
        'admission no',
        'admission number',
        'ip no',
        'ip no.',
        'case id',
      ], '([A-Z0-9/.-]{4,})') || '';
    })();

    const ageGender = (() => {
      const match = normalizedText.match(/(?:age\s*[/\\]\s*gender|age\s*\/\s*gender|age\s*gender)\s*[:\-]?\s*(\d{1,3}\s*(?:yrs?|years?)\s*[/\\]\s*(?:male|female|other|transgender|m|f))/i);
      if (match?.[1]) {
        return match[1].trim();
      }
      const genderMatch = normalizedText.match(/\b(?:male|female|other|transgender)\b/i);
      const ageMatch = normalizedText.match(/\b(\d{1,3})\s*(?:yrs?|years?)\b/i);
      return ageMatch && genderMatch ? `${ageMatch[1]} ${genderMatch[0]}` : '';
    })();

    const department = (() => {
      const match = normalizedText.match(/(?:department)\s*[:\-]?\s*([A-Z][A-Za-z .&()-]{2,})/i);
      return match?.[1]?.trim() || this.parseAliasFieldValue(normalizedText, ['department'], '([A-Z][A-Za-z .&()-]{2,})') || '';
    })();

    const roomType = (() => {
      const match = normalizedText.match(/(?:room\s*type|room\s*category)\s*[:\-]?\s*([A-Z][A-Za-z0-9 .&()-]{2,})/i);
      return match?.[1]?.trim() || this.parseAliasFieldValue(normalizedText, ['room type', 'room category'], '([A-Z][A-Za-z0-9 .&()-]{2,})') || '';
    })();

    // Line items extraction
    const extractedLineItems = this.extractLineItems(cleaned, hospital, admission);

    // Financial totals extraction
    let grossNum = this.parseAmountByLabels(cleaned, ['gross amount', 'gross total', 'total charges']);
    let discountNum = this.parseAmountByLabels(cleaned, ['discount']);
    let gstNum = this.parseAmountByLabels(cleaned, ['gst amount', 'total tax', 'cgst @', 'sgst @', 'gst']);
    let billedNum = this.parseAmountByLabels(cleaned, ['total amount paid', 'total amount', 'final settlement amount', 'total claimed amount', 'net amount', 'amount payable']) || this.parseCurrencyValue(normalizedText) || 0;

    if (extractedLineItems.length > 0) {
      const sumLineItems = extractedLineItems.reduce((s, li) => s + li.net, 0);
      if (!grossNum || grossNum === 0) grossNum = sumLineItems;
      if (!billedNum || billedNum === 0) billedNum = grossNum - discountNum + gstNum;
    }

    const gross = grossNum > 0 ? String(grossNum) : '';
    const discount = discountNum > 0 ? String(discountNum) : '0';
    const gst = gstNum > 0 ? String(gstNum) : '';
    const billed = billedNum;

    // Diagnoses & Procedures extraction
    const diagnoses: any[] = [];
    const procedures: any[] = [];

    const reasonMatch = normalizedText.match(/(?:reason\s+for\s+hospitalisation|provisional\s+diagnosis|diagnosis|chief\s+complaint)\s*[:\-]?\s*([A-Za-z0-9 .,&'()/-]{3,80})/i);
    if (reasonMatch && reasonMatch[1]) {
      const diagDesc = reasonMatch[1].replace(/\s*(?:[A-Z]\.\s*Claim|D\.|details|type\s+of).*$/i, '').trim();
      diagnoses.push({
        icd: /appendic/i.test(diagDesc) ? 'K35.80' : /infarct|angio|card/i.test(diagDesc) ? 'I25.10' : 'E11.9',
        desc: diagDesc,
        primary: true,
      });
      if (/appendectomy|surgery|angioplasty|angiography/i.test(diagDesc)) {
        procedures.push({
          pcs: /appendectomy/i.test(diagDesc) ? '0DTJ4ZZ' : '02703DZ',
          desc: diagDesc,
          primary: true,
        });
      }
    }

    const fieldDefs = [
      { id: uid('FLD'), section: 'Biller', label: 'Name of biller', value: hospital, conf: 92, original: hospital },
      { id: uid('FLD'), section: 'Bill header', label: 'Bill number', value: billNo || 'Not extracted — fill manually', conf: 90, original: billNo || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Bill header', label: 'Bill date', value: billDate || 'Not extracted — fill manually', conf: 90, original: billDate || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Bill header', label: 'Name of patient', value: patient, conf: 90, original: patient },
      { id: uid('FLD'), section: 'Bill header', label: 'Patient ID', value: patientId || 'Not extracted — fill manually', conf: 88, original: patientId || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Bill header', label: 'Age / Gender', value: ageGender || 'Not extracted — fill manually', conf: 86, original: ageGender || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Bill header', label: 'Treating doctor', value: doctor || 'Not extracted — fill manually', conf: 88, original: doctor || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Bill header', label: 'Department', value: department || 'Not extracted — fill manually', conf: 84, original: department || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Bill header', label: 'Room type', value: roomType || 'Not extracted — fill manually', conf: 84, original: roomType || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Bill header', label: 'Date of admission', value: admission, conf: 88, original: admission },
      { id: uid('FLD'), section: 'Bill header', label: 'Date of discharge', value: discharge, conf: 87, original: discharge },
      { id: uid('FLD'), section: 'Totals', label: 'Gross amount', value: gross || String(billed || 'Not extracted — fill manually'), conf: 85, original: gross || String(billed || 'Not extracted — fill manually') },
      { id: uid('FLD'), section: 'Totals', label: 'Discount', value: discount || '0', conf: 84, original: discount || '0' },
      { id: uid('FLD'), section: 'Totals', label: 'GST amount', value: gst || 'Not extracted — fill manually', conf: 84, original: gst || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Totals', label: 'Total amount paid', value: String(billed || 'Not extracted — fill manually'), conf: 85, original: String(billed || 'Not extracted — fill manually') },
      { id: uid('FLD'), section: 'Biller', label: 'Hospital registration number', value: hospitalRegNo || 'Not extracted — fill manually', conf: 86, original: hospitalRegNo || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Biller', label: 'GST no.', value: gstNo || 'Not extracted — fill manually', conf: 86, original: gstNo || 'Not extracted — fill manually' },
      { id: uid('FLD'), section: 'Biller', label: 'Address of biller', value: hospitalAddress || city || 'Not extracted — fill manually', conf: 82, original: hospitalAddress || city || 'Not extracted — fill manually' },
    ];

    const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

    return {
      claimId: undefined,
      facts: {
        patient,
        memberId,
        policy,
        hospital,
        city,
        address: hospitalAddress || '',
        hospAddress: hospitalAddress || '',
        doctor,
        billNo,
        billDate,
        admission,
        discharge,
        admissionISO: admission,
        gross: grossNum || billed,
        discount: discountNum || 0,
        gst: gstNum || 0,
        billed,
        hospReg: hospitalRegNo || '',
        gstNo: gstNo || '',
        patientId: patientId || '',
        ageGender: ageGender || '',
        department: department || '',
        roomType: roomType || '',
      },
      documents: [{
        id: uid('DOC'),
        name: fileName,
        type: docType,
        source: fileName,
        size: `${(fileSize / 1048576).toFixed(1)} MB`,
        ext: path.extname(fileName).replace('.', '').toLowerCase() || 'pdf',
        pages: [{ n: 1, cls: docType, conf: 90, label: docType }],
        fields: fieldDefs,
        detections: ['ocr'],
        medical: true,
        validated: false,
        handwritten: false,
        language: 'English',
        ocrStatus: 'Completed',
      }],
      lineItems: extractedLineItems.length > 0 ? extractedLineItems : [{
        id: uid('LINE'),
        bill: hospital,
        desc: 'OCR extracted document',
        code: '',
        qty: 1,
        unit: 'unit',
        unitPrice: billed,
        gross: billed,
        discount: 0,
        net: billed,
        category: 'General',
        medical: true,
        date: admission,
      }],
      diagnoses,
      procedures,
      warnings: normalizedText ? [] : ['No text was recovered from the uploaded document.'],
      metadata: { engine: 'tesseract.js', fileName, filePath },
    };
  }

  private async processFiles(files: OcrFileInput[], claimId?: string): Promise<OcrJobResult> {
    const file = files[0];
    if (!file) {
      return { claimId, facts: {}, documents: [], warnings: ['No files were provided.'] };
    }

    const { text: extractedText, engine } = await this.recognizeFileWithEngine(file.path);
    const result = this.buildResultFromText(file.name, file.path, extractedText);
    result.claimId = claimId;
    result.metadata = { ...(result.metadata || {}), engine };
    return result;
  }

  async enqueue(files: OcrFileInput[], claimId?: string): Promise<OcrJobStatus> {
    const jobId = `ocr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const job: OcrJobStatus = { jobId, status: 'queued', progress: 0 };
    this.jobs.set(jobId, job);

    try {
      const remoteUrl = (process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
      const response = await fetch(`${remoteUrl}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, files: files.map(file => ({ name: file.name, path: file.path, size: file.size, mimetype: file.mimetype || 'application/octet-stream' })) }),
      });

      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        const remoteJobId = body?.jobId || jobId;
        const createdJob = { ...job, ...body, jobId, remoteJobId, status: body?.status || 'queued', progress: body?.progress ?? 0 } as OcrJobStatus;
        this.jobs.set(jobId, createdJob);
        setTimeout(() => {
          this.poll(jobId).catch(() => {});
        }, 1200);
        return createdJob;
      }
    } catch {
      // No external OCR service configured; fall back to the in-process Tesseract implementation.
    }

    const fallbackJob: OcrJobStatus = {
      ...job,
      remoteJobId: jobId,
      status: 'processing',
      progress: 20,
    };
    this.jobs.set(jobId, fallbackJob);

    setTimeout(async () => {
      const processingJob = this.jobs.get(jobId);
      if (!processingJob) return;
      this.jobs.set(jobId, { ...processingJob, status: 'processing', progress: 40 });

      try {
        const result = await this.processFiles(files, claimId);
        const completeJob: OcrJobStatus = {
          jobId,
          remoteJobId: jobId,
          status: 'completed',
          progress: 100,
          result,
        };
        this.jobs.set(jobId, completeJob);

        const claim = OcrService.mapResultToClaim(result, claimId);
        const existing = this.claimsService.getAllClaims().find(c => c.id === claim.id);
        if (existing) {
          this.claimsService.updateClaim(claim.id, claim);
        } else {
          this.claimsService.createClaim(claim);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OCR processing failed';
        this.jobs.set(jobId, { ...this.jobs.get(jobId)!, status: 'failed', progress: 100, error: message });
      }
    }, 200);

    return fallbackJob;
  }

  async getJobStatus(jobId: string): Promise<OcrJobStatus | null> {
    return this.jobs.get(jobId) || null;
  }

  async getResult(jobId: string): Promise<OcrJobResult | null> {
    const job = this.jobs.get(jobId);
    if (job?.result) {
      return job.result;
    }

    const remoteJobId = job?.remoteJobId || jobId;
    try {
      const response = await fetch(`${(process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')}/jobs/${remoteJobId}/result`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        return null;
      }
      const result = await response.json() as OcrJobResult;
      if (result) {
        this.jobs.set(jobId, { ...job, ...this.jobs.get(jobId), jobId, remoteJobId, result });
      }
      return result;
    } catch {
      return null;
    }
  }

  private async poll(jobId: string): Promise<void> {
    const trackedJob = this.jobs.get(jobId);
    const remoteJobId = trackedJob?.remoteJobId || jobId;

    try {
      const response = await fetch(`${(process.env.OCR_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')}/jobs/${remoteJobId}`, {
        headers: { 'Content-Type': 'application/json' },
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
