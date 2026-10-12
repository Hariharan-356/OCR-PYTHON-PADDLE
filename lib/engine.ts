import {
  Claim,
  Provider,
  RuleConfig,
  Variance,
  ExceptionItem,
  LineItem,
  TariffVersion,
  TariffItem,
} from './types';
import {
  NOW,
  fmtINR,
  PROVIDERS,
  providerById,
  activeVersionFor,
  RULES,
  NON_MEDICAL_DOCS,
  LI,
  makeClaim,
  uid,
  dAgo,
  SAMPLE_NAMES,
} from './data';

export const PRIO_RANK: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export const RULE_META: Record<string, { type: string; name: string }> = {
  'RULE-PR-001': { type: 'Price variance', name: 'Billed unit price exceeds tariff ± tolerance' },
  'RULE-QT-002': { type: 'Quantity cap', name: 'Quantity exceeds per-day cap' },
  'RULE-QT-003': { type: 'Quantity cap', name: 'Quantity exceeds documented admission days' },
  'RULE-UC-001': { type: 'Uncontracted item', name: 'No tariff entry for provider/version' },
  'RULE-BN-001': { type: 'Bundled item', name: 'Consumable included in bundled service' },
  'RULE-DP-001': { type: 'Duplicate', name: 'Same code, date and quantity billed twice' },
};

export function tokens(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/[–\-()/.,]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !['per', 'the', 'with', 'and', 'of', 'to'].includes(w));
}

export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(t => {
    if (B.has(t)) inter++;
    else {
      for (const u of B) {
        if (u.startsWith(t.slice(0, 4)) && t.length > 3) {
          inter += 0.6;
          break;
        }
      }
    }
  });
  return Math.round((100 * inter) / Math.sqrt(A.size * B.size));
}

export function tariffVersionForClaim(c: Claim, providersList: Provider[] = PROVIDERS): TariffVersion | null {
  if (c.tariffVersionId) {
    const p = providersList.find(p => p.id === c.providerId);
    const v = p && p.versions.find(v => v.id === c.tariffVersionId);
    if (v) return v;
  }
  return activeVersionFor(c.providerId, c.admissionISO);
}

