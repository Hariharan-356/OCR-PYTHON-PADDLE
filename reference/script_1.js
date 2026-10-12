
/* ============================================================
   Engine: tariff matching, variance detection, exception routing
   ============================================================ */
function tokens(s){ return String(s||'').toLowerCase().replace(/[–\-()/.,]/g,' ').split(/\s+/).filter(w=>w.length>1 && !['per','the','with','and','of','to'].includes(w)); }
function similarity(a,b){
  const A=new Set(tokens(a)), B=new Set(tokens(b)); if(!A.size||!B.size) return 0;
  let inter=0; A.forEach(t=>{ if(B.has(t)) inter++; else { for(const u of B){ if(u.startsWith(t.slice(0,4))&&t.length>3){inter+=0.6;break;} } } });
  return Math.round(100*inter/Math.sqrt(A.size*B.size));
}
function tariffVersionForClaim(c){
  if(c.tariffVersionId){ const p=providerById(c.providerId); const v=p&&p.versions.find(v=>v.id===c.tariffVersionId); if(v) return v; }
  return activeVersionFor(c.providerId, c.admissionISO);
}
function matchLine(c, li, v){
  if(!v) return {method:'none', item:null, score:0, alternates:[]};
  const ov = c.matchOverrides[li.id];
  if(ov){ const it=v.items.find(i=>i.code===ov); if(it) return {method:'override', item:it, score:100, alternates:[]}; }
  if(li.code && li.code.startsWith('PH-')) return {method:'pharmacy', item:null, score:100, alternates:[]};
  if(li.code){ const it=v.items.find(i=>i.code===li.code); if(it) return {method:'code', item:it, score:100, alternates:[]}; }
  const scored = v.items.map(i=>({item:i,score:similarity(li.desc,i.desc)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4);
  if(scored.length && scored[0].score>=RULES.fuzzyThreshold) return {method:'fuzzy', item:scored[0].item, score:scored[0].score, alternates:scored.slice(1)};
  return {method:'none', item:null, score:scored.length?scored[0].score:0, alternates:scored};
}
function matchClaim(c){ const v=tariffVersionForClaim(c); return {version:v, rows:c.lineItems.map(li=>Object.assign({li},matchLine(c,li,v)))}; }

const RULE_META = {
  'RULE-PR-001':{type:'Price variance', name:'Billed unit price exceeds tariff ± tolerance'},
  'RULE-QT-002':{type:'Quantity cap', name:'Quantity exceeds per-day cap'},
  'RULE-QT-003':{type:'Quantity cap', name:'Quantity exceeds documented admission days'},
  'RULE-UC-001':{type:'Uncontracted item', name:'No tariff entry for provider/version'},
  'RULE-BN-001':{type:'Bundled item', name:'Consumable included in bundled service'},
  'RULE-DP-001':{type:'Duplicate', name:'Same code, date and quantity billed twice'},
};
function computeVariances(c){
  const m = matchClaim(c); const out=[]; const f=c.facts; const tol=RULES.priceTolerancePct/100;
  const los = Math.max(1, Math.round((new Date(f.discharge.split('-').reverse().join('-'))-new Date(f.admissionISO))/864e5)) || f.los;
  const icuDoc = (()=>{ const d=c.docs.find(d=>d.type==='Discharge Summary'); const x=d&&d.fields.find(x=>x.label==='Days in ICU (documented)'); return x?parseInt(x.value,10)||0:f.icuDays; })();
  const matchedCodes = new Set(m.rows.filter(r=>r.item).map(r=>r.item.code));
  const bundledBy = {}; m.rows.forEach(r=>{ if(r.item&&r.item.bundle) r.item.bundle.forEach(b=>bundledBy[b]=r.item); });
  const seen = {};
  m.rows.forEach(r=>{
    const li=r.li; const key=(li.code||li.desc.toLowerCase())+'|'+li.date+'|'+li.qty;
    if(r.method==='pharmacy') return;
    if(!r.item){ if(li.medical) out.push(V(c,li,'RULE-UC-001',li.net,`No entry for "${li.desc}" in ${m.version?m.version.id:'any tariff version'}${r.score?` (best fuzzy candidate ${r.alternates[0].item.desc} at ${r.score}% — below ${RULES.fuzzyThreshold}% threshold)`:''}.`,{billed:li.net,expected:0})); return; }
    const t=r.item;
    if(seen[key]){ out.push(V(c,li,'RULE-DP-001',li.net,`"${li.desc}" (${t.code}) already billed on ${li.date} qty ${li.qty} as "${seen[key].desc}".`,{billed:li.net,expected:0,dupOf:seen[key].id})); return; } seen[key]=li;
    if(bundledBy[t.code]){ const parent=bundledBy[t.code]; out.push(V(c,li,'RULE-BN-001',li.net,`${t.desc} is included in ${parent.desc} (${parent.code}) per contract bundle rules; cannot be billed separately.`,{billed:li.net,expected:0})); return; }
    if(li.unitPrice > t.price*(1+tol)){ const diff=(li.unitPrice-t.price)*li.qty; const pct=Math.round(100*(li.unitPrice-t.price)/t.price); out.push(V(c,li,'RULE-PR-001',diff,`Billed ${fmtINR(li.unitPrice)} ${t.unit} vs contracted ${fmtINR(t.price)} ${t.unit} (+${pct}%, tolerance ${RULES.priceTolerancePct}%). Version ${m.version.id} effective ${m.version.effectiveFrom}.`,{billed:li.unitPrice,expected:t.price,pct})); }
    const cap=RULES.qtyCaps[t.code];
    if(cap){ let allowed=null,basis='';
      if(cap.perDay){ allowed=cap.perDay*los; basis=`${cap.perDay}/day × ${los} days LOS`; }
      else if(cap.perAdmission==='LOS'){ allowed=los; basis=`length of stay ${los} days (admission ${f.admission} → discharge ${f.discharge})`; }
      else if(cap.perAdmission==='ICU'){ allowed=icuDoc; basis=`discharge summary documents ${icuDoc} ICU day(s)`; }
      if(allowed!=null && li.qty>allowed){ const excess=li.qty-allowed; out.push(V(c,li,cap.perDay?'RULE-QT-002':'RULE-QT-003',excess*Math.min(li.unitPrice,t.price),`Billed qty ${li.qty} exceeds allowed ${allowed} (${basis}). Excess ${excess} × ${fmtINR(Math.min(li.unitPrice,t.price))}.`,{billed:li.qty,expected:allowed,excess})); }
    }
  });
  return out;
}
function V(c,li,ruleId,amount,rationale,ev){
  const key=li.id+'|'+ruleId; const meta=RULE_META[ruleId];
  const sev = amount>=20000?'Critical': amount>=5000?'High': amount>=1000?'Medium':'Low';
  const dec = c.decisions[key]||{status:'Open'};
  return {key, ruleId, type:meta.type, ruleName:meta.name, li, amount, rationale, ev, severity:sev, decision:dec, snippet:`${li.bill} › "${li.desc}" · qty ${li.qty} × ${fmtINR(li.unitPrice)} = ${fmtINR(li.net)}${li.date?' · '+li.date:''}`};
}
function claimTotals(c){
  const vs=computeVariances(c); const billed=c.lineItems.reduce((s,l)=>s+l.net,0);
  const nonMed=c.lineItems.filter(l=>!l.medical).reduce((s,l)=>s+l.net,0);
  const accepted=vs.filter(v=>v.decision.status==='Accepted').reduce((s,v)=>s+v.amount,0);
  const open=vs.filter(v=>v.decision.status==='Open').reduce((s,v)=>s+v.amount,0);
  const flagged=vs.reduce((s,v)=>s+v.amount,0);
  return {billed, nonMed, flagged, accepted, open, variances:vs, payable:billed-nonMed-accepted};
}
/* Exceptions: derived from low-confidence fields, open variances of High+ severity, uncontracted items, escalations */
function computeExceptions(){
  const out=[];
  CLAIMS.forEach(c=>{
    if(c.status==='Processing' || c.status==='Updated in Claim Core') { if(c.ocrFallback&&c.ocrFallback.queued) out.push(E(c,'OCR fallback','Document ingestion',c.ocrFallback.reason,'High',c.receivedAt,'#/claims/'+c.id+'/documents',c.assignee||'unassigned')); return; }
    c.docs.forEach(d=>d.fields.forEach(x=>{ if(!x.verified && x.conf<RULES.confidenceThreshold) out.push(E(c,'Low confidence','Field validation',`${x.label} (${x.conf}%) in ${d.type}`,x.conf<70?'High':'Medium',c.receivedAt,'#/claims/'+c.id+'/review?doc='+d.id+'&field='+x.id,c.assignee,{fieldId:x.id,docId:d.id})); }));
    computeVariances(c).forEach(v=>{ if(v.decision.status!=='Open') return; if(v.ruleId==='RULE-UC-001'||v.severity==='Critical'||v.severity==='High') out.push(E(c,v.ruleId==='RULE-UC-001'?'Uncontracted item':'Variance review','Variance panel',`${v.li.desc} · ${fmtINR(v.amount)}`,v.severity==='Critical'?'Critical':'High',c.receivedAt,'#/claims/'+c.id+'/variances?v='+encodeURIComponent(v.key),c.assignee,{vkey:v.key})); });
    c.escalations.forEach(e=>{ if(e.status==='Open') out.push(E(c,'Escalation',e.to,e.reason,'Critical',e.ts,'#/claims/'+c.id+'/variances',e.to==='Network Manager'?'U4':'U5',{escId:e.id,escalated:true})); });
  });
  return out.map((e,i)=>Object.assign(e,{id:'EXC-'+String(1001+i)}));
}
function E(c,type,area,issue,priority,since,link,assignee,extra){
  const hrs=RULES.slaHours[priority]; const ageH=(NOW-new Date(since))/3600e3; const pct=ageH/hrs;
  return Object.assign({claimId:c.id, claim:c, type, area, issue, priority, since, ageH, slaHours:hrs, slaPct:pct, sla:pct>=1?'Breached':pct>=0.75?'At risk':'On track', link, assignee}, extra||{});
}
const PRIO_RANK={Critical:0,High:1,Medium:2,Low:3};
