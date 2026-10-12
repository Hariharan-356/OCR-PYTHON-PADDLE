import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { CLAIMS, PROVIDERS, INITIAL_RULES, INITIAL_LOGS } from '../lib/data';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'claims.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  onModuleInit() {
    this.initTables();
    this.seedData();
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
    }
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        patient TEXT,
        memberId TEXT,
        policy TEXT,
        providerId TEXT,
        hospital TEXT,
        city TEXT,
        admission TEXT,
        discharge TEXT,
        admissionISO TEXT,
        source TEXT,
        receivedAt TEXT,
        status TEXT,
        stage INTEGER,
        lob TEXT,
        claimType TEXT,
        billed REAL,
        data TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        claimId TEXT,
        originalName TEXT,
        filename TEXT,
        mimetype TEXT,
        size INTEGER,
        filePath TEXT,
        fileExt TEXT,
        ocrStatus TEXT,
        docType TEXT,
        metadata TEXT,
        uploadedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT,
        city TEXT,
        rohini TEXT,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        config TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT,
        level TEXT,
        corr TEXT,
        msg TEXT
      );
    `);
  }

  private seedData() {
    const claimCount = this.db.prepare('SELECT COUNT(*) as count FROM claims').get() as { count: number };
    if (claimCount.count === 0) {
      const insertClaim = this.db.prepare(`
        INSERT INTO claims (id, patient, memberId, policy, providerId, hospital, city, admission, discharge, admissionISO, source, receivedAt, status, stage, lob, claimType, billed, data, createdAt, updatedAt)
        VALUES (@id, @patient, @memberId, @policy, @providerId, @hospital, @city, @admission, @discharge, @admissionISO, @source, @receivedAt, @status, @stage, @lob, @claimType, @billed, @data, @createdAt, @updatedAt)
      `);

      const now = new Date().toISOString();
      const insertMany = this.db.transaction((items: any[]) => {
        for (const c of items) {
          insertClaim.run({
            id: c.id,
            patient: c.patient,
            memberId: c.memberId,
            policy: c.policy,
            providerId: c.providerId,
            hospital: c.hospital,
            city: c.city,
            admission: c.admission,
            discharge: c.discharge,
            admissionISO: c.admissionISO,
            source: c.source,
            receivedAt: c.receivedAt,
            status: c.status,
            stage: c.stage,
            lob: c.lob || 'Group Health',
            claimType: c.claimType || 'Cashless',
            billed: c.billed,
            data: JSON.stringify(c),
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      insertMany(CLAIMS);
    }

    const providerCount = this.db.prepare('SELECT COUNT(*) as count FROM providers').get() as { count: number };
    if (providerCount.count === 0) {
      const insertProv = this.db.prepare(`
        INSERT INTO providers (id, name, city, rohini, data)
        VALUES (@id, @name, @city, @rohini, @data)
      `);

      const insertManyProv = this.db.transaction((items: any[]) => {
        for (const p of items) {
          insertProv.run({
            id: p.id,
            name: p.name,
            city: p.city,
            rohini: p.rohini,
            data: JSON.stringify(p),
          });
        }
      });

      insertManyProv(PROVIDERS);
    }

    const ruleCount = this.db.prepare('SELECT COUNT(*) as count FROM rules').get() as { count: number };
    if (ruleCount.count === 0) {
      this.db.prepare(`
        INSERT INTO rules (id, config, updatedAt)
        VALUES ('default', ?, ?)
      `).run(JSON.stringify(INITIAL_RULES), new Date().toISOString());
    }

    const logCount = this.db.prepare('SELECT COUNT(*) as count FROM system_logs').get() as { count: number };
    if (logCount.count === 0) {
      const insertLog = this.db.prepare(`
        INSERT INTO system_logs (ts, level, corr, msg)
        VALUES (@ts, @level, @corr, @msg)
      `);

      const insertManyLogs = this.db.transaction((items: any[]) => {
        for (const l of items) {
          insertLog.run(l);
        }
      });

      insertManyLogs(INITIAL_LOGS);
    }
  }

  // Claim methods
  getAllClaims(): any[] {
    const rows = this.db.prepare('SELECT data FROM claims ORDER BY receivedAt DESC').all() as Array<{ data: string }>;
    return rows.map(r => JSON.parse(r.data));
  }

  getClaimById(id: string): any | null {
    const row = this.db.prepare('SELECT data FROM claims WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  saveClaim(claim: any) {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT id FROM claims WHERE id = ?').get(claim.id);

    if (existing) {
      this.db.prepare(`
        UPDATE claims SET
          patient = @patient,
          memberId = @memberId,
          policy = @policy,
          providerId = @providerId,
          hospital = @hospital,
          city = @city,
          admission = @admission,
          discharge = @discharge,
          admissionISO = @admissionISO,
          source = @source,
          receivedAt = @receivedAt,
          status = @status,
          stage = @stage,
          lob = @lob,
          claimType = @claimType,
          billed = @billed,
          data = @data,
          updatedAt = @updatedAt
        WHERE id = @id
      `).run({
        id: claim.id,
        patient: claim.patient,
        memberId: claim.memberId,
        policy: claim.policy,
        providerId: claim.providerId,
        hospital: claim.hospital,
        city: claim.city,
        admission: claim.admission,
        discharge: claim.discharge,
        admissionISO: claim.admissionISO,
        source: claim.source,
        receivedAt: claim.receivedAt,
        status: claim.status,
        stage: claim.stage,
        lob: claim.lob || 'Group Health',
        claimType: claim.claimType || 'Cashless',
        billed: claim.billed,
        data: JSON.stringify(claim),
        updatedAt: now,
      });
    } else {
      this.db.prepare(`
        INSERT INTO claims (id, patient, memberId, policy, providerId, hospital, city, admission, discharge, admissionISO, source, receivedAt, status, stage, lob, claimType, billed, data, createdAt, updatedAt)
        VALUES (@id, @patient, @memberId, @policy, @providerId, @hospital, @city, @admission, @discharge, @admissionISO, @source, @receivedAt, @status, @stage, @lob, @claimType, @billed, @data, @createdAt, @updatedAt)
      `).run({
        id: claim.id,
        patient: claim.patient,
        memberId: claim.memberId,
        policy: claim.policy,
        providerId: claim.providerId,
        hospital: claim.hospital,
        city: claim.city,
        admission: claim.admission,
        discharge: claim.discharge,
        admissionISO: claim.admissionISO,
        source: claim.source,
        receivedAt: claim.receivedAt,
        status: claim.status,
        stage: claim.stage,
        lob: claim.lob || 'Group Health',
        claimType: claim.claimType || 'Cashless',
        billed: claim.billed,
        data: JSON.stringify(claim),
        createdAt: now,
        updatedAt: now,
      });
    }

    return claim;
  }

  // Document methods
  saveDocumentMetadata(doc: {
    id: string;
    claimId: string;
    originalName: string;
    filename: string;
    mimetype: string;
    size: number;
    filePath: string;
    fileExt: string;
    ocrStatus: string;
    docType: string;
    metadata?: any;
  }) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, claimId, originalName, filename, mimetype, size, filePath, fileExt, ocrStatus, docType, metadata, uploadedAt)
      VALUES (@id, @claimId, @originalName, @filename, @mimetype, @size, @filePath, @fileExt, @ocrStatus, @docType, @metadata, @uploadedAt)
    `).run({
      id: doc.id,
      claimId: doc.claimId,
      originalName: doc.originalName,
      filename: doc.filename,
      mimetype: doc.mimetype,
      size: doc.size,
      filePath: doc.filePath,
      fileExt: doc.fileExt,
      ocrStatus: doc.ocrStatus,
      docType: doc.docType,
      metadata: JSON.stringify(doc.metadata || {}),
      uploadedAt: now,
    });
  }

  getDocumentMetadata(id: string) {
    return this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  }

  getDocumentsByClaim(claimId: string): any[] {
    return this.db.prepare('SELECT * FROM documents WHERE claimId = ? ORDER BY uploadedAt DESC').all(claimId);
  }

  // Providers & Rules
  getAllProviders(): any[] {
    const rows = this.db.prepare('SELECT data FROM providers').all() as Array<{ data: string }>;
    return rows.map(r => JSON.parse(r.data));
  }

  getRules(): any {
    const row = this.db.prepare("SELECT config FROM rules WHERE id = 'default'").get() as { config: string } | undefined;
    return row ? JSON.parse(row.config) : INITIAL_RULES;
  }

  saveRules(rulesConfig: any) {
    this.db.prepare(`
      INSERT OR REPLACE INTO rules (id, config, updatedAt)
      VALUES ('default', ?, ?)
    `).run(JSON.stringify(rulesConfig), new Date().toISOString());
    return rulesConfig;
  }

  getSystemLogs(): any[] {
    return this.db.prepare('SELECT * FROM system_logs ORDER BY id DESC LIMIT 50').all();
  }

  addSystemLog(log: { ts: string; level: string; corr: string; msg: string }) {
    this.db.prepare(`
      INSERT INTO system_logs (ts, level, corr, msg)
      VALUES (@ts, @level, @corr, @msg)
    `).run(log);
  }
}
