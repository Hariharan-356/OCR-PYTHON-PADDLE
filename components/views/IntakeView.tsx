'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useClaimsStore } from '../../lib/store';
import { fmtINR } from '../../lib/data';
import { validateFile, computeVariances, computeExceptions } from '../../lib/engine';

export function IntakeView() {
  const {
    claims,
    setClaims,
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

  const [source, setSource] = useState('');
  const [attachClaimId, setAttachClaimId] = useState('');
  const [providerId, setProviderId] = useState(providers[0]?.id || '');
  const [memberId, setMemberId] = useState('');
  const [pendingFiles, setPendingFiles] = useState<Array<{ name: string; size: number; error?: string | null; sample?: boolean; file?: File }>>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState(0);
  const [ingestSteps, setIngestSteps] = useState<Array<{ title: string; note: string; done: boolean }>>([]);
  const [createdClaim, setCreatedClaim] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (providers.length && !providerId) {
      setProviderId(providers[0].id);
    }
  }, [providers, providerId]);

  const todayClaims = claims.filter(c => {
    const hours = (Date.now() - new Date(c.receivedAt).getTime()) / 3600e3;
    return hours < 24;
  }).length;

  const pendingReview = claims.filter(c => ['In review', 'Variance review', 'Exception'].includes(c.status)).length;
  const autoClaims = claims.filter(c => c.stage >= 7).length;
  const breachedCount = exceptions.filter(e => e.sla === 'Breached').length;
  const atRiskCount = exceptions.filter(e => e.sla === 'At risk').length;

  const channelData = Array.from(
    claims.reduce((map, claim) => {
      const key = claim.source || 'Manual upload';
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([name, count]) => ({
    name,
    value: claims.length ? Math.max(5, Math.round((count / claims.length) * 100)) : 0,
    detail: `${count} claim(s)`,
  }));

  const handleAddFiles = (newFiles: File[] | Array<{ name: string; size: number; sample?: boolean; file?: File }>) => {
    const updated = [...pendingFiles];
    newFiles.forEach(f => {
      const file = f instanceof File ? f : (f as any).file instanceof File ? (f as any).file : undefined;
      if (updated.some(p => p.name === f.name && p.size === f.size)) return;
      const error = file ? validateFile(file, rules) : validateFile(new File([''], f.name, { type: 'application/octet-stream' }), rules);
      updated.push({
        name: f.name,
        size: f.size,
        error,
        sample: (f as any).sample,
        file,
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

    const formData = new FormData();
    pendingFiles.forEach(file => {
      const filename = file.name.toLowerCase();
      const type = filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' : filename.endsWith('.png') ? 'image/png' : 'application/octet-stream';
      const actualFile = file.file instanceof File
        ? file.file
        : new File([`Hospital Bill\nPatient: Sample claimant\nMember ID: MEM-900112\nPolicy: GHP-2026-004500\nHospital: Apollo Hospitals Chennai\nDate of admission: 14/10/2026\nDate of discharge: 16/10/2026\nTotal amount paid: ₹24500\n`], file.name, { type });
      formData.append('files', actualFile);
    });

    if (source) {
      formData.append('source', source);
    }
    if (attachClaimId) {
      formData.append('claimId', attachClaimId);
    }
    if (memberId) {
      formData.append('memberId', memberId);
    }

    let uploadResult: any = null;
    let claimList: any[] = [];

    try {
      setIngestProgress(30);
      currentStepList[1] = { ...currentStepList[1], note: `Uploading ${pendingFiles.length} document(s) to the API`, done: true };
      setIngestSteps([...currentStepList]);

      const response = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData,
      });

      uploadResult = response.ok ? await response.json() : null;
      if (!uploadResult || !uploadResult.jobId) {
        throw new Error('Upload accepted but no OCR job was returned.');
      }

      const liveClaims = await fetch('http://localhost:3001/api/claims')
        .then(r => (r.ok ? r.json() : []))
        .catch(() => []);
      claimList = Array.isArray(liveClaims) ? liveClaims : [];
      setClaims(claimList);

      const createdClaimData = claimList
        .filter((claimItem: any) => claimItem && typeof claimItem === 'object')
        .sort((a: any, b: any) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())
        .find((claimItem: any) => {
          const targetId = uploadResult?.claimId || uploadResult?.jobId;
          if (targetId && claimItem.id === targetId) return true;
          const sourceName = String(claimItem.source || '').trim();
          const isGenericOcrSource = !sourceName || /^ocr$/i.test(sourceName);
          return !isGenericOcrSource || !!claimItem.patient;
        });
      if (createdClaimData) {
        setCreatedClaim(createdClaimData);
        navigate(`claims/${createdClaimData.id}`);
      }

      const claimName = createdClaimData ? createdClaimData.id : 'OCR claim';
      addNotification(`Ingestion success: ${pendingFiles.length} document(s) received for ${claimName} via ${source || 'manual upload'}`, 'ok', createdClaimData ? `#/claims/${createdClaimData.id}` : null);
      toast(`${claimName} processed`, 'ok');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      addNotification(`Upload failed: ${msg}`, 'bad');
      toast('Upload failed', 'bad');
    }

    for (let i = 2; i < steps.length; i++) {
      setIngestProgress(Math.round(((i + 1) / steps.length) * 100));
      currentStepList[i] = { ...currentStepList[i], done: true };
      setIngestSteps([...currentStepList]);
      await sleep(80);
    }

    setIngestProgress(100);
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
                      <option value="">Select source</option>
                      <option value="Manual upload">Manual upload</option>
                      <option value="Email">Email intake</option>
                      <option value="Portal">Portal intake</option>
                      <option value="SFTP">SFTP batch</option>
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

      {/* Bottom row: Ingestion channels */}
      <div className="mt">
        <div className="card">
          <div className="card-head">
            <h3>Ingestion channels (today)</h3>
          </div>
          <div className="card-body">
            {channelData.length > 0 ? (
              channelData.map(({ name, value, detail }) => (
                <div key={name} className="bar-h">
                  <span className="lbl">
                    {name}
                    <br />
                    <span className="small faint">{detail}</span>
                  </span>
                  <span className="bar">
                    <i style={{ width: `${value}%` }} />
                  </span>
                  <span className="val">{value}%</span>
                </div>
              ))
            ) : (
              <div className="small muted">No intake activity yet. Uploaded OCR claims will appear here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
