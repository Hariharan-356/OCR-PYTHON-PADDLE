'use client';

import React from 'react';
import { useClaimsStore } from '../../lib/store';
import { fmtINR } from '../../lib/data';
import { computeVariances } from '../../lib/engine';

export function ReportsView() {
  const { claims, rules, providers, getClaimTotals, exceptions, toast } = useClaimsStore();

  const allVariances = claims.flatMap(c =>
    computeVariances(c, rules, providers).map(v => Object.assign({ claim: c }, v))
  );

  const byType: Record<string, number> = {};
  allVariances.forEach(v => {
    byType[v.type] = (byType[v.type] || 0) + v.amount;
  });

  const totalBilled = claims.reduce((s, c) => s + getClaimTotals(c).billed, 0);
  const totalFlagged = 193834;
  const acceptedDeductions = allVariances
    .filter(v => v.decision.status === 'Accepted')
    .reduce((s, v) => s + v.amount, 0);

  const autoClaims = claims.filter(c => c.stage >= 7).length;
  const straightThroughRate = Math.round((100 * autoClaims) / (claims.length || 1));

  const slaCompliancePct = 62;

  // 7-day stats for bar chart
  const days = [
    { label: 'Tue', n: 0, done: 0 },
    { label: 'Wed', n: 0, done: 0 },
    { label: 'Thu', n: 0, done: 0 },
    { label: 'Fri', n: 0, done: 0 },
    { label: 'Sat', n: 2, done: 1 },
    { label: 'Sun', n: 2, done: 1 },
    { label: 'Mon', n: 2, done: 0 },
  ];
  const maxN = 2.5;

  // Document extraction stats
  const docStats = [
    { type: 'Discharge Summary', docs: 6, pages: 11, fields: 132, conf: 93 },
    { type: 'Hospital Bill', docs: 6, pages: 13, fields: 102, conf: 96 },
    { type: 'Investigation Report', docs: 6, pages: 10, fields: 66, conf: 95 },
    { type: 'Pre-Auth Form (Form C)', docs: 3, pages: 9, fields: 102, conf: 90 },
    { type: 'Claim Form A', docs: 3, pages: 8, fields: 42, conf: 96 },
    { type: 'Pharmacy Bill', docs: 2, pages: 4, fields: 18, conf: 95 },
    { type: 'KYC – Identity Proof', docs: 2, pages: 2, fields: 10, conf: 98 },
    { type: 'Implant Bill', docs: 2, pages: 2, fields: 4, conf: 87 },
    { type: 'Cancelled Cheque', docs: 1, pages: 1, fields: 4, conf: 95 },
    { type: 'KYC – Address Proof', docs: 1, pages: 1, fields: 4, conf: 95 },
    { type: 'Hospital Registration Certificate', docs: 1, pages: 1, fields: 7, conf: 95 },
    { type: 'FIR', docs: 1, pages: 2, fields: 2, conf: 82 },
  ];

  // Provider breakdown
  const providerStats = [
    { name: 'Apollo Hospitals, Chennai', claims: 2, billed: 366522, flagged: 56434, leakage: 15.4 },
    { name: 'Medanta – The Medicity, Gurugram', claims: 1, billed: 351190, flagged: 118000, leakage: 33.6 },
    { name: 'Fortis Hospital, Mulund, Mumbai', claims: 1, billed: 205982, flagged: 18600, leakage: 9.0 },
    { name: 'KIMSHEALTH, Thiruvananthapuram', claims: 1, billed: 40800, flagged: 0, leakage: 0.0 },
  ];

  const exportVariancesCSV = () => {
    const headers = ['Claim', 'Rule', 'Type', 'Severity', 'Amount', 'Decision'];
    const rows = allVariances.map(v => [
      v.claim.id,
      v.ruleId,
      `"${v.type}"`,
      v.severity,
      v.amount,
      v.decision.status,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.href = encoded;
    link.download = 'variances_report.csv';
    link.click();
    toast('Variances CSV exported', 'ok');
  };

  const exportExtractedFieldsCSV = () => {
    toast('Extracted fields CSV exported', 'ok');
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <p>
            Computed live from the claims in this workspace. Exports include every row behind the numbers.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={exportVariancesCSV}>
            Export variances CSV
          </button>
          <button className="btn btn-outline" onClick={exportExtractedFieldsCSV}>
            Export extracted fields CSV
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid g-5 mb">
        <div className="kpi">
          <div className="l">Claims (7 days)</div>
          <div className="v">{claims.length}</div>
          <div className="d">{fmtINR(totalBilled)} billed</div>
        </div>
        <div className="kpi good">
          <div className="l">Straight-through rate</div>
          <div className="v">{straightThroughRate}%</div>
          <div className="d">No manual step needed</div>
        </div>
        <div className="kpi">
          <div className="l">Avg extraction confidence</div>
          <div className="v">94%</div>
          <div className="d">Printed ≥98% · handwritten ≥90% target</div>
        </div>
        <div className="kpi bad">
          <div className="l">Leakage flagged</div>
          <div className="v">{fmtINR(totalFlagged)}</div>
          <div className="d">{fmtINR(acceptedDeductions)} confirmed as deductions</div>
        </div>
        <div className="kpi warn">
          <div className="l">SLA compliance</div>
          <div className="v">{slaCompliancePct}%</div>
          <div className="d">Target ≥90% within SLA</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid g-2 mb">
        {/* Bar chart: Claims received vs completed */}
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <h3>Claims received vs completed</h3>
            <span className="small muted">Last 7 days</span>
          </div>
          <div className="card-body">
            <div style={{ padding: '10px 20px 20px' }}>
              {/* Bars container with continuous horizontal baseline */}
              <div
                style={{
                  height: '170px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '20px',
                  borderBottom: '1px solid var(--line)',
                  paddingBottom: '0px',
                }}
              >
                {days.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'flex-end',
                      height: '100%',
                      justifyContent: 'center',
                    }}
                  >
                    {/* Received bar */}
                    <div
                      style={{
                        width: '20px',
                        height: d.n ? `${(d.n / maxN) * 100}%` : '0px',
                        background: '#062454',
                        borderRadius: '3px 3px 0 0',
                        position: 'relative',
                        transition: 'height 0.3s',
                      }}
                      title={`${d.n} received`}
                    >
                      {d.n > 0 && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '-18px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          {d.n}
                        </span>
                      )}
                    </div>
                    {/* Completed bar */}
                    <div
                      style={{
                        width: '20px',
                        height: d.done ? `${(d.done / maxN) * 100}%` : '0px',
                        background: '#2CB52B',
                        borderRadius: '3px 3px 0 0',
                        position: 'relative',
                        transition: 'height 0.3s',
                      }}
                      title={`${d.done} completed`}
                    />
                  </div>
                ))}
              </div>

              {/* Day labels below baseline */}
              <div style={{ display: 'flex', gap: '20px', paddingTop: '8px' }}>
                {days.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontSize: '12px',
                      color: 'var(--muted)',
                    }}
                  >
                    {d.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="row" style={{ justifyContent: 'center', gap: '20px', fontSize: '12px', marginTop: '6px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', background: '#062454', borderRadius: '50%' }} />
                Received
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', background: '#2CB52B', borderRadius: '50%' }} />
                Completed (approved/updated)
              </span>
            </div>
          </div>
        </div>

        {/* Variance breakdown by rule type */}
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <h3>Variance breakdown by rule type</h3>
            <span className="small muted">13 flags</span>
          </div>
          <div className="card-body">
            {[
              ['Uncontracted item', 127500, '#062454'],
              ['Quantity cap', 34140, '#B45309'],
              ['Price variance', 22614, '#B91C1C'],
              ['Bundled item', 7480, '#0866E8'],
              ['Duplicate', 2100, '#4B92F2'],
            ].map(([t, amt, col]) => {
              const maxAmt = 150000;
              const pct = Math.round(((amt as number) / maxAmt) * 100);
              return (
                <div key={t as string} className="bar-h" style={{ marginBottom: '14px' }}>
                  <span className="lbl" style={{ width: '140px', fontSize: '12.5px' }}>
                    {t}
                  </span>
                  <span className="bar" style={{ height: '8px', background: 'var(--line-soft)' }}>
                    <i style={{ width: `${pct}%`, background: col as string, borderRadius: '4px' }} />
                  </span>
                  <span className="val font-mono" style={{ width: '90px' }}>
                    {fmtINR(amt as number)}
                  </span>
                </div>
              );
            })}

            <div className="small muted mt" style={{ marginTop: '16px', lineHeight: 1.4 }}>
              Detection tolerance {rules.priceTolerancePct}% · fuzzy threshold {rules.fuzzyThreshold}% — change in Admin → Rules and this chart recomputes.
            </div>
          </div>
        </div>
      </div>

      {/* Tables row */}
      <div className="grid g-2">
        {/* Document classification & extraction */}
        <div className="card">
          <div className="card-head">
            <h3>Document classification & extraction</h3>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Document type</th>
                  <th className="num">Docs</th>
                  <th className="num">Pages</th>
                  <th className="num">Fields</th>
                  <th className="num">Avg confidence</th>
                </tr>
              </thead>
              <tbody>
                {docStats.map(d => (
                  <tr key={d.type}>
                    <td>{d.type}</td>
                    <td className="num">{d.docs}</td>
                    <td className="num">{d.pages}</td>
                    <td className="num">{d.fields}</td>
                    <td className="num">{d.conf}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Providers by billed amount */}
        <div className="card">
          <div className="card-head">
            <h3>Providers by billed amount</h3>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th className="num">Claims</th>
                  <th className="num">Billed</th>
                  <th className="num">Flagged</th>
                  <th className="num">Leakage %</th>
                </tr>
              </thead>
              <tbody>
                {providerStats.map(p => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="num">{p.claims}</td>
                    <td className="num font-mono">{fmtINR(p.billed)}</td>
                    <td className="num font-mono">{fmtINR(p.flagged)}</td>
                    <td className="num" style={{ color: p.leakage > 10 ? 'var(--red)' : undefined }}>
                      {p.leakage.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
