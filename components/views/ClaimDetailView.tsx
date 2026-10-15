'use client';

import React, { useEffect, useState } from 'react';
import { useClaimsStore } from '../../lib/store';
import { fmtINR, fmtDT, STAGES, ago, uid } from '../../lib/data';
import { matchClaim, tariffVersionForClaim } from '../../lib/engine';
import { Claim, ClaimField, ClaimDocument } from '../../lib/types';

export function ClaimDetailView({ claimId }: { claimId: string }) {
  const {
    claims,
    setClaims,
    updateClaim,
    rules,
    providers,
    user,
    users,
    can,
    navigate,
    toast,
    openModal,
    closeModal,
    addNotification,
    getClaimTotals,
    exceptions,
  } = useClaimsStore();

  const claim = claims.find(c => c.id === claimId);
  const [activeTab, setActiveTab] = useState<string>('overview');

  useEffect(() => {
    if (!claimId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refreshClaim = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/claims/${claimId}`);
        if (!response.ok) return;

        const latestClaim = await response.json();
        if (!cancelled && latestClaim && typeof latestClaim === 'object') {
          setClaims(prev => {
            const exists = prev.some(c => c.id === latestClaim.id);
            return exists
              ? prev.map(c => (c.id === latestClaim.id ? latestClaim : c))
              : [latestClaim, ...prev];
          });
        }
      } catch {
        // Ignore transient refresh failures while the OCR job is still running.
      }
    };

    refreshClaim();

    if (claim?.status === 'Processing' || claim?.stage === 1 || !claim) {
      timer = setInterval(refreshClaim, 2500);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [claimId, claim?.status, claim?.stage, setClaims]);

  // Review & correct tab state
  const [selectedDocId, setSelectedDocId] = useState<string>(claim?.docs[0]?.id || '');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [onlyLowConfidence, setOnlyLowConfidence] = useState<boolean>(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editError, setEditError] = useState<string>('');
  const [docPage, setDocPage] = useState<number>(1);

  // Variances tab state
  const [openVarianceKey, setOpenVarianceKey] = useState<string | null>(null);

  // Claim core state
  const [isPushingCore, setIsPushingCore] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);

  if (!claim) {
    return (
      <div className="card">
        <div className="empty" style={{ padding: '32px', textAlign: 'center' }}>
          <strong>Claim not found</strong>
          <p>{claimId} does not exist.</p>
          <button className="btn btn-primary btn-sm mt" onClick={() => navigate('claims')}>
            Back to claims
          </button>
        </div>
      </div>
    );
  }

  const totals = getClaimTotals(claim);
  const claimExceptions = exceptions.filter(x => x.claimId === claim.id);
  const lowFieldsCount = claim.docs.reduce(
    (s, d) => s + d.fields.filter(x => !x.verified && x.conf < rules.confidenceThreshold).length,
    0
  );

  const currentDoc = claim.docs.find(d => d.id === selectedDocId) || claim.docs[0];
  const isMissingFieldValue = (value: string | undefined) => !value || !String(value).trim() || /not extracted/i.test(String(value));

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

  const getUserName = (id: string | null) => {
    if (!id) return 'Unassigned';
    return users.find(u => u.id === id)?.name || id;
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'documents', label: 'Documents', count: claim.docs.length },
    { key: 'review', label: 'Review & correct', count: lowFieldsCount, warn: lowFieldsCount > 0 },
    { key: 'normalization', label: 'Normalized data' },
    { key: 'tariff', label: 'Tariff match' },
    {
      key: 'variances',
      label: 'Variances',
      count: totals.variances.filter(v => v.decision.status === 'Open').length,
      warn: totals.open > 0,
    },
    { key: 'update', label: 'Claim update' },
    { key: 'audit', label: 'Audit trail', count: claim.audit.length },
  ];

  // Pipeline element
  const isBlocked =
    claim.status === 'Exception' || claim.status === 'Variance review' || claim.status === 'In review';

  // Field validation and save
  const handleSaveFieldCorrection = (field: ClaimField) => {
    const val = editValue.trim();
    if (!val) {
      setEditError('Value cannot be empty.');
      return;
    }

    const before = field.value;
    updateClaim(claim.id, c => {
      const updatedDocs = c.docs.map(d => {
        if (d.id !== currentDoc?.id) return d;
        return {
          ...d,
          fields: d.fields.map(f => {
            if (f.id !== field.id) return f;
            return {
              ...f,
              value: val,
              verified: true,
              history: [
                ...f.history,
                { ts: new Date().toISOString(), user: user.name, before, after: val },
              ],
            };
          }),
        };
      });

      const auditEntry = {
        id: uid('AUD'),
        ts: new Date().toISOString(),
        user: user.name,
        entity: 'Field',
        action: 'Corrected',
        detail: `${field.label} in ${currentDoc?.type}`,
        before,
        after: val,
      };

      return {
        ...c,
        docs: updatedDocs,
        audit: [auditEntry, ...c.audit],
      };
    });

    setEditingFieldId(null);
    setEditError('');
    toast('Correction saved and audited', 'ok');
  };

  const handleConfirmField = (field: ClaimField) => {
    updateClaim(claim.id, c => {
      const updatedDocs = c.docs.map(d => {
        if (d.id !== currentDoc?.id) return d;
        return {
          ...d,
          fields: d.fields.map(f => {
            if (f.id !== field.id) return f;
            return {
              ...f,
              verified: true,
              history: [...f.history, { ts: new Date().toISOString(), user: user.name, action: 'Confirmed' }],
            };
          }),
        };
      });

      const auditEntry = {
        id: uid('AUD'),
        ts: new Date().toISOString(),
        user: user.name,
        entity: 'Field',
        action: 'Confirmed',
        detail: `${field.label} = "${field.value}" (${field.conf}%) in ${currentDoc?.type}`,
      };

      return {
        ...c,
        docs: updatedDocs,
        audit: [auditEntry, ...c.audit],
      };
    });
    toast('Field confirmed', 'ok');
  };

  const handleValidateDoc = () => {
    updateClaim(claim.id, c => {
      const updatedDocs = c.docs.map(d => (d.id === currentDoc?.id ? { ...d, validated: true } : d));
      const auditEntry = {
        id: uid('AUD'),
        ts: new Date().toISOString(),
        user: user.name,
        entity: 'Document',
        action: 'Validated',
        detail: `${currentDoc?.type} (${currentDoc?.name}) validated by ${user.name}`,
      };
      return {
        ...c,
        docs: updatedDocs,
        audit: [auditEntry, ...c.audit],
      };
    });
    toast(`${currentDoc?.type} validated`, 'ok');
  };

  // Variance decisions
  const handleDecideVariance = (vKey: string, decision: 'Accepted' | 'Overridden', comment: string) => {
    updateClaim(claim.id, c => {
      const newDecisions = {
        ...c.decisions,
        [vKey]: { status: decision, by: user.name, comment },
      };
      const v = totals.variances.find(x => x.key === vKey);
      const auditEntry = {
        id: uid('AUD'),
        ts: new Date().toISOString(),
        user: user.name,
        entity: 'Variance',
        action: decision === 'Accepted' ? 'Accepted' : 'Overridden',
        detail: `${v?.li.desc} (${v?.ruleId}) — ${comment}`,
      };
      return {
        ...c,
        decisions: newDecisions,
        audit: [auditEntry, ...c.audit],
      };
    });
    toast(`Variance ${decision.toLowerCase()}`, 'ok');
  };

  const handleApproveClaim = () => {
    updateClaim(claim.id, c => ({
      ...c,
      status: 'Approved',
      stage: 7,
      audit: [
        {
          id: uid('AUD'),
          ts: new Date().toISOString(),
          user: user.name,
          entity: 'Claim',
          action: 'Approved',
          detail: `Payable ${fmtINR(totals.payable)}; deductions ${fmtINR(totals.accepted)}`,
        },
        ...c.audit,
      ],
    }));
    toast('Claim approved', 'ok');
    setActiveTab('update');
  };

  const handlePushClaimCore = async () => {
    setIsPushingCore(true);
    await new Promise(r => setTimeout(r, 1200));

    updateClaim(claim.id, c => {
      const idempotencyKey = c.claimCore.idempotencyKey || `idem-${c.id.slice(-5)}-${Math.random().toString(16).slice(2, 6)}`;
      const attempts = c.claimCore.attempts + 1;
      const history = [
        ...c.claimCore.history,
        {
          ts: new Date().toISOString(),
          attempt: attempts,
          code: 200,
          msg: 'OK — claim updated in Claim Core',
        },
      ];
      return {
        ...c,
        status: 'Updated in Claim Core',
        stage: 8,
        claimCore: {
          ...c.claimCore,
          status: 'Updated',
          attempts,
          idempotencyKey,
          lastSync: new Date().toISOString(),
          history,
        },
        audit: [
          {
            id: uid('AUD'),
            ts: new Date().toISOString(),
            user: 'system',
            entity: 'Claim Core',
            action: 'Updated',
            detail: `POST /claims/${c.id}/digitized → 200 OK (attempt ${attempts}) idem=${idempotencyKey}`,
          },
          ...c.audit,
        ],
      };
    });

    setIsPushingCore(false);
    toast('Claim Core updated', 'ok');
  };

  // Group fields by section for review
  const fieldSections: Record<string, ClaimField[]> = {};
  if (currentDoc) {
    currentDoc.fields.forEach(f => {
      if (onlyLowConfidence && f.conf >= rules.confidenceThreshold && f.verified) return;
      if (!fieldSections[f.section]) fieldSections[f.section] = [];
      fieldSections[f.section].push(f);
    });
  }

  const extractedDataSections: Record<string, ClaimField[]> = {};
  if (currentDoc) {
    currentDoc.fields.forEach(f => {
      if (!f.value && !f.original) return;
      if (!extractedDataSections[f.section]) extractedDataSections[f.section] = [];
      extractedDataSections[f.section].push(f);
    });
  }

  const billItems = ['Hospital Bill', 'Pharmacy Bill'].includes(currentDoc?.type || '')
    ? claim.lineItems.filter(l => l.bill === currentDoc?.type)
    : [];

  return (
    <div>
      {/* Header Card */}
      <div className="card mb">
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div className="row" style={{ gap: '10px' }}>
                <span style={{ fontSize: '18px', fontWeight: 600 }}>{claim.patient}</span>
                {statusBadge(claim.status)}
                <span className="badge b-gray">{claim.claimType}</span>
                <span className="badge b-gray">{claim.lob}</span>
              </div>
              <div className="small muted" style={{ marginTop: '4px' }}>
                {claim.memberId} · Policy {claim.policy} · {claim.hospital} · Admitted{' '}
                <span style={{ whiteSpace: 'nowrap' }}>
                  {claim.admission} → {claim.discharge}
                </span>{' '}
                · via {claim.source} {ago(claim.receivedAt)} ago · Assignee: {getUserName(claim.assignee)}
              </div>
            </div>

            <div className="row" style={{ gap: '8px' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  toast(`Claim ${claim.id} exported`, 'ok');
                }}
              >
                Export JSON
              </button>
            </div>
          </div>

          {/* Totals Row */}
          <div
            className="row mt"
            style={{
              paddingTop: '12px',
              borderTop: '1px solid var(--line-soft)',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <span className="small muted">Billed: </span>
              <strong>{fmtINR(totals.billed)}</strong>
            </div>
            <div>
              <span className="small muted">Non-medical: </span>
              <strong>{fmtINR(totals.nonMed)}</strong>
            </div>
            <div>
              <span className="small muted">Variances: </span>
              <strong style={{ color: totals.open > 0 ? 'var(--red)' : undefined }}>
                {fmtINR(totals.flagged)}
              </strong>{' '}
              <span className="small muted">
                ({fmtINR(totals.open)} open / {fmtINR(totals.accepted)} accepted)
              </span>
            </div>
            <div>
              <span className="small muted">Deductions: </span>
              <strong>{fmtINR(totals.accepted)}</strong>
            </div>
            <div>
              <span className="small muted">Est. payable: </span>
              <strong style={{ color: 'var(--accent)', fontSize: '15px' }}>
                {fmtINR(totals.payable)}
              </strong>
            </div>
            <div>
              <span className="small muted">Exceptions: </span>
              <strong>{claimExceptions.length} open</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline bar */}
      <div className="pipeline mb" style={{ marginBottom: '18px' }}>
        {STAGES.map((s, i) => {
          let cls = '';
          if (i < claim.stage) cls = 'done';
          else if (i === claim.stage) cls = claim.status === 'Processing' ? 'active' : isBlocked ? 'blocked' : 'active';

          let sub = '';
          if (cls === 'done') sub = 'Complete';
          else if (i === claim.stage) sub = claim.status === 'Processing' ? 'Running…' : isBlocked ? 'Needs action' : 'Ready';

          return (
            <div key={s} className={`st ${cls}`}>
              <div className="n">Stage {i + 1}</div>
              <div className="t">{s}</div>
              <div className="s">{sub}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="tabs mb" style={{ marginBottom: '18px' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={activeTab === t.key ? 'active' : ''}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span
                style={{
                  marginLeft: '6px',
                  background: t.warn ? 'var(--amber)' : 'rgba(0,0,0,0.08)',
                  color: t.warn ? '#fff' : 'inherit',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '11px',
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: Overview */}
      {activeTab === 'overview' && (
        <div className="grid g-3-2">
          <div className="card">
            <div className="card-head">
              <h3>Claim facts</h3>
            </div>
            <div className="card-body">
              <dl className="kv" style={{ rowGap: '10px' }}>
                <dt>Primary complaint</dt>
                <dd>{claim.facts.complaint || 'Acute condition'}</dd>
                <dt>Treating doctor</dt>
                <dd>{claim.facts.doctor}</dd>
                <dt>Hospital registration</dt>
                <dd>{claim.facts.hospReg || 'TN/CHN/2011/04521'}</dd>
                <dt>ROHINI code</dt>
                <dd className="mono">{claim.facts.rohini}</dd>
                <dt>Admission date</dt>
                <dd>{claim.admission}</dd>
                <dt>Discharge date</dt>
                <dd>{claim.discharge}</dd>
                <dt>Length of stay</dt>
                <dd>{claim.facts.los} day(s)</dd>
                <dt>Documented ICU</dt>
                <dd>{claim.facts.icuDays} day(s)</dd>
                <dt>Corporate group</dt>
                <dd>{claim.facts.corporate || 'Individual'}</dd>
              </dl>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Clinical coding</h3>
            </div>
            <div className="card-body">
              <div className="mb">
                <strong>Diagnoses (ICD-10)</strong>
                <ul style={{ listStyle: 'none', marginTop: '6px' }}>
                  {claim.diagnoses.map(d => (
                    <li key={d.icd} style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <span className="mono hl-code" style={{ marginRight: '8px' }}>
                        {d.icd}
                      </span>
                      <span>{d.desc}</span>
                      {d.primary && <span className="badge b-teal" style={{ marginLeft: '6px' }}>Primary</span>}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <strong>Procedures (ICD-10-PCS)</strong>
                <ul style={{ listStyle: 'none', marginTop: '6px' }}>
                  {claim.procedures.map(p => (
                    <li key={p.pcs} style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <span className="mono hl-code" style={{ marginRight: '8px' }}>
                        {p.pcs}
                      </span>
                      <span>{p.desc}</span>
                      {p.primary && <span className="badge b-teal" style={{ marginLeft: '6px' }}>Primary</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overview' && currentDoc && (
        <div className="card mb" style={{ marginTop: '18px' }}>
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <h3>Extracted PDF data</h3>
            <span className="small muted">{currentDoc.type} · {currentDoc.name}</span>
          </div>
          <div className="card-body">
            {Object.keys(extractedDataSections).length > 0 ? (
              <div className="grid g-2">
                {Object.entries(extractedDataSections).map(([sectionName, sectionFields]) => (
                  <div key={sectionName} className="card" style={{ background: 'var(--panel)', border: '1px solid var(--line-soft)' }}>
                    <div className="card-head" style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-soft)' }}>
                      <h3>{sectionName}</h3>
                    </div>
                    <div className="card-body" style={{ padding: '10px 12px' }}>
                      <dl className="kv" style={{ rowGap: '8px' }}>
                        {sectionFields.map(field => (
                          <React.Fragment key={field.id}>
                            <dt>{field.label}</dt>
                            <dd>
                              <span>{field.value || '—'}</span>
                              {field.conf > 0 && (
                                <span className="small muted" style={{ marginLeft: '8px' }}>
                                  ({field.conf}% confidence)
                                </span>
                              )}
                            </dd>
                          </React.Fragment>
                        ))}
                      </dl>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ padding: '18px', textAlign: 'center' }}>
                No OCR-extracted fields available for this document yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Documents */}
      {activeTab === 'documents' && (
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <h3>Attached documents ({claim.docs.length})</h3>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSelectedDocId(claim.docs[0]?.id || '');
                setActiveTab('review');
              }}
            >
              Open in Review & correct
            </button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Document type</th>
                  <th>File name</th>
                  <th>Size</th>
                  <th>Pages</th>
                  <th>OCR status</th>
                  <th>Validation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claim.docs.map(d => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.type}</strong>
                    </td>
                    <td className="small muted">{d.name}</td>
                    <td className="small">{d.size}</td>
                    <td>{d.pages.length}</td>
                    <td>
                      <span className="badge b-green">{d.ocrStatus}</span>
                    </td>
                    <td>
                      <span className={`badge ${d.validated ? 'b-green' : 'b-amber'}`}>
                        {d.validated ? 'Validated' : 'Pending review'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          setSelectedDocId(d.id);
                          setActiveTab('review');
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Review & correct */}
      {activeTab === 'review' && (
        <div>
          <div className="row mb" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div className="row" style={{ gap: '14px' }}>
              <div className="field">
                <label>Document</label>
                <select
                  value={selectedDocId}
                  onChange={e => {
                    setSelectedDocId(e.target.value);
                    setSelectedFieldId(null);
                    setDocPage(1);
                  }}
                >
                  {claim.docs.map(d => {
                    const low = d.fields.filter(x => !x.verified && x.conf < rules.confidenceThreshold).length;
                    return (
                      <option key={d.id} value={d.id}>
                        {d.type} — {d.name} {low > 0 ? `(${low} to validate)` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <label className="toggle" style={{ marginTop: '18px' }}>
                <input
                  type="checkbox"
                  checked={onlyLowConfidence}
                  onChange={e => setOnlyLowConfidence(e.target.checked)}
                />
                Show only fields below {rules.confidenceThreshold}%
              </label>
            </div>

            <div className={`callout ${lowFieldsCount > 0 ? 'warn' : 'ok'}`} style={{ padding: '8px 12px' }}>
              <div>
                {lowFieldsCount > 0 ? (
                  <>
                    <strong>{lowFieldsCount} field(s)</strong> in this claim are below the{' '}
                    {rules.confidenceThreshold}% threshold and must be validated.
                  </>
                ) : (
                  <strong>All fields validated</strong>
                )}
              </div>
            </div>
          </div>

          <div className="viewer">
            {/* Scanned Paper Viewer */}
            <div className="card">
              <div className="card-head" style={{ justifyContent: 'space-between' }}>
                <div className="page-nav">
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={docPage <= 1}
                    onClick={() => setDocPage(p => p - 1)}
                  >
                    ‹
                  </button>
                  <span>
                    Page {docPage} of {currentDoc?.pages.length || 1}
                  </span>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={docPage >= (currentDoc?.pages.length || 1)}
                    onClick={() => setDocPage(p => p + 1)}
                  >
                    ›
                  </button>
                </div>
                <div className="row">
                  <span className="badge b-gray">
                    {currentDoc?.handwritten ? 'Handwritten · NLP autocorrect on' : 'Printed'}
                  </span>
                </div>
              </div>

              <div className="doc-page">
                <div className={`paper ${currentDoc?.handwritten ? 'hand' : ''} scan`}>
                  {currentDoc?.detections.includes('logo') && (
                    <div className="logo">{claim.hospital.split(',')[0]}</div>
                  )}
                  <h4>
                    {currentDoc?.type.toUpperCase()}
                    {(currentDoc?.pages.length || 0) > 1 && ` — PAGE ${docPage} OF ${currentDoc?.pages.length}`}
                  </h4>

                  {Object.entries(fieldSections).map(([secName, secFields]) => (
                    <div key={secName}>
                      <div className="ph">{secName}</div>
                      {secFields.map(f => (
                        <div
                          key={f.id}
                          className={`pf ${selectedFieldId === f.id ? 'hl' : ''} ${
                            f.conf < rules.confidenceThreshold && !f.verified ? 'lo' : ''
                          }`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedFieldId(f.id)}
                        >
                          <b>{f.label}</b>
                          <span>{f.value}</span>
                        </div>
                      ))}
                    </div>
                  ))}

                  {billItems.length > 0 && docPage === (currentDoc?.pages.length || 1) && (
                    <>
                      <div className="ph">Line items</div>
                      <table>
                        <thead>
                          <tr>
                            <th>Particular</th>
                            <th>Qty</th>
                            <th>Rate</th>
                            <th>Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {billItems.slice(0, 8).map((l, i) => (
                            <tr key={i}>
                              <td>{l.desc}</td>
                              <td>{l.qty}</td>
                              <td>{l.unitPrice}</td>
                              <td>{l.net}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  {currentDoc?.detections.includes('stamp') && (
                    <div className="stamp">
                      {claim.hospital.split(',')[0]}
                      <br />
                      SEAL
                    </div>
                  )}
                  {currentDoc?.detections.includes('signature') && (
                    <div className="sig">{claim.facts.doctor.replace('Dr. ', '')}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Extracted Fields Sidebar */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-head">
                <h3>Extracted fields</h3>
                <span className="small muted">{currentDoc?.fields.length} fields</span>
              </div>

              <div className="fields-list">
                {Object.keys(fieldSections).length > 0 ? (
                  Object.entries(fieldSections).map(([secName, secFields]) => (
                    <div key={secName}>
                      <div className="fsec">{secName}</div>
                      {secFields.map(f => {
                        const isEditing = editingFieldId === f.id;
                        return (
                          <div
                            key={f.id}
                            className={`fitem ${selectedFieldId === f.id ? 'sel' : ''}`}
                            onClick={() => {
                              setSelectedFieldId(f.id);
                              setEditingFieldId(null);
                            }}
                          >
                            <div className="fl">
                              <span>{f.label}</span>
                              <span className={`conf ${f.verified ? 'ok' : f.conf >= 85 ? 'hi' : 'lo'}`}>
                                <i></i>
                                {f.verified ? 'Verified' : `${f.conf}%`}
                              </span>
                              {isMissingFieldValue(f.value) && (
                                <span className="small muted" style={{ color: '#b45309', marginLeft: '8px' }}>
                                  Not extracted
                                </span>
                              )}
                            </div>

                            {isEditing ? (
                              <div className="edit" onClick={e => e.stopPropagation()}>
                                <input
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  autoFocus
                                />
                                {editError && <div className="err">{editError}</div>}
                                <div className="row mt" style={{ gap: '6px' }}>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleSaveFieldCorrection(f)}
                                  >
                                    Save correction
                                  </button>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setEditingFieldId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <div className="small muted">Original OCR: {f.original}</div>
                              </div>
                            ) : (
                              <>
                                <div className={`fv ${f.value !== f.original ? 'edited' : ''}`}>
                                  {f.value}
                                  {isMissingFieldValue(f.value) && (
                                    <span className="small muted" style={{ color: '#b45309', display: 'block' }}>
                                      Warning: field could not be extracted. Please fill it manually.
                                    </span>
                                  )}
                                  {f.value !== f.original && (
                                    <span className="small muted"> (was {f.original})</span>
                                  )}
                                </div>

                                {selectedFieldId === f.id && !f.verified && (
                                  <div className="row mt" style={{ marginTop: '8px', gap: '6px' }}>
                                    <button
                                      className="btn btn-success btn-sm"
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleConfirmField(f);
                                      }}
                                    >
                                      Confirm as correct
                                    </button>
                                    <button
                                      className="btn btn-outline btn-sm"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setEditingFieldId(f.id);
                                        setEditValue(f.value);
                                        setEditError('');
                                      }}
                                    >
                                      Correct value
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="empty" style={{ padding: '24px', textAlign: 'center' }}>
                    No fields match filter.
                  </div>
                )}
              </div>

              <div
                className="row"
                style={{
                  padding: '12px 14px',
                  borderTop: '1px solid var(--line)',
                  justifyContent: 'space-between',
                }}
              >
                <span className="small muted">
                  {currentDoc?.validated ? (
                    <span className="badge b-green">Document validated</span>
                  ) : (
                    'Ready to validate'
                  )}
                </span>
                <button
                  className="btn btn-accent btn-sm"
                  disabled={currentDoc?.validated}
                  onClick={handleValidateDoc}
                >
                  Validate document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Normalized data */}
      {activeTab === 'normalization' && (
        <div className="card">
          <div className="card-head">
            <h3>Structured bill line items ({claim.lineItems.length})</h3>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Particular</th>
                  <th>Bill source</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th className="num">Qty</th>
                  <th>Unit</th>
                  <th className="num">Unit price</th>
                  <th className="num">Net (INR)</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {claim.lineItems.map(l => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.desc}</strong>
                    </td>
                    <td className="small muted">{l.bill}</td>
                    <td className="small mono">{l.code || '—'}</td>
                    <td>{l.category}</td>
                    <td className="num">{l.qty}</td>
                    <td className="small muted">{l.unit}</td>
                    <td className="num font-mono">{fmtINR(l.unitPrice)}</td>
                    <td className="num font-mono">{fmtINR(l.net)}</td>
                    <td>
                      <span className={`badge ${l.medical ? 'b-teal' : 'b-gray'}`}>
                        {l.medical ? 'Medical' : 'Non-medical'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Tariff match */}
      {activeTab === 'tariff' && (
        <div className="card">
          <div className="card-head">
            <h3>Contracted Tariff Comparison</h3>
            <span className="small muted">
              Active version: {tariffVersionForClaim(claim, providers)?.id || 'TV-APO-2026'}
            </span>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Billed item</th>
                  <th>Contracted item</th>
                  <th>Method</th>
                  <th className="num">Billed rate</th>
                  <th className="num">Contract rate</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {matchClaim(claim, rules, providers).rows.map((r, i) => {
                  const diff = r.item ? r.li.unitPrice - r.item.price : 0;
                  return (
                    <tr key={i}>
                      <td>{r.li.desc}</td>
                      <td>{r.item ? r.item.desc : <span className="muted">No match</span>}</td>
                      <td>
                        <span
                          className={`badge ${
                            r.method === 'code'
                              ? 'b-green'
                              : r.method === 'fuzzy'
                              ? 'b-amber'
                              : r.method === 'pharmacy'
                              ? 'b-teal'
                              : 'b-red'
                          }`}
                        >
                          {r.method}
                        </span>
                      </td>
                      <td className="num font-mono">{fmtINR(r.li.unitPrice)}</td>
                      <td className="num font-mono">{r.item ? fmtINR(r.item.price) : '—'}</td>
                      <td className="num font-mono" style={{ color: diff > 0 ? 'var(--red)' : undefined }}>
                        {diff > 0 ? `+${fmtINR(diff)}` : diff < 0 ? `-${fmtINR(-diff)}` : '0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Variances */}
      {activeTab === 'variances' && (
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3>Variance Flags ({totals.variances.length})</h3>
              <span className="small muted">
                {totals.open} open · {fmtINR(totals.open)} pending decision
              </span>
            </div>

            <div className="row" style={{ gap: '8px' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  totals.variances.forEach(v => {
                    if (v.decision.status === 'Open') {
                      handleDecideVariance(v.key, 'Accepted', 'Bulk accept');
                    }
                  });
                }}
              >
                Accept all open variances
              </button>
              <button className="btn btn-accent btn-sm" onClick={handleApproveClaim}>
                Approve claim
              </button>
            </div>
          </div>

          <div>
            {totals.variances.length > 0 ? (
              totals.variances.map(v => {
                const isOpen = openVarianceKey === v.key;
                return (
                  <div key={v.key} className={`vitem ${isOpen ? 'open' : ''}`}>
                    <div
                      className="vhead"
                      onClick={() => setOpenVarianceKey(isOpen ? null : v.key)}
                    >
                      <svg
                        className="chev"
                        viewBox="0 0 24 24"
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                      <div className="vt">
                        <b>{v.li.desc}</b>
                        <small>
                          {v.type} ({v.ruleId}) · {v.li.bill}
                        </small>
                      </div>
                      <div className="amt">
                        <b>{fmtINR(v.amount)}</b>
                        <small>{v.decision.status}</small>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="vbody">
                        <div className="vgrid">
                          <div>
                            <label>Billed amount</label>
                            <span>{fmtINR(v.ev.billed)}</span>
                          </div>
                          <div>
                            <label>Contracted rate</label>
                            <span>{fmtINR(v.ev.expected)}</span>
                          </div>
                          <div>
                            <label>Severity</label>
                            <span style={{ color: v.severity === 'Critical' ? 'var(--red)' : undefined }}>
                              {v.severity}
                            </span>
                          </div>
                          <div>
                            <label>Decision</label>
                            <span>{v.decision.status}</span>
                          </div>
                        </div>

                        <div className="evidence mb" style={{ marginBottom: '12px' }}>
                          <label>Evidence & Rationale</label>
                          <p>{v.rationale}</p>
                        </div>

                        {v.decision.status === 'Open' ? (
                          <div className="row" style={{ gap: '8px' }}>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleDecideVariance(v.key, 'Accepted', 'Deduction confirmed')}
                            >
                              Accept deduction
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleDecideVariance(v.key, 'Overridden', 'Manual override justified')}
                            >
                              Override (keep billed)
                            </button>
                          </div>
                        ) : (
                          <div className="decision">
                            Decided by <strong>{v.decision.by}</strong>: {v.decision.status} ({v.decision.comment})
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty" style={{ padding: '32px', textAlign: 'center' }}>
                No variances detected on this claim.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Claim update */}
      {activeTab === 'update' && (
        <div className="grid g-3-2">
          <div className="card">
            <div className="card-head">
              <h3>Digitized payload → Claim Core</h3>
              <span className="small muted">POST /claims/{claim.id}/digitized</span>
            </div>
            <div className="card-body">
              <dl className="kv mb" style={{ marginBottom: '16px' }}>
                <dt>Status</dt>
                <dd>
                  {claim.claimCore.status === 'Updated' ? (
                    <span className="badge b-teal">Updated in Claim Core</span>
                  ) : claim.status === 'Approved' ? (
                    <span className="badge b-green">Approved — ready to push</span>
                  ) : (
                    <span className="badge b-amber">Not ready</span>
                  )}
                </dd>
                <dt>Idempotency key</dt>
                <dd className="small mono">{claim.claimCore.idempotencyKey || '—'}</dd>
                <dt>Attempts</dt>
                <dd>{claim.claimCore.attempts}</dd>
                <dt>Last sync</dt>
                <dd>{claim.claimCore.lastSync ? fmtDT(claim.claimCore.lastSync) : '—'}</dd>
              </dl>

              <pre className="code" style={{ maxHeight: '280px', overflow: 'auto' }}>
                {JSON.stringify(
                  {
                    claimId: claim.id,
                    memberId: claim.memberId,
                    providerId: claim.providerId,
                    admissionDate: claim.admissionISO,
                    dischargeDate: claim.discharge.split('-').reverse().join('-'),
                    billed: totals.billed,
                    nonMedical: totals.nonMed,
                    payable: totals.payable,
                    deductions: totals.accepted,
                    documents: claim.docs.length,
                  },
                  null,
                  2
                )}
              </pre>

              <div className="row mt" style={{ justifyContent: 'flex-end', marginTop: '16px', gap: '8px' }}>
                <button
                  className="btn btn-accent"
                  disabled={isPushingCore || claim.claimCore.status === 'Updated'}
                  onClick={handlePushClaimCore}
                >
                  {isPushingCore
                    ? 'Pushing…'
                    : claim.claimCore.status === 'Updated'
                    ? 'Already updated'
                    : 'Push to Claim Core'}
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Integration log</h3>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Attempt</th>
                    <th>Code</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {claim.claimCore.history.length > 0 ? (
                    claim.claimCore.history.map((h, i) => (
                      <tr key={i}>
                        <td className="small mono">{fmtDT(h.ts)}</td>
                        <td>{h.attempt}</td>
                        <td>
                          <span className={`badge ${h.code === 200 ? 'b-green' : 'b-red'}`}>{h.code}</span>
                        </td>
                        <td className="small">{h.msg}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '24px' }}>
                        No attempts yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Audit trail */}
      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <h3>Audit trail</h3>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => toast('Audit trail exported', 'ok')}
            >
              Export CSV
            </button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Entity</th>
                  <th>Action</th>
                  <th>Detail</th>
                  <th>Before → After</th>
                </tr>
              </thead>
              <tbody>
                {claim.audit.map(a => (
                  <tr key={a.id}>
                    <td className="small mono">{fmtDT(a.ts)}</td>
                    <td>{a.user}</td>
                    <td>{a.entity}</td>
                    <td>
                      <span className="badge b-gray">{a.action}</span>
                    </td>
                    <td className="small">{a.detail}</td>
                    <td>
                      {a.before != null || a.after != null ? (
                        <div className="diff">
                          <div className="b">{String(a.before ?? '—')}</div>
                          <div className="a">{String(a.after ?? '—')}</div>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
