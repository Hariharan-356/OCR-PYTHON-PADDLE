'use client';

import React, { useState, useRef } from 'react';
import { useClaimsStore } from '../../lib/store';
import { fmtINR } from '../../lib/data';
import { validateFile, createClaimFromUpload, computeVariances, computeExceptions } from '../../lib/engine';

export function IntakeView() {
  const {
    claims,
    addClaim,
    providers,
    rules,
    user,
    can,
    navigate,
    toast,
    addNotification,
    exceptions,
  } = useClaimsStore();

  const [source, setSource] = useState('IHX');
  const [attachClaimId, setAttachClaimId] = useState('');
  const [providerId, setProviderId] = useState(providers[0]?.id || 'PRV-001');
  const [memberId, setMemberId] = useState('');
  const [pendingFiles, setPendingFiles] = useState<Array<{ name: string; size: number; error?: string | null; sample?: boolean }>>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState(0);
  const [ingestSteps, setIngestSteps] = useState<Array<{ title: string; note: string; done: boolean }>>([]);
  const [createdClaim, setCreatedClaim] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const todayClaims = claims.filter(c => {
    const hours = (Date.now() - new Date(c.receivedAt).getTime()) / 3600e3;
    return hours < 24;
  }).length;

  const pendingReview = claims.filter(c => ['In review', 'Variance review', 'Exception'].includes(c.status)).length;
  const autoClaims = claims.filter(c => c.stage >= 7).length;
  const breachedCount = exceptions.filter(e => e.sla === 'Breached').length;
  const atRiskCount = exceptions.filter(e => e.sla === 'At risk').length;

  const handleAddFiles = (newFiles: File[] | Array<{ name: string; size: number; sample?: boolean }>) => {
    const updated = [...pendingFiles];
    newFiles.forEach(f => {
      if (updated.some(p => p.name === f.name && p.size === f.size)) return;
      const error = validateFile(f, rules);
      updated.push({
        name: f.name,
        size: f.size,
        error,
        sample: (f as any).sample,
      });
    });
    setPendingFiles(updated);
  };

  const loadSampleBundle = () => {
    const samples = [
      { name: 'FormC_PreAuth_scanned.pdf', size: 2.6 * 1048576, sample: true },
      { name: 'Discharge_Summary.pdf', size: 1.1 * 1048576, sample: true },
      { name: 'Hospital_Final_Bill.pdf', size: 0.9 * 1048576, sample: true },
      { name: 'Pharmacy_Bills.zip', size: 3.4 * 1048576, sample: true },
      { name: 'Lab_Reports.pdf', size: 0.7 * 1048576, sample: true },
      { name: 'Aadhaar_Front.jpg', size: 1.9 * 1048576, sample: true },
      { name: 'Cancelled_Cheque.png', size: 0.8 * 1048576, sample: true },
    ];
    handleAddFiles(samples);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const startIngestion = async () => {
    if (pendingFiles.length === 0 || isIngesting) return;
    setIsIngesting(true);
    setCreatedClaim(null);

    const steps = [
      ['Validating & virus scan', 'All files within type/size policy'],
      ['Uploading', 'Streaming to Document service (S3 on-prem)'],
      ['OCR & extraction', 'Table-aware OCR, orientation correction, confidence per field'],
      ['Classification', 'Per-page classification with medical / non-medical split'],
      ['Structurization', 'Dates, units and currency normalized; ICD/PCS mapped'],
      ['Tariff matching', 'Version selected by provider & effective date; code-first then fuzzy'],
      ['Variance detection', 'Price, quantity, uncontracted, bundled, duplicate rules'],
      ['Exception routing', 'Low-confidence fields and high-severity flags queued'],
    ];

    const currentStepList = steps.map(([t, n]) => ({ title: t, note: n, done: false }));
    setIngestSteps(currentStepList);

    let claim: any = null;

    for (let i = 0; i < steps.length; i++) {
      setIngestProgress(Math.round((100 * (i + 0.5)) / steps.length));
      await sleep(i === 2 ? 800 : i === 3 ? 600 : 400);

      let note = '';
      if (i === 1) {
        claim = createClaimFromUpload(pendingFiles, source, providerId, memberId, claims, user.id);
        note = `Created ${claim.id} for ${claim.patient}`;
        // Persist files to NestJS local filesystem (uploads/) and metadata to SQLite
        try {
          const formData = new FormData();
          pendingFiles.forEach(f => {
            formData.append('files', new Blob([`Simulated document content for ${f.name}`], { type: 'application/pdf' }), f.name);
          });
          formData.append('claimId', claim.id);
          fetch('http://localhost:3001/api/upload', {
            method: 'POST',
            body: formData,
          }).catch(() => {});
        } catch (_) {}
      }
      if (i === 2 && claim) {
        const nf = claim.docs.reduce((s: number, d: any) => s + d.fields.length, 0);
        const low = claim.docs.reduce((s: number, d: any) => s + d.fields.filter((x: any) => x.conf < rules.confidenceThreshold).length, 0);
        note = `${nf} fields extracted · ${low} below ${rules.confidenceThreshold}% threshold`;
        claim.stage = 2;
      }
      if (i === 3 && claim) {
        const pages = claim.docs.reduce((s: number, d: any) => s + d.pages.length, 0);
        note = `${claim.docs.length} documents, ${pages} pages · ${claim.docs.filter((d: any) => d.medical).length} medical / ${
          claim.docs.filter((d: any) => !d.medical).length
        } non-medical · 0.8 s`;
        claim.stage = 3;
      }
      if (i === 4 && claim) {
        note = `Primary diagnosis ${claim.diagnoses[0]?.icd || 'K35.80'}; ${claim.lineItems.length} line items structured`;
        claim.stage = 4;
      }
      if (i === 5 && claim) {
        note = `Version TV-APO-2026 effective 2026-01-01 · 9 code, 3 fuzzy, 1 unmatched`;
        claim.stage = 5;
      }
      if (i === 6 && claim) {
        const vs = computeVariances(claim, rules, providers);
        note = vs.length ? `${vs.length} flag(s) · ${fmtINR(vs.reduce((s, v) => s + v.amount, 0))}` : 'No variances';
        claim.stage = 6;
        claim.status = vs.length ? 'Variance review' : 'In review';
        if (vs.length) {
          addNotification(
            `${vs.length} variances flagged on ${claim.id} (${fmtINR(vs.reduce((s, v) => s + v.amount, 0))})`,
            'warn',
            `#/claims/${claim.id}/variances`
          );
        }
      }
      if (i === 7 && claim) {
        const ex = computeExceptions([claim], rules, providers);
        note = `${ex.length} exception(s) queued`;
        if (!ex.length) {
          claim.status = 'Approved';
          claim.stage = 7;
        }
      }

      currentStepList[i] = {
        title: steps[i][0],
        note: note || steps[i][1],
        done: true,
      };
      setIngestSteps([...currentStepList]);
    }

    setIngestProgress(100);
    if (claim) {
      addClaim(claim);
      setCreatedClaim(claim);
      addNotification(`Ingestion success: ${pendingFiles.length} document(s) received for ${claim.id} via ${source}`, 'ok', `#/claims/${claim.id}/documents`);
      toast(`${claim.id} processed`, 'ok');
    }
    setIsIngesting(false);
    setPendingFiles([]);
  };

  const statusBadge = (s: string) => {
    const m: Record<string, string> = {
      Processing: 'b-blue',
      'In review': 'b-amber',
      'Variance review': 'b-red',
      Exception: 'b-red',
      Approved: 'b-green',
      'Updated in Claim Core': 'b-teal',
      Rejected: 'b-gray',
    };
    return <span className={`badge ${m[s] || 'b-gray'}`}>{s}</span>;
  };

  return (
    <div>
      {/* KPI row */}
      <div className="grid g-4 mb">
        <div className="kpi">
          <div className="l">Claims received (24h)</div>
          <div className="v">{todayClaims}</div>
          <div className="d">{claims.length} in the last 7 days</div>
        </div>
        <div className="kpi good">
          <div className="l">Straight-through</div>
          <div className="v">{Math.round((100 * autoClaims) / claims.length)}%</div>
          <div className="d">{autoClaims} of {claims.length} needed no manual step</div>
        </div>
        <div className={`kpi ${pendingReview ? 'warn' : ''}`}>
          <div className="l">Awaiting action</div>
          <div className="v">{pendingReview}</div>
          <div className="d">{exceptions.length} open exceptions</div>
        </div>
        <div className={`kpi ${breachedCount > 0 ? 'bad' : ''}`}>
          <div className="l">SLA breached</div>
          <div className="v">{breachedCount}</div>
          <div className="d">{atRiskCount} at risk</div>
        </div>
      </div>

      {/* Main row: Upload & Recent claims */}
      <div className="grid g-3-2">
        <div className="card">
          <div className="card-head">
            <h3>Upload claim documents</h3>
            <span className="small muted">
              PDF, DOC/DOCX, HTML, XLSX, PNG, JPG, TIFF, ZIP · up to {rules.maxFileMB} MB each
            </span>
          </div>
          <div className="card-body">
            {can('upload') ? (
              <>
                <div className="form-grid mb">
                  <div className="field">
                    <label>Source channel</label>
                    <select value={source} onChange={e => setSource(e.target.value)}>
                      <option>IHX</option>
                      <option>ClaimBook</option>
                      <option>Email (cashless@acme.com)</option>
                      <option>SFTP</option>
                      <option>Manual upload</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Attach to claim</label>
                    <select value={attachClaimId} onChange={e => setAttachClaimId(e.target.value)}>
                      <option value="">New claim (auto-create)</option>
                      {claims.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.id} · {c.patient}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!attachClaimId && (
                    <>
                      <div className="field">
                        <label>Hospital / provider</label>
                        <select value={providerId} onChange={e => setProviderId(e.target.value)}>
                          {providers.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>
                          Member id <span className="hint">(optional – read from Form C if blank)</span>
                        </label>
                        <input
                          placeholder="MEM-0000000"
                          value={memberId}
                          onChange={e => setMemberId(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div
                  className={`dropzone ${isDragOver ? 'over' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label="Upload files"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files) {
                      handleAddFiles(Array.from(e.dataTransfer.files));
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <strong>Drop files here or click to browse</strong>
                  <span>Each file is validated for type and size before ingestion. ZIP bundles are expanded and each page classified.</span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files) {
                      handleAddFiles(Array.from(e.target.files));
                      e.target.value = '';
                    }
                  }}
                />

                {pendingFiles.length > 0 && (
                  <ul className="file-list">
                    {pendingFiles.map((f, i) => (
                      <li key={i} className={f.error ? 'bad' : ''}>
                        <div className="fname">{f.name}</div>
                        <div className="fmeta">{(f.size / 1048576).toFixed(1)} MB</div>
                        {f.error ? (
                          <div className="ferr">{f.error}</div>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setPendingFiles(pendingFiles.filter((_, idx) => idx !== i))}
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="row mt" style={{ justifyContent: 'space-between' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    id="load-sample"
                    disabled={isIngesting}
                    onClick={loadSampleBundle}
                  >
                    Use sample bundle (7 documents)
                  </button>
                  <div className="row">
                    <button
                      className="btn btn-ghost btn-sm"
                      id="clear-files"
                      disabled={isIngesting || pendingFiles.length === 0}
                      onClick={() => setPendingFiles([])}
                    >
                      Clear
                    </button>
                    <button
                      className="btn btn-primary"
                      id="start-ingest"
                      disabled={isIngesting || pendingFiles.length === 0 || pendingFiles.some(f => !!f.error)}
                      onClick={startIngestion}
                    >
                      Start ingestion
                    </button>
                  </div>
                </div>

                {isIngesting && (
                  <div id="ingest-progress" className="mt">
                    <div className="progress mb" style={{ marginBottom: '10px' }}>
                      <i style={{ width: `${ingestProgress}%` }} />
                    </div>
                    <ul className="timeline">
                      {ingestSteps.map((s, idx) => (
                        <li key={idx}>
                          <strong>{s.title}</strong> {s.done ? '✓' : '…'}
                          <small>{s.note}</small>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {createdClaim && (
                  <div className="callout ok mt">
                    <div>
                      <strong>{createdClaim.id} is ready.</strong> Status: {createdClaim.status}.{' '}
                      <a
                        href={`#/claims/${createdClaim.id}`}
                        onClick={e => {
                          e.preventDefault();
                          navigate(`claims/${createdClaim.id}`);
                        }}
                      >
                        Open the claim workspace
                      </a>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="callout warn">
                <div>
                  Your role ({user.role}) cannot upload documents. Switch to a Claims Processor, Team Lead or Admin from the user menu.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent claims */}
        <div className="card">
          <div className="card-head">
            <h3>Recent claims</h3>
            <a
              className="btn btn-ghost btn-sm"
              href="#/claims"
              onClick={e => {
                e.preventDefault();
                navigate('claims');
              }}
            >
              View all
            </a>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <tbody>
                {claims
                  .slice()
                  .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
                  .slice(0, 6)
                  .map(c => (
                    <tr
                      key={c.id}
                      className="clickable"
                      onClick={() => navigate(`claims/${c.id}`)}
                    >
                      <td>
                        <div className="id">{c.id}</div>
                        <div className="small muted">
                          {c.patient} · {c.hospital.split(',')[0]}
                        </div>
                      </td>
                      <td className="right">
                        {statusBadge(c.status)}
                        <div className="small mono mt" style={{ marginTop: '4px' }}>
                          {fmtINR(c.billed)}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom row: Ingestion channels & Service health */}
      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head">
            <h3>Ingestion channels (today)</h3>
          </div>
          <div className="card-body">
            {[
              ['IHX', 95, 'Primary cashless feed'],
              ['ClaimBook', 4, 'Empanelled hospitals without IHX'],
              ['Email', 1, 'cashless@acme.com mailbox'],
              ['SFTP', 0, 'Batch drops from TPAs'],
            ].map(([n, p, d]) => (
              <div key={n as string} className="bar-h">
                <span className="lbl">
                  {n}
                  <br />
                  <span className="small faint">{d}</span>
                </span>
                <span className="bar">
                  <i style={{ width: `${p}%` }} />
                </span>
                <span className="val">{p}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Service health</h3>
            <span className="small muted">Live status of dependencies</span>
          </div>
          <div className="card-body">
            {[
              ['Document / OCR service', 'Degraded', 'var(--amber)', 'Circuit half-open after 504s; fallback OCR active'],
              ['Classification service', 'Healthy', 'var(--green)', 'p95 0.8 s'],
              ['Tariff DB', 'Healthy', 'var(--green)', '5 providers, 7 versions'],
              ['Claim Core API', 'Healthy', 'var(--green)', 'Last sync 2 min ago'],
              ['Provider / Contract master', 'Healthy', 'var(--green)', 'Nightly sync OK'],
            ].map(([n, s, c, d]) => (
              <div
                key={n as string}
                className="row"
                style={{
                  justifyContent: 'space-between',
                  padding: '7px 0',
                  borderBottom: '1px solid var(--line-soft)',
                }}
              >
                <span>
                  <span className="status-dot" style={{ background: c as string }} />
                  {n}
                </span>
                <span className="small muted">
                  {d} · <strong style={{ color: c as string }}>{s}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
