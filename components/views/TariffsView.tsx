'use client';

import React, { useState, useEffect } from 'react';
import { useClaimsStore } from '../../lib/store';
import { fmtINR, RULES } from '../../lib/data';

export function TariffsView() {
  const { providers, route, navigate, can, toast } = useClaimsStore();

  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    return route.subId || providers[1]?.id || providers[0]?.id || 'PRV-002'; // Fortis by default as in screenshot
  });

  useEffect(() => {
    if (route.subId && route.subId !== selectedProviderId) {
      setSelectedProviderId(route.subId);
      setSelectedVersionId(null);
    }
  }, [route.subId, selectedProviderId]);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [tariffSearch, setTariffSearch] = useState('');

  const currentProvider = providers.find(p => p.id === selectedProviderId) || providers[0];
  const activeVersion =
    currentProvider?.versions.find(v => v.id === selectedVersionId) ||
    currentProvider?.versions[0];

  const items = (activeVersion?.items || []).filter(i => {
    if (!tariffSearch.trim()) return true;
    const q = tariffSearch.toLowerCase();
    return (i.code + ' ' + i.desc + ' ' + i.category).toLowerCase().includes(q);
  });

  const statusBadge = (s: string) => {
    const m: Record<string, string> = {
      Active: 'b-green',
      Superseded: 'b-gray',
      Upcoming: 'b-blue',
      Draft: 'b-amber',
    };
    return <span className={`badge ${m[s] || 'b-gray'}`}>{s}</span>;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <p>
            One structured schedule per provider and contract period. The engine picks the version whose effective
            window contains the admission date; analysts can override per claim.
          </p>
        </div>
        <div className="actions">
          {can('tariff') && (
            <button className="btn btn-primary" onClick={() => toast('Tariff sheet upload dialog opened', 'info')}>
              Upload tariff sheet
            </button>
          )}
        </div>
      </div>

      <div className="split-list">
        {/* Left Column: Providers List */}
        <div className="card">
          <div className="card-head">
            <h3>Providers</h3>
            <span className="small muted">{providers.length}</span>
          </div>
          <div className="list-nav">
            {providers.map(p => (
              <button
                key={p.id}
                className={p.id === currentProvider?.id ? 'active' : ''}
                onClick={() => {
                  setSelectedProviderId(p.id);
                  setSelectedVersionId(null);
                  navigate(`tariffs/${p.id}`);
                }}
              >
                <strong>{p.name}</strong>
                <small>
                  {p.versions.length} version(s) · ROHINI {p.rohini}
                </small>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Versions & Rate Schedule */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Versions Table */}
          <div className="card">
            <div className="card-head">
              <h3>Versions</h3>
              <span className="small muted">{currentProvider?.name}</span>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Contract</th>
                    <th>Effective from</th>
                    <th>Effective to</th>
                    <th>Status</th>
                    <th>Line items</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {currentProvider?.versions.map(v => (
                    <tr
                      key={v.id}
                      className={v.id === activeVersion?.id ? 'active' : ''}
                      style={{
                        cursor: 'pointer',
                        background: v.id === activeVersion?.id ? 'var(--canvas)' : undefined,
                      }}
                      onClick={() => setSelectedVersionId(v.id)}
                    >
                      <td>
                        <strong>{v.id}</strong>
                      </td>
                      <td>{v.contract || 'CY26 contract'}</td>
                      <td>{v.effectiveFrom}</td>
                      <td>{v.effectiveTo || 'Open'}</td>
                      <td>{statusBadge(v.status || 'Active')}</td>
                      <td>{v.items.length}</td>
                      <td className="small mono">{v.file || `${currentProvider.name.split(' ')[0]}_Tariff_2026.xlsx`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rate Schedule Table */}
          <div className="card">
            <div
              className="card-head"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '10px 16px',
                flexWrap: 'nowrap',
                overflowX: 'auto',
              }}
            >
              <strong
                style={{
                  fontWeight: 600,
                  color: 'var(--navy)',
                  fontSize: '13.5px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {activeVersion?.id}
              </strong>
              <span
                style={{
                  color: 'var(--muted)',
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: '0 1 auto',
                }}
                title={(activeVersion as any)?.discountNote || (activeVersion as any)?.clause || '8% on pharmacy; implants at MRP capped per IRDAI advisory.'}
              >
                {(activeVersion as any)?.discountNote || (activeVersion as any)?.clause || '8% on pharmacy; implants at MRP capped per IRDAI advisory.'}
              </span>
              <div style={{ flexShrink: 0 }}>
                <input
                  id="t-q"
                  placeholder="Search code or description..."
                  value={tariffSearch}
                  onChange={e => setTariffSearch(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--line)',
                    borderRadius: '6px',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: '13px',
                    width: '230px',
                    outline: 'none',
                    display: 'block',
                  }}
                />
              </div>
            </div>

            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th className="num">Tariff (INR)</th>
                    <th>Bundles</th>
                    <th>Medical</th>
                    <th>Cap</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length > 0 ? (
                    items.map(i => (
                      <tr key={i.code}>
                        <td>
                          <span className="mono">
                            <strong>{i.code}</strong>
                          </span>
                        </td>
                        <td>{i.desc}</td>
                        <td>{i.category}</td>
                        <td className="small muted">{i.unit}</td>
                        <td className="num font-mono">{fmtINR(i.price)}</td>
                        <td className="small muted">
                          {(i.bundle && i.bundle.length > 0)
                            ? `includes ${i.bundle.join(', ')}`
                            : (i as any).bundles && (i as any).bundles.length > 0
                            ? `includes ${(i as any).bundles.join(', ')}`
                            : '—'}
                        </td>
                        <td>
                          <span className={`badge ${i.medical !== false ? 'b-teal' : 'b-gray'}`}>
                            {i.medical !== false ? 'Medical' : 'Non-medical'}
                          </span>
                        </td>
                        <td className="small muted">
                          {(RULES.qtyCaps as any)?.[i.code]?.label || (i as any).cap || '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px' }}>
                        No tariff items found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
