'use client';

import React, { useState } from 'react';
import { useClaimsStore } from '../../lib/store';
import { ROLES, fmtDT, uid } from '../../lib/data';

export function AdminView() {
  const {
    users,
    setUsers,
    user,
    rules,
    setRules,
    systemLogs,
    toast,
    openModal,
    closeModal,
    addNotification,
  } = useClaimsStore();

  const [activeTab, setActiveTab] = useState<'users' | 'rules' | 'integrations' | 'notifications' | 'logs'>('users');

  // Rules local form state
  const [tolerance, setTolerance] = useState(rules.priceTolerancePct);
  const [confidence, setConfidence] = useState(rules.confidenceThreshold);
  const [fuzzy, setFuzzy] = useState(rules.fuzzyThreshold);
  const [maxMB, setMaxMB] = useState(rules.maxFileMB);
  const [slaCritical, setSlaCritical] = useState(rules.slaHours.Critical);
  const [slaHigh, setSlaHigh] = useState(rules.slaHours.High);
  const [slaMed, setSlaMed] = useState(rules.slaHours.Medium);
  const [slaLow, setSlaLow] = useState(rules.slaHours.Low);
  const [rulesError, setRulesError] = useState('');

  const tabs = [
    ['users', 'Users & RBAC'],
    ['rules', 'Rules & thresholds'],
    ['integrations', 'Integrations & services'],
    ['notifications', 'Notification templates'],
    ['logs', 'System logs'],
  ] as const;

  const handleSaveRules = () => {
    if (tolerance < 0 || tolerance > 50) return setRulesError('Price tolerance must be 0–50%.');
    if (confidence < 50 || confidence > 99) return setRulesError('Confidence threshold must be 50–99%.');
    if (fuzzy < 50 || fuzzy > 100) return setRulesError('Fuzzy threshold must be 50–100%.');
    if (maxMB < 1 || maxMB > 500) return setRulesError('Max upload must be 1–500 MB.');

    setRulesError('');
    setRules({
      ...rules,
      priceTolerancePct: tolerance,
      confidenceThreshold: confidence,
      fuzzyThreshold: fuzzy,
      maxFileMB: maxMB,
      slaHours: {
        Critical: slaCritical,
        High: slaHigh,
        Medium: slaMed,
        Low: slaLow,
      },
    });
    toast('Rules saved — variances and queue recomputed', 'ok');
  };

  const handleResetRules = () => {
    setTolerance(5);
    setConfidence(85);
    setFuzzy(78);
    setMaxMB(50);
    setSlaCritical(2);
    setSlaHigh(4);
    setSlaMed(8);
    setSlaLow(24);
    setRulesError('');
    setRules({
      ...rules,
      priceTolerancePct: 5,
      confidenceThreshold: 85,
      fuzzyThreshold: 78,
      maxFileMB: 50,
      slaHours: { Critical: 2, High: 4, Medium: 8, Low: 24 },
    });
    toast('Defaults restored');
  };

  const handleAddUserModal = () => {
    let name = '';
    let email = '';
    let role = ROLES[0];
    let err = '';

    const Content = () => {
      const [uName, setUName] = useState('');
      const [uEmail, setUEmail] = useState('');
      const [uRole, setURole] = useState(ROLES[0]);
      const [errMsg, setErrMsg] = useState('');

      return (
        <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="field">
            <label>Full name</label>
            <input value={uName} onChange={e => setUName(e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="name@acme.com"
              value={uEmail}
              onChange={e => setUEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={uRole} onChange={e => setURole(e.target.value)}>
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {errMsg && <div style={{ color: 'var(--red)', fontSize: '12px' }}>{errMsg}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-outline" onClick={closeModal}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const n = uName.trim();
                const em = uEmail.trim();
                if (n.length < 3) {
                  setErrMsg('Name must be at least 3 characters.');
                  return;
                }
                if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(em)) {
                  setErrMsg('Enter a valid email address.');
                  return;
                }
                if (users.some(u => u.email.toLowerCase() === em.toLowerCase())) {
                  setErrMsg('A user with this email already exists.');
                  return;
                }
                setUsers(prev => [
                  ...prev,
                  {
                    id: uid('U'),
                    name: n,
                    email: em,
                    role: uRole,
                    status: 'Active',
                    lastLogin: new Date().toISOString(),
                  },
                ]);
                closeModal();
                toast('User created', 'ok');
              }}
            >
              Create user
            </button>
          </div>
        </div>
      );
    };

    openModal({
      title: 'Add user',
      content: <Content />,
    });
  };

  const handleTestConnection = (svcName: string) => {
    toast(`Testing ${svcName}…`, 'info');
    setTimeout(() => {
      if (svcName.includes('OCR')) {
        toast(`${svcName}: 504 Gateway Timeout on 1 of 3 probes — degraded`, 'warn');
      } else {
        toast(`${svcName}: 200 OK in ${Math.floor(30 + Math.random() * 80)} ms`, 'ok');
      }
    }, 700);
  };

  return (
    <div>
      {/* Tabs */}
      <div className="tabs mb" style={{ marginBottom: '18px' }}>
        {tabs.map(([k, label]) => (
          <button
            key={k}
            className={activeTab === k ? 'active' : ''}
            onClick={() => setActiveTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Users */}
      {activeTab === 'users' && (
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3>Users & RBAC</h3>
              <span className="small muted">Manage system operators and assign RBAC roles</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleAddUserModal}>
              + Add user
            </button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                    </td>
                    <td className="small muted">{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        onChange={e => {
                          const newRole = e.target.value;
                          setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, role: newRole } : x)));
                          toast(`${u.name} is now ${newRole}`, 'ok');
                        }}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${u.status === 'Active' ? 'b-green' : 'b-gray'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="small muted">{fmtDT(u.lastLogin)}</td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={u.id === user.id}
                        onClick={() => {
                          const nextStatus = u.status === 'Active' ? 'Inactive' : 'Active';
                          setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, status: nextStatus } : x)));
                          toast(`${u.name} ${nextStatus.toLowerCase()}`, 'ok');
                        }}
                      >
                        {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Rules */}
      {activeTab === 'rules' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Rules & thresholds</h3>
              <span className="small muted">
                Engine parameters drive variance detection, exception routing and SLA targets
              </span>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid mb" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div className="field">
                <label>Price tolerance (%)</label>
                <input
                  type="number"
                  value={tolerance}
                  onChange={e => setTolerance(Number(e.target.value))}
                />
                <span className="hint">Billed amount variance threshold before flagging</span>
              </div>
              <div className="field">
                <label>Confidence threshold (%)</label>
                <input
                  type="number"
                  value={confidence}
                  onChange={e => setConfidence(Number(e.target.value))}
                />
                <span className="hint">OCR field scores below this require manual validation</span>
              </div>
              <div className="field">
                <label>Fuzzy match threshold (%)</label>
                <input
                  type="number"
                  value={fuzzy}
                  onChange={e => setFuzzy(Number(e.target.value))}
                />
                <span className="hint">Minimum match score to automatically link tariff code</span>
              </div>
              <div className="field">
                <label>Max upload size (MB)</label>
                <input
                  type="number"
                  value={maxMB}
                  onChange={e => setMaxMB(Number(e.target.value))}
                />
                <span className="hint">Per-file limit on intake dropzone</span>
              </div>
            </div>

            <div style={{ marginTop: '20px', marginBottom: '16px' }}>
              <strong>SLA Resolution Targets (hours)</strong>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  marginTop: '10px',
                }}
              >
                <div className="field">
                  <label>Critical</label>
                  <input
                    type="number"
                    value={slaCritical}
                    onChange={e => setSlaCritical(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>High</label>
                  <input
                    type="number"
                    value={slaHigh}
                    onChange={e => setSlaHigh(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Medium</label>
                  <input
                    type="number"
                    value={slaMed}
                    onChange={e => setSlaMed(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Low</label>
                  <input
                    type="number"
                    value={slaLow}
                    onChange={e => setSlaLow(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {rulesError && (
              <div className="callout bad mb" style={{ marginBottom: '14px' }}>
                <div>{rulesError}</div>
              </div>
            )}

            <div className="row" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-outline" onClick={handleResetRules}>
                Reset defaults
              </button>
              <button className="btn btn-primary" onClick={handleSaveRules}>
                Save rules
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Integrations */}
      {activeTab === 'integrations' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Integrations & services</h3>
              <span className="small muted">Status and endpoints of external subsystems</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Document / OCR service', 'https://ocr.acme.local/api/v2', 'Degraded', 'var(--amber)'],
                  ['Classification service', 'https://classifier.acme.local/api/v1', 'Healthy', 'var(--green)'],
                  ['Tariff DB', 'postgresql://tariff-db.acme.local:5432/tariffs', 'Healthy', 'var(--green)'],
                  ['Claim Core API', 'https://claimcore.acme.local/api/v3', 'Healthy', 'var(--green)'],
                  ['Provider / Contract master', 'https://contracts.acme.local/api/v1', 'Healthy', 'var(--green)'],
                ].map(([name, endpoint, status, col]) => (
                  <tr key={name}>
                    <td>
                      <strong>{name}</strong>
                    </td>
                    <td className="small mono">{endpoint}</td>
                    <td>
                      <span className="status-dot" style={{ background: col }} />
                      <strong style={{ color: col }}>{status}</strong>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleTestConnection(name)}
                      >
                        Test connection
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Notifications */}
      {activeTab === 'notifications' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Notification templates</h3>
              <span className="small muted">Alert templates triggered across intake, validation and SLAs</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Channels</th>
                  <th>Template</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Ingestion success', 'In-app, Email', '{{count}} documents received for {{claimId}} via {{source}}'],
                  ['Ingestion failure', 'In-app, Email, SMS', 'Ingestion failed for {{fileName}} on {{claimId}}: {{error}}'],
                  ['Variance flags raised', 'In-app', '{{count}} variances flagged on {{claimId}} ({{amount}})'],
                  ['SLA breach alert', 'In-app, Email, SMS', '{{exceptionId}} on {{claimId}} breached {{priority}} SLA ({{hours}}h)'],
                  ['Escalation', 'In-app, Email', '{{claimId}} escalated to {{role}}: {{reason}}'],
                ].map(([e, c, t]) => (
                  <tr key={e}>
                    <td>{e}</td>
                    <td className="small">{c}</td>
                    <td className="small mono">{t}</td>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          defaultChecked
                          onChange={ev =>
                            toast(`${e} notifications ${ev.target.checked ? 'enabled' : 'disabled'}`)
                          }
                        />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: System logs */}
      {activeTab === 'logs' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>System & access logs</h3>
              <span className="small muted">Correlation IDs link API, OCR and workflow events</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Correlation</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {systemLogs.slice(0, 30).map((l, i) => (
                  <tr key={i}>
                    <td className="small mono">{fmtDT(l.ts)}</td>
                    <td>
                      <span
                        className={`badge ${
                          l.level === 'INFO'
                            ? 'b-blue'
                            : l.level === 'WARN'
                            ? 'b-amber'
                            : l.level === 'ERROR'
                            ? 'b-red'
                            : 'b-teal'
                        }`}
                      >
                        {l.level}
                      </span>
                    </td>
                    <td className="small mono">{l.corr}</td>
                    <td className="small">{l.msg}</td>
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
