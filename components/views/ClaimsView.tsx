'use client';

import React, { useState } from 'react';
import { useClaimsStore } from '../../lib/store';
import { fmtINR, STAGES, ago } from '../../lib/data';

export function ClaimsView() {
  const { claims, users, navigate, getClaimTotals } = useClaimsStore();

  const [statusFilter, setStatusFilter] = useState('All');
  const [searchFilter, setSearchFilter] = useState('');

  const statuses = [
    'All',
    'Processing',
    'In review',
    'Variance review',
    'Exception',
    'Approved',
    'Updated in Claim Core',
  ];

  const filteredClaims = claims.filter(c => {
    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    const q = searchFilter.toLowerCase().trim();
    const matchesSearch =
      !q || [c.id, c.patient, c.memberId, c.hospital, c.policy].join(' ').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const exportCSV = () => {
    const headers = [
      'Claim ID',
      'Patient',
      'Member ID',
      'Hospital',
      'Admission',
      'Discharge',
      'Source',
      'Billed',
      'Flagged',
      'Stage',
      'Status',
      'Assignee',
    ];
    const rows = claims.map(c => {
      const t = getClaimTotals(c);
      const assigneeName = users.find(u => u.id === c.assignee)?.name || 'Unassigned';
      return [
        c.id,
        `"${c.patient}"`,
        c.memberId,
        `"${c.hospital}"`,
        c.admission,
        c.discharge,
        c.source,
        t.billed,
        t.open,
        `${c.stage}/9 ${STAGES[c.stage] || ''}`,
        c.status,
        assigneeName,
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `claims_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const getUserName = (id: string | null) => {
    if (!id) return 'Unassigned';
    return users.find(u => u.id === id)?.name || id;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <p>
            Every claim ingested in the last 7 days, with its pipeline stage. Open a claim to review documents,
            corrections, tariff matches and variances.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" id="exp-claims" onClick={exportCSV}>
            Export CSV
          </button>
          <a
            className="btn btn-primary"
            href="#/intake"
            onClick={e => {
              e.preventDefault();
              navigate('intake');
            }}
          >
            Upload documents
          </a>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="seg" id="status-seg">
            {statuses.map(s => (
              <button
                key={s}
                className={statusFilter === s ? 'active' : ''}
                onClick={() => setStatusFilter(s)}
              >
                {s}
                {s === 'All' ? ` (${claims.length})` : ''}
              </button>
            ))}
          </div>
          <div className="field" style={{ minWidth: '240px' }}>
            <input
              id="claims-q"
              placeholder="Filter by claim, member, hospital…"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Member</th>
                <th>Hospital</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '190px' }}>Admission</th>
                <th>Source</th>
                <th className="num">Billed</th>
                <th className="num">Flagged</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.length > 0 ? (
                filteredClaims.map(c => {
                  const t = getClaimTotals(c);
                  return (
                    <tr
                      key={c.id}
                      className="clickable"
                      onClick={() => navigate(`claims/${c.id}`)}
                    >
                      <td>
                        <div className="id">{c.id}</div>
                      </td>
                      <td>
                        <div>{c.patient}</div>
                        <div className="small muted">{c.memberId}</div>
                      </td>
                      <td>{c.hospital}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <span className="font-mono">{c.admission}</span>
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>→</span>
                          <span className="font-mono">{c.discharge}</span>
                        </div>
                      </td>
                      <td>{c.source}</td>
                      <td className="num font-mono">{fmtINR(t.billed)}</td>
                      <td className="num font-mono">
                        {t.variances.length > 0 ? (
                          <span style={{ color: 'var(--red)' }}>{fmtINR(t.open)}</span>
                        ) : (
                          <span style={{ color: 'var(--faint)' }}>—</span>
                        )}
                      </td>
                      <td className="small">
                        {c.stage}/9 · {STAGES[c.stage] || 'Complete'}
                      </td>
                      <td>{statusBadge(c.status)}</td>
                      <td>{getUserName(c.assignee)}</td>
                      <td className="small muted">{ago(c.receivedAt)} ago</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '24px' }}>
                    No claims match the filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
