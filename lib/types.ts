export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
}

export interface RuleConfig {
  priceTolerancePct: number;
  confidenceThreshold: number;
  fuzzyThreshold: number;
  maxFileMB: number;
  slaHours: {
    Critical: number;
    High: number;
    Medium: number;
    Low: number;
    [key: string]: number;
  };
  allowedExt: string[];
  qtyCaps?: Record<string, any>;
  [key: string]: any;
}

export interface TariffItem {
  code: string;
  desc: string;
  unit: string;
  price: number;
  category: string;
  medical?: boolean;
  cap?: string | null;
  bundles?: string[];
  [key: string]: any;
}

export interface TariffVersion {
  id: string;
  label?: string;
  contract?: string;
  effectiveFrom: string;
  effectiveTo: string;
  file?: string;
  clause?: string;
  discountNote?: string;
  source?: string;
  uploaded?: string;
  status?: string;
  items: TariffItem[];
  [key: string]: any;
}

export interface Provider {
  id: string;
  name: string;
  city: string;
  rohini: string;
  versions: TariffVersion[];
  [key: string]: any;
}

export interface ClaimField {
  id: string;
  section: string;
  label: string;
  value: string;
  conf: number;
  original: string;
  verified: boolean;
  history: Array<{ ts: string; user: string; before?: string; after?: string; action?: string }>;
  masked?: boolean;
  detect?: string | null;
}

export interface ClaimPage {
  n: number;
  cls: string;
  conf: number;
  label: string;
}

export interface ClaimDocument {
  id: string;
  name: string;
  type: string;
  source: string;
  size: string;
  ext: string;
  uploaded: string;
  ocrStatus: string;
  handwritten: boolean;
  language: string;
  pages: ClaimPage[];
  fields: ClaimField[];
  detections: string[];
  medical: boolean;
  validated: boolean;
  masked?: boolean;
}

export interface Diagnosis {
  icd: string;
  desc: string;
  primary: boolean;
}

export interface Procedure {
  pcs: string;
  desc: string;
  date?: string;
  primary?: boolean;
}

export interface LineItem {
  id: string;
  bill: string;
  desc: string;
  code: string;
  qty: number;
  unit: string;
  unitPrice: number;
  gross: number;
  discount: number;
  net: number;
  category: string;
  medical: boolean;
  date?: string;
  batch?: string;
  notes?: string;
  [key: string]: any;
}

export interface AuditEntry {
  id: string;
  ts: string;
  user: string;
  entity: string;
  action: string;
  detail: string;
  before?: any;
  after?: any;
}

export interface ClaimCoreStatus {
  status: string;
  attempts: number;
  history: Array<{ ts: string; attempt: number; code: number; msg: string }>;
  idempotencyKey: string | null;
  lastSync?: string | null;
  reconciled?: boolean;
}

export interface ClaimFacts {
  patient: string;
  gender: string;
  age: number;
  dob: string;
  phone: string;
  memberId: string;
  policy: string;
  corporate?: string;
  occupation?: string;
  address?: string;
  hospital: string;
  city: string;
  rohini: string;
  hospReg?: string;
  hospAddress?: string;
  gst?: string;
  doctor: string;
  doctorPhone?: string;
  pathologist?: string;
  complaint?: string;
  duration?: string;
  admission: string;
  discharge: string;
  admissionISO: string;
  roomCategory?: string;
  bedNo?: string;
  los: number;
  icuDays: number;
  billed: number;
  gross?: number;
  discount?: number;
  pharmTotal?: number;
  expectedCost?: number;
  billNo?: string;
  [key: string]: any;
}

export interface Claim {
  id: string;
  patient: string;
  memberId: string;
  policy: string;
  providerId: string;
  hospital: string;
  city: string;
  admission: string;
  discharge: string;
  admissionISO: string;
  source: string;
  receivedAt: string;
  status: string;
  stage: number;
  lob: string;
  claimType: string;
  billed: number;
  docs: ClaimDocument[];
  facts: ClaimFacts;
  diagnoses: Diagnosis[];
  procedures: Procedure[];
  icpSummary: string;
  lineItems: LineItem[];
  tariffVersionId: string | null;
  tariffOverride: boolean;
  matchOverrides: Record<string, string>;
  decisions: Record<string, { status: string; comment?: string; by?: string }>;
  escalations: Array<{ id: string; ts: string; by: string; to: string; reason: string; status: string; ref?: string }>;
  audit: AuditEntry[];
  notes: any[];
  claimCore: ClaimCoreStatus;
  assignee: string | null;
  ocrFallback?: any;
  reviewer?: string;
}

export interface VarianceEvidence {
  billed: number;
  expected: number;
  code?: string;
  ruleVal?: string;
  diff?: number;
}

export interface Variance {
  key: string;
  ruleId: string;
  type: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  amount: number;
  rationale: string;
  ev: VarianceEvidence;
  li: LineItem;
  decision: { status: string; by?: string; comment?: string };
  claim?: Claim;
}

export interface ExceptionItem {
  id: string;
  claimId: string;
  claim: Claim;
  type: string;
  area: string;
  issue: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  since: string;
  ageH: number;
  slaHours: number;
  slaPct: number;
  sla: 'Breached' | 'At risk' | 'On track';
  link: string;
  assignee: string | null;
  escalated: boolean;
  tab?: string;
}

export interface NotificationItem {
  id: string;
  ts: string;
  text: string;
  kind: 'ok' | 'warn' | 'bad' | 'info';
  read: boolean;
  link: string | null;
}

export interface SystemLogItem {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'AUDIT';
  corr: string;
  msg: string;
}
