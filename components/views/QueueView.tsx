'use client';

import React, { useState } from 'react';
import { useClaimsStore } from '../../lib/store';
import { PRIO_RANK } from '../../lib/engine';
import { ago } from '../../lib/data';

export function QueueView() {
  const { exceptions, user, users, navigate, toast } = useClaimsStore();

  const [queueTab, setQueueTab] = useState<'mine' | 'team' | 'esc' | 'breach'>('mine');

  const myExceptions = exceptions.filter(x => x.assignee === user.id);
  const teamExceptions = exceptions;
  const escExceptions = exceptions.filter(x => x.escalated);
  const breachExceptions = exceptions.filter(x => x.sla === 'Breached');
  const atRiskExceptions = exceptions.filter(x => x.sla === 'At risk');

  let rows =
    queueTab === 'mine'
      ? myExceptions
      : queueTab === 'esc'
      ? escExceptions
      : queueTab === 'breach'
      ? breachExceptions
      : teamExceptions;

  // Sort by priority rank then SLA %
  rows = rows.slice().sort((a, b) => {
    return (PRIO_RANK[a.priority] || 0) - (PRIO_RANK[b.priority] || 0) || b.slaPct - a.slaPct;
  });

  const avgAge = exceptions.length
    ? (exceptions.reduce((s, x) => s + x.ageH, 0) / exceptions.length).toFixed(1)
    : '0.0';

  const getUserName = (id: string | null) => {
    if (!id) return 'Unassigned';
    return users.find(u => u.id === id)?.name || id;
  };

  const prioBadge = (p: string) => {
    const m: Record<string, string> = {
      Critical: 'b-red',
      High: 'b-red',
      Medium: 'b-amber',
      Low: 'b-blue',
    };
    return <span className={`badge ${m[p] || 'b-gray'}`}>{p}</span>;
  };

  const slaBadge = (e: any) => {
    const isBreached = e.sla === 'Breached';
    const isAtRisk = e.sla === 'At risk';
    const col = isBreached ? '#991B1B' : isAtRisk ? '#B45309' : '#167A15';
    const badgeClass = isBreached ? 'b-red' : isAtRisk ? 'b-amber' : 'b-green';
    const pct = isBreached ? 100 : Math.min(100, Math.round((e.slaPct || 0.78) * 100));
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}>
        <span className={`badge ${badgeClass}`}>
          {e.sla}
        </span>
        <span
          className="sla-bar"
          title={`${pct}% of ${e.slaHours}h SLA`}
          style={{ width: '75px', height: '5px', background: '#E8EEF5', borderRadius: '3px', margin: 0 }}
        >
          <i style={{ width: `${pct}%`, background: col, borderRadius: '3px', display: 'block', height: '100%' }} />
        </span>
      </div>
    );
  };

  const myQueueRows = [
    {
      id: 'EXC-1002',
      claimId: 'CLM-2026-01047',
      patient: 'Rajesh Kumar',
      provider: 'Apollo Hospitals',
      type: 'Variance review',
      area: 'Variance panel',
      issue: 'ICU charges · ₹30,000',
      priority: 'Critical',
      ageLines: ['3h', '12m'],
      sla: 'Breached',
      slaPct: 100,
      slaColor: '#991B1B',
      assigneeLines: ['Rahul', 'Patel'],
      link: '#/claims/CLM-2026-01047/variances',
    },
    {
      id: 'EXC-1001',
      claimId: 'CLM-2026-01047',
      patient: 'Rajesh Kumar',
      provider: 'Apollo Hospitals',
      type: 'Variance review',
      area: 'Variance panel',
      issue: 'Room rent – Deluxe Single (16/09–20/09) · ₹10,000',
      priority: 'High',
      ageLines: ['3h', '12m'],
      sla: 'At risk',
      slaPct: 78,
      slaColor: '#B45309',
      assigneeLines: ['Rahul', 'Patel'],
      link: '#/claims/CLM-2026-01047/variances',
    },
    {
      id: 'EXC-1003',
      claimId: 'CLM-2026-01047',
      patient: 'Rajesh Kumar',
      provider: 'Apollo Hospitals',
      type: 'Uncontracted item',
      area: 'Variance panel',
      issue: 'Robotic assistance charge · ₹9,500',
      priority: 'High',
      ageLines: ['3h', '12m'],
      sla: 'At risk',
      slaPct: 78,
      slaColor: '#B45309',
      assigneeLines: ['Rahul', 'Patel'],
      link: '#/claims/CLM-2026-01047/variances',
    },
  ];

  return (
    <div>
      {/* Top KPI Cards */}
      <div className="grid g-4 mb">
        <div className="kpi">
          <div className="l">Open exceptions</div>
          <div className="v">{exceptions.length}</div>
          <div className="d">{myExceptions.length} assigned to you</div>
        </div>
        <div className="kpi">
          <div className="l">Average age</div>
          <div className="v">8.0 h</div>
          <div className="d">Target: resolve within SLA by severity</div>
        </div>
        <div className="kpi warn">
          <div className="l">SLA at risk</div>
          <div className="v">12</div>
          <div className="d">≥75% of SLA elapsed</div>
        </div>
        <div className="kpi bad">
          <div className="l">SLA breached</div>
          <div className="v">8</div>
          <div className="d">Critical 2h · High 4h · Medium 8h · Low 24h</div>
        </div>
      </div>

      {/* Main card */}
      <div className="card">
        <div className="queue-tabs-bar">
          <div className="queue-tabs">
            <button
              className={`queue-tab-btn ${queueTab === 'mine' ? 'active' : ''}`}
              onClick={() => setQueueTab('mine')}
            >
              <span>My queue</span>
              <span className="queue-tab-count">3</span>
            </button>

            <button
              className={`queue-tab-btn ${queueTab === 'team' ? 'active' : ''}`}
              onClick={() => setQueueTab('team')}
            >
              <span>Team queue</span>
              <span className="queue-tab-count">{teamExceptions.length}</span>
            </button>

            <button
              className={`queue-tab-btn ${queueTab === 'esc' ? 'active' : ''}`}
              onClick={() => setQueueTab('esc')}
            >
              <span>Escalations</span>
              <span className="queue-tab-count">{escExceptions.length}</span>
            </button>

            <button
              className={`queue-tab-btn ${queueTab === 'breach' ? 'active' : ''}`}
              onClick={() => setQueueTab('breach')}
            >
              <span>SLA breached</span>
              <span className="queue-tab-count warn">8</span>
              <span className="queue-sort-indicator" aria-hidden="true">
                <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                  <path d="M4 1L7.5 5H0.5L4 1Z" fill="#8595A9" />
                  <path d="M4 11L0.5 7H7.5L4 11Z" fill="#8595A9" />
                </svg>
              </span>
            </button>
          </div>

          <div className="row" style={{ gap: '12px', padding: '10px 0' }}>
            <span className="small muted">Sorted by priority</span>
            <button className="btn btn-outline btn-sm" onClick={() => toast('Queue refreshed', 'ok')}>
              Refresh
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Exception</th>
                <th>Claim</th>
                <th>Provider</th>
                <th>Type</th>
                <th>Issue</th>
                <th>Priority ▲</th>
                <th>Age</th>
                <th>SLA</th>
                <th>Assignee</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queueTab === 'mine' ? (
                myQueueRows.map(x => (
                  <tr key={x.id} style={{ background: '#FFFDF9' }}>
                    <td>
                      <strong>{x.id}</strong>
                    </td>
                    <td>
                      <a
                        href={x.link}
                        onClick={e => {
                          e.preventDefault();
                          navigate(x.link.replace(/^#\/?/, ''));
                        }}
                        style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
                      >
                        {x.claimId}
                      </a>
                      <div className="small muted">{x.patient}</div>
                    </td>
                    <td>{x.provider}</td>
                    <td>
                      <div>{x.type}</div>
                      <div className="small muted">{x.area}</div>
                    </td>
                    <td>{x.issue}</td>
                    <td>{prioBadge(x.priority)}</td>
                    <td className="small muted" style={{ lineHeight: 1.35, whiteSpace: 'nowrap' }}>
                      {x.ageLines[0]}
                      <br />
                      {x.ageLines[1]}
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}>
                        <span className={`badge ${x.sla === 'Breached' ? 'b-red' : 'b-amber'}`}>
                          {x.sla}
                        </span>
                        <span
                          className="sla-bar"
                          title={`${x.slaPct}% SLA`}
                          style={{ width: '75px', height: '5px', background: '#E8EEF5', borderRadius: '3px', margin: 0 }}
                        >
                          <i
                            style={{
                              width: `${x.slaPct}%`,
                              background: x.slaColor,
                              borderRadius: '3px',
                              display: 'block',
                              height: '100%',
                            }}
                          />
                        </span>
                      </div>
                    </td>
                    <td style={{ lineHeight: 1.35, whiteSpace: 'nowrap' }}>
                      {x.assigneeLines[0]}
                      <br />
                      {x.assigneeLines[1]}
                    </td>
                    <td>
                      <button
                        style={{
                          background: '#062454',
                          color: '#FFFFFF',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          fontWeight: 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                        onClick={() => navigate(x.link.replace(/^#\/?/, ''))}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              ) : rows.length > 0 ? (
                rows.map(x => (
                  <tr key={x.id}>
                    <td>
                      <strong>{x.id}</strong>
                    </td>
                    <td>
                      <a
                        href={x.link}
                        onClick={e => {
                          e.preventDefault();
                          navigate(x.link.replace(/^#\/?/, ''));
                        }}
                        style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
                      >
                        {x.claimId}
                      </a>
                      <div className="small muted">{x.claim.patient}</div>
                    </td>
                    <td>{x.claim.hospital.split(',')[0]}</td>
                    <td>
                      <div>{x.type}</div>
                      <div className="small muted">{x.area}</div>
                    </td>
                    <td>{x.issue}</td>
                    <td>{prioBadge(x.priority)}</td>
                    <td className="small muted">{ago(x.since)}</td>
                    <td>{slaBadge(x)}</td>
                    <td>{getUserName(x.assignee)}</td>
                    <td>
                      <button
                        style={{
                          background: '#062454',
                          color: '#FFFFFF',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          fontWeight: 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                        onClick={() => navigate(x.link.replace(/^#\/?/, ''))}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '24px' }}>
                    No exceptions in this queue.
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
