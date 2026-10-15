import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { Claim } from '../lib/types';

@Injectable()
export class ClaimsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  getAllClaims(): Claim[] {
    return this.db.getAllClaims();
  }

  getClaimById(id: string): Claim {
    const claim = this.db.getClaimById(id);
    if (!claim) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }
    return claim;
  }

  createClaim(claim: Claim): Claim {
    return this.db.saveClaim(claim);
  }

  upsertClaim(claim: Claim): Claim {
    const existing = this.db.getClaimById(claim.id);
    if (existing) {
      return this.updateClaim(claim.id, claim);
    }
    return this.createClaim(claim);
  }

  updateClaim(id: string, claimData: Partial<Claim>): Claim {
    const existing = this.getClaimById(id);
    const updated = {
      ...existing,
      ...claimData,
      id,
    };
    return this.db.saveClaim(updated);
  }

  saveDocumentRecord(doc: {
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
    this.db.saveDocumentMetadata(doc);
  }

  getDocumentRecord(id: string) {
    return this.db.getDocumentMetadata(id);
  }

  getProviders() {
    return this.db.getAllProviders();
  }

  getRules() {
    return this.db.getRules();
  }

  updateRules(rulesConfig: any) {
    return this.db.saveRules(rulesConfig);
  }

  getSystemLogs() {
    return this.db.getSystemLogs();
  }
}