export function matchLine(c: Claim, li: LineItem, v: TariffVersion | null, rules: RuleConfig = RULES) {
  if (!v) return { method: 'none', item: null, score: 0, alternates: [] };
  const ov = c.matchOverrides[li.id];
  if (ov) {
    const it = v.items.find(i => i.code === ov);
    if (it) return { method: 'override', item: it, score: 100, alternates: [] };
  }
  if (li.code && li.code.startsWith('PH-')) return { method: 'pharmacy', item: null, score: 100, alternates: [] };
  if (li.code) {
    const it = v.items.find(i => i.code === li.code);
    if (it) return { method: 'code', item: it, score: 100, alternates: [] };
  }
  const scored = v.items
    .map(i => ({ item: i, score: similarity(li.desc, i.desc) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (scored.length && scored[0].score >= rules.fuzzyThreshold) {
    return { method: 'fuzzy', item: scored[0].item, score: scored[0].score, alternates: scored.slice(1) };
  }
  return { method: 'none', item: null, score: scored.length ? scored[0].score : 0, alternates: scored };
}

export function matchClaim(c: Claim, rules: RuleConfig = RULES, providersList: Provider[] = PROVIDERS) {
  const v = tariffVersionForClaim(c, providersList);
  return {
    version: v,
    rows: c.lineItems.map(li => Object.assign({ li }, matchLine(c, li, v, rules))),
  };
}

export function computeVariances(c: Claim, rules: RuleConfig = RULES, providersList: Provider[] = PROVIDERS): Variance[] {
  const m = matchClaim(c, rules, providersList);
  const out: Variance[] = [];
  const f = c.facts;
  const tol = rules.priceTolerancePct / 100;
  const los = Math.max(
    1,
    Math.round((new Date(f.discharge.split('-').reverse().join('-')).getTime() - new Date(f.admissionISO).getTime()) / 864e5)
  ) || f.los;
  const icuDoc = (() => {
    const d = c.docs.find(d => d.type === 'Discharge Summary');
    const x = d && d.fields.find(x => x.label === 'Days in ICU (documented)');
    return x ? parseInt(x.value, 10) || 0 : f.icuDays;
  })();

  const bundledBy: Record<string, TariffItem> = {};
  m.rows.forEach(r => {
    if (r.item && r.item.bundles) {
      r.item.bundles.forEach((b: string) => (bundledBy[b] = r.item));
    }
  });

  const seen: Record<string, LineItem> = {};
  m.rows.forEach(r => {
    const li = r.li;
    const key = (li.code || li.desc.toLowerCase()) + '|' + li.date + '|' + li.qty;
    if (r.method === 'pharmacy') return;
    if (!r.item) {
      if (li.medical) {
        out.push(
          V(
            c,
            li,
            'RULE-UC-001',
            li.net,
            `No entry for "${li.desc}" in ${m.version ? m.version.id : 'any tariff version'}${
              r.score ? ` (best fuzzy candidate ${(r.alternates[0] as any)?.item?.desc} at ${r.score}% — below ${rules.fuzzyThreshold}% threshold)` : ''
            }.`,
            { billed: li.net, expected: 0 }
          )
        );
      }
      return;
    }
    const t = r.item;
    if (seen[key]) {
      out.push(
        V(c, li, 'RULE-DP-001', li.net, `"${li.desc}" (${t.code}) already billed on ${li.date} qty ${li.qty} as "${seen[key].desc}".`, {
          billed: li.net,
          expected: 0,
        })
      );
      return;
    }
    seen[key] = li;

    if (bundledBy[t.code]) {
      const parent = bundledBy[t.code];
      out.push(
        V(
          c,
          li,
          'RULE-BN-001',
          li.net,
          `${t.desc} is included in ${parent.desc} (${parent.code}) per contract bundle rules; cannot be billed separately.`,
          { billed: li.net, expected: 0 }
        )
      );
      return;
    }

    if (li.unitPrice > t.price * (1 + tol)) {
      const diff = (li.unitPrice - t.price) * li.qty;
      const pct = Math.round((100 * (li.unitPrice - t.price)) / t.price);
      out.push(
        V(
          c,
          li,
          'RULE-PR-001',
          diff,
          `Billed ${fmtINR(li.unitPrice)} ${t.unit} vs contracted ${fmtINR(t.price)} ${t.unit} (+${pct}%, tolerance ${
            rules.priceTolerancePct
          }%). Version ${m.version?.id} effective ${m.version?.effectiveFrom}.`,
          { billed: li.unitPrice, expected: t.price, pct }
        )
      );
    }

    const cap = (rules as any).qtyCaps ? (rules as any).qtyCaps[t.code] : (t.code === 'DR-VIS' ? { perDay: 2 } : t.code === 'RR-DLX' ? { perAdmission: 'LOS' } : t.code === 'ICU-01' ? { perAdmission: 'ICU' } : null);
    if (cap) {
      let allowed: number | null = null;
      let basis = '';
      if (cap.perDay) {
        allowed = cap.perDay * los;
        basis = `${cap.perDay}/day × ${los} days LOS`;
      } else if (cap.perAdmission === 'LOS') {
        allowed = los;
        basis = `length of stay ${los} days (admission ${f.admission} → discharge ${f.discharge})`;
      } else if (cap.perAdmission === 'ICU') {
        allowed = icuDoc;
        basis = `discharge summary documents ${icuDoc} ICU day(s)`;
      }
      if (allowed != null && li.qty > allowed) {
        const excess = li.qty - allowed;
        out.push(
          V(
            c,
            li,
            cap.perDay ? 'RULE-QT-002' : 'RULE-QT-003',
            excess * Math.min(li.unitPrice, t.price),
            `Billed qty ${li.qty} exceeds allowed ${allowed} (${basis}). Excess ${excess} × ${fmtINR(
              Math.min(li.unitPrice, t.price)
            )}.`,
            { billed: li.qty, expected: allowed, diff: excess }
          )
        );
      }
    }
  });
  return out;
}

function V(c: Claim, li: LineItem, ruleId: string, amount: number, rationale: string, ev: any): Variance {
  const key = li.id + '|' + ruleId;
  const meta = RULE_META[ruleId] || { type: 'Variance', name: ruleId };
  const sev: 'Critical' | 'High' | 'Medium' | 'Low' =
    amount >= 20000 ? 'Critical' : amount >= 5000 ? 'High' : amount >= 1000 ? 'Medium' : 'Low';
  const dec = c.decisions[key] || { status: 'Open' };
  return {
    key,
    ruleId,
    type: meta.type,
    severity: sev,
    amount,
    rationale,
    ev,
    li,
    decision: dec,
    claim: c,
  };
}

export function claimTotals(c: Claim, rules: RuleConfig = RULES, providersList: Provider[] = PROVIDERS) {
  const vs = computeVariances(c, rules, providersList);
  const billed = c.lineItems.reduce((s, l) => s + l.net, 0);
  const nonMed = c.lineItems.filter(l => !l.medical).reduce((s, l) => s + l.net, 0);
  const accepted = vs.filter(v => v.decision.status === 'Accepted').reduce((s, v) => s + v.amount, 0);
  const open = vs.filter(v => v.decision.status === 'Open').reduce((s, v) => s + v.amount, 0);
  const flagged = vs.reduce((s, v) => s + v.amount, 0);
  return { billed, nonMed, flagged, accepted, open, variances: vs, payable: billed - nonMed - accepted };
}

export function computeExceptions(claimsList: Claim[], rules: RuleConfig = RULES, providersList: Provider[] = PROVIDERS): ExceptionItem[] {
  const out: any[] = [];
  claimsList.forEach(c => {
    if (c.status === 'Processing' || c.status === 'Updated in Claim Core') {
      if (c.ocrFallback && c.ocrFallback.queued) {
        out.push(
          E(c, 'OCR fallback', 'Document ingestion', c.ocrFallback.reason, 'High', c.receivedAt, '#/claims/' + c.id + '/documents', c.assignee || 'unassigned', rules)
        );
      }
      return;
    }
    c.docs.forEach(d =>
      d.fields.forEach(x => {
        if (!x.verified && x.conf < rules.confidenceThreshold) {
          out.push(
            E(
              c,
              'Low confidence',
              'Field validation',
              `${x.label} (${x.conf}%) in ${d.type}`,
              x.conf < 70 ? 'High' : 'Medium',
              c.receivedAt,
              '#/claims/' + c.id + '/review?doc=' + d.id + '&field=' + x.id,
              c.assignee,
              rules,
              { fieldId: x.id, docId: d.id, tab: 'review' }
            )
          );
        }
      })
    );
    computeVariances(c, rules, providersList).forEach(v => {
      if (v.decision.status !== 'Open') return;
      if (v.ruleId === 'RULE-UC-001' || v.severity === 'Critical' || v.severity === 'High') {
        out.push(
          E(
            c,
            v.ruleId === 'RULE-UC-001' ? 'Uncontracted item' : 'Variance review',
            'Variance panel',
            `${v.li.desc} · ${fmtINR(v.amount)}`,
            v.severity === 'Critical' ? 'Critical' : 'High',
            c.receivedAt,
            '#/claims/' + c.id + '/variances?v=' + encodeURIComponent(v.key),
            c.assignee,
            rules,
            { vkey: v.key, tab: 'variances' }
          )
        );
      }
    });
    c.escalations.forEach(e => {
      if (e.status === 'Open') {
        out.push(
          E(c, 'Escalation', e.to, e.reason, 'Critical', e.ts, '#/claims/' + c.id + '/variances', e.to === 'Network Manager' ? 'U4' : 'U5', rules, {
            escId: e.id,
            escalated: true,
            tab: 'variances',
          })
        );
      }
    });
  });
  return out.map((e, i) => Object.assign(e, { id: 'EXC-' + String(1001 + i) }));
}

function E(
  c: Claim,
  type: string,
  area: string,
  issue: string,
  priority: 'Critical' | 'High' | 'Medium' | 'Low',
  since: string,
  link: string,
  assignee: string | null,
  rules: RuleConfig,
  extra: any = {}
): ExceptionItem {
  const hrs = rules.slaHours[priority] || 4;
  const ageH = (NOW.getTime() - new Date(since).getTime()) / 3600e3;
  const pct = ageH / hrs;
  return Object.assign(
    {
      claimId: c.id,
      claim: c,
      type,
      area,
      issue,
      priority,
      since,
      ageH,
      slaHours: hrs,
      slaPct: pct,
      sla: pct >= 1 ? 'Breached' : pct >= 0.75 ? 'At risk' : 'On track',
      link,
      assignee,
      escalated: false,
    },
    extra
  );
}

export function validateFile(f: { name: string; size: number }, rules: RuleConfig = RULES): string | null {
  const ext = f.name.split('.').pop()?.toLowerCase() || '';
  if (!rules.allowedExt.includes(ext)) {
    return `415 Unsupported media type — .${ext} is not accepted (allowed: ${rules.allowedExt.join(', ')})`;
  }
  if (f.size > rules.maxFileMB * 1048576) {
    return `413 Content too large — ${(f.size / 1048576).toFixed(1)} MB exceeds the ${rules.maxFileMB} MB limit. Split the file or raise the limit in Admin → Rules.`;
  }
  if (f.size === 0) return '400 Bad request — file is empty';
  return null;
}

export function guessType(name: string): string {
  const n = name.toLowerCase();
  if (/pre.?auth|form.?c/i.test(n)) return 'Pre-Auth Form (Form C)';
  if (/claim.?form.?a/i.test(n)) return 'Claim Form A';
  if (/discharge/i.test(n)) return 'Discharge Summary';
  if (/hospital.*bill|final.*bill/i.test(n)) return 'Hospital Bill';
  if (/pharmacy/i.test(n)) return 'Pharmacy Bill';
  if (/cheque|passbook/i.test(n)) return 'Bank Details – Cheque / Passbook';
  if (/aadhaar|pan|passport|kyc/i.test(n)) return 'KYC – Identity Proof';
  if (/investigation|lab|report|radiology/i.test(n)) return 'Investigation Report';
  return 'Hospital Bill';
}

let _claimSeq = 1047;
export function createClaimFromUpload(
  files: Array<{ name: string; size: number }>,
  source: string,
  providerId: string,
  memberIn: string,
  currentClaims: Claim[],
  userId: string
): Claim {
  const p = providerById(providerId) || PROVIDERS[0];
  const who = SAMPLE_NAMES[_claimSeq % SAMPLE_NAMES.length];
  _claimSeq++;
  const num = String(_claimSeq).padStart(5, '0');
  const base = currentClaims[0]?.facts || ({} as any);
  const memberId = memberIn || 'MEM-' + String(7000000 + Math.floor(Math.random() * 999999));
  const admISO = dAgo(4).slice(0, 10);
  const adm = admISO.split('-').reverse().join('-');
  const dis = dAgo(1).slice(0, 10).split('-').reverse().join('-');
  const facts = Object.assign({}, base, {
    patient: who[0],
    gender: who[1],
    age: who[2],
    dob: who[3],
    memberId,
    policy: 'GHP-2026-00' + (40000 + Math.floor(Math.random() * 9999)),
    hospital: p.name,
    city: p.city,
    rohini: p.rohini,
    hospReg: base.hospReg || 'TN/CHN/2011/04521',
    hospAddress: p.city,
    admission: adm,
    admissionISO: admISO,
    discharge: dis,
    surgeryDate: adm,
    los: 3,
    icuDays: 1,
    billed: 0,
    billNo: 'HB/2026/' + (600000 + Math.floor(Math.random() * 99999)),
  });

  const li: LineItem[] = [
    LI('Hospital Bill', 'Registration', 'ADM-01', 1, 'per admission', 500, { category: 'Admin', medical: false, date: adm }),
    LI('Hospital Bill', 'Room rent – Deluxe single', 'RR-DLX', 3, 'per day', 7200, { category: 'Room', date: adm }),
    LI('Hospital Bill', 'Nursing charges', 'NUR-STD', 3, 'per day', 800, { category: 'Nursing', date: adm }),
    LI('Hospital Bill', 'ICU charges', 'ICU-01', 2, 'per day', 15500, { category: 'ICU', date: adm }),
    LI('Hospital Bill', 'Doctor visits', 'DR-VIS', 7, 'per visit', 950, { category: 'Consultation', date: adm }),
    LI('Hospital Bill', 'OT charges', 'OT-01', 1, 'per procedure', 18500, { category: 'Surgery', date: adm }),
    LI('Hospital Bill', 'Surgeon fees – Lap. appendectomy', 'SURG-APP', 1, 'per procedure', 36000, { category: 'Surgery', date: adm }),
    LI('Hospital Bill', 'Anaesthesia', 'ANES-01', 1, 'per procedure', 12000, { category: 'Surgery', date: adm }),
    LI('Hospital Bill', 'Complete blood count', 'LAB-CBC', 2, 'per test', 480, { category: 'Laboratory', date: adm }),
    LI('Hospital Bill', 'Ultrasound abdomen', 'RAD-USG', 1, 'per scan', 1900, { category: 'Radiology', date: adm }),
    LI('Hospital Bill', 'Patient diet', 'FOOD-01', 3, 'per day', 400, { category: 'Non-medical', medical: false, date: adm }),
    LI('Pharmacy Bill', 'Inj. Ceftriaxone 1g', 'PH-CEF', 6, 'vial', 180, { category: 'Pharmacy', batch: 'B2211/03-2027' }),
    LI('Pharmacy Bill', 'Syringe 5ml', 'CONS-SYR', 20, 'unit', 12, { category: 'Consumables' }),
  ];

  facts.billed = li.reduce((s, l) => s + l.net, 0);
  facts.gross = facts.billed + 3000;
  facts.discount = 3000;
  facts.pharmTotal = li.filter(l => l.bill === 'Pharmacy Bill').reduce((s, l) => s + l.net, 0);
  facts.expectedCost = facts.billed;

  const c = makeClaim({
    id: 'CLM-2026-' + num,
    providerId: p.id,
    source,
    receivedAt: new Date().toISOString(),
    status: 'Processing',
    stage: 1,
    assignee: userId,
    facts,
    docs: files.map(f => ({
      name: f.name,
      type: guessType(f.name),
      pages: /zip/.test(f.name) ? 3 : /form ?c|discharge|bill/i.test(f.name) ? 2 : 1,
      size: (f.size / 1048576).toFixed(1) + ' MB',
      handwritten: /form ?c|scan/i.test(f.name),
      detections: /bill|discharge|form/i.test(f.name) ? ['stamp', 'signature'] : [],
    })),
    diagnoses: currentClaims[0]?.diagnoses?.map(d => Object.assign({}, d)) || [],
    procedures: currentClaims[0]?.procedures?.map(d => Object.assign({}, d)) || [],
    icpSummary: `${who[2]}${who[1][0]}, acute appendicitis; laparoscopic appendectomy; discharged day 3.`,
    lineItems: li,
  });

  c.docs.forEach(d => {
    if (d.handwritten) {
      d.fields.forEach((x, i) => {
        if (i % 6 === 3) x.conf = Math.min(x.conf, 72);
      });
    }
  });

  return c;
}
