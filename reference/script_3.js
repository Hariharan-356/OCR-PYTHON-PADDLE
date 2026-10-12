
/* ============================================================
   Views: Intake, Claims list, Work queue, Tariffs, Reports, Admin
   ============================================================ */
let PENDING_FILES = [];
function viewIntake(el){
  setHeader('Intake',[{t:'Intake'}]);
  const today=CLAIMS.filter(c=>(NOW-new Date(c.receivedAt))<24*3600e3).length;
  const exc=computeExceptions(); const pendingReview=CLAIMS.filter(c=>['In review','Variance review','Exception'].includes(c.status)).length;
  const auto=CLAIMS.filter(c=>c.stage>=7).length;
  el.innerHTML=`
  <div class="grid g-4 mb">
    <div class="kpi"><div class="l">Claims received (24h)</div><div class="v">${today}</div><div class="d">${CLAIMS.length} in the last 7 days</div></div>
    <div class="kpi good"><div class="l">Straight-through</div><div class="v">${Math.round(100*auto/CLAIMS.length)}%</div><div class="d">${auto} of ${CLAIMS.length} needed no manual step</div></div>
    <div class="kpi ${pendingReview?'warn':''}"><div class="l">Awaiting action</div><div class="v">${pendingReview}</div><div class="d">${exc.length} open exceptions</div></div>
    <div class="kpi ${exc.some(e=>e.sla==='Breached')?'bad':''}"><div class="l">SLA breached</div><div class="v">${exc.filter(e=>e.sla==='Breached').length}</div><div class="d">${exc.filter(e=>e.sla==='At risk').length} at risk</div></div>
  </div>
  <div class="grid g-3-2">
    <div class="card">
      <div class="card-head"><h3>Upload claim documents</h3><span class="small muted">PDF, DOC/DOCX, HTML, XLSX, PNG, JPG, TIFF, ZIP · up to ${RULES.maxFileMB} MB each</span></div>
      <div class="card-body">
        ${can('upload')?`
        <div class="form-grid mb">
          <div class="field"><label>Source channel</label><select id="up-source"><option>IHX</option><option>ClaimBook</option><option>Email (cashless@acme.com)</option><option>SFTP</option><option>Manual upload</option></select></div>
          <div class="field"><label>Attach to claim</label><select id="up-claim"><option value="">New claim (auto-create)</option>${CLAIMS.map(c=>`<option value="${c.id}">${c.id} · ${esc(c.patient)}</option>`).join('')}</select></div>
          <div class="field" id="up-provider-wrap"><label>Hospital / provider</label><select id="up-provider">${PROVIDERS.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
          <div class="field" id="up-member-wrap"><label>Member id <span class="hint">(optional – read from Form C if blank)</span></label><input id="up-member" placeholder="MEM-0000000"></div>
        </div>
        <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload files"><strong>Drop files here or click to browse</strong><span>Each file is validated for type and size before ingestion. ZIP bundles are expanded and each page classified.</span></div>
        <ul class="file-list" id="file-list"></ul>
        <div class="row mt" style="justify-content:space-between">
          <button class="btn btn-outline btn-sm" id="load-sample">Use sample bundle (7 documents)</button>
          <div class="row"><button class="btn btn-ghost btn-sm" id="clear-files">Clear</button><button class="btn btn-primary" id="start-ingest" disabled>Start ingestion</button></div>
        </div>
        <div id="ingest-progress" class="mt" style="display:none"></div>`
        :`<div class="callout warn"><div>Your role (${esc(STATE.user.role)}) cannot upload documents. Switch to a Claims Processor, Team Lead or Admin from the user menu.</div></div>`}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Recent claims</h3><a class="btn btn-ghost btn-sm" href="#/claims">View all</a></div>
      <div class="table-wrap"><table class="tbl"><tbody>${CLAIMS.slice().sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).slice(0,6).map(c=>`<tr class="clickable" data-go="#/claims/${c.id}"><td><div class="id">${c.id}</div><div class="small muted">${esc(c.patient)} · ${esc(c.hospital.split(',')[0])}</div></td><td class="right">${statusBadge(c.status)}<div class="small mono mt" style="margin-top:4px">${fmtINR(c.billed)}</div></td></tr>`).join('')}</tbody></table></div>
    </div>
  </div>
  <div class="grid g-2 mt">
    <div class="card"><div class="card-head"><h3>Ingestion channels (today)</h3></div><div class="card-body">
      ${[['IHX',95,'Primary cashless feed'],['ClaimBook',4,'Empanelled hospitals without IHX'],['Email',1,'cashless@acme.com mailbox'],['SFTP',0,'Batch drops from TPAs']].map(([n,p,d])=>`<div class="bar-h"><span class="lbl">${n}<br><span class="small faint">${d}</span></span><span class="bar"><i style="width:${p}%"></i></span><span class="val">${p}%</span></div>`).join('')}
    </div></div>
    <div class="card"><div class="card-head"><h3>Service health</h3><span class="small muted">Live status of dependencies</span></div><div class="card-body">
      ${[['Document / OCR service','Degraded','var(--amber)','Circuit half-open after 504s; fallback OCR active'],['Classification service','Healthy','var(--green)','p95 0.8 s'],['Tariff DB','Healthy','var(--green)','5 providers, 7 versions'],['Claim Core API','Healthy','var(--green)','Last sync 2 min ago'],['Provider / Contract master','Healthy','var(--green)','Nightly sync OK']].map(([n,s,c,d])=>`<div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line-soft)"><span><span class="status-dot" style="background:${c}"></span>${n}</span><span class="small muted">${d} · <strong style="color:${c}">${s}</strong></span></div>`).join('')}
    </div></div>
  </div>`;
  $$('[data-go]',el).forEach(r=>r.onclick=()=>go(r.dataset.go));
  if(!can('upload')) return;
  const dz=$('#dropzone',el), fi=$('#file-input');
  dz.onclick=()=>fi.click(); dz.onkeydown=e=>{ if(e.key==='Enter'||e.key===' ') { e.preventDefault(); fi.click(); } };
  fi.value=''; fi.onchange=()=>{ addFiles([...fi.files]); fi.value=''; };
  dz.ondragover=e=>{ e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave=()=>dz.classList.remove('over');
  dz.ondrop=e=>{ e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); };
  $('#up-claim',el).onchange=e=>{ const on=!e.target.value; $('#up-provider-wrap',el).style.display=on?'':'none'; $('#up-member-wrap',el).style.display=on?'':'none'; };
  $('#load-sample',el).onclick=()=>{ addFiles([mk('FormC_PreAuth_scanned.pdf',2.6),mk('Discharge_Summary.pdf',1.1),mk('Hospital_Final_Bill.pdf',0.9),mk('Pharmacy_Bills.zip',3.4),mk('Lab_Reports.pdf',0.7),mk('Aadhaar_Front.jpg',1.9),mk('Cancelled_Cheque.png',0.8)]); };
  $('#clear-files',el).onclick=()=>{ PENDING_FILES=[]; renderFileList(); };
  $('#start-ingest',el).onclick=startIngestion;
  renderFileList();
  function mk(name,mb){ return {name, size:mb*1048576, sample:true}; }
}
function validateFile(f){
  const ext=f.name.split('.').pop().toLowerCase();
  if(!RULES.allowedExt.includes(ext)) return `415 Unsupported media type — .${ext} is not accepted (allowed: ${RULES.allowedExt.join(', ')})`;
  if(f.size>RULES.maxFileMB*1048576) return `413 Content too large — ${(f.size/1048576).toFixed(1)} MB exceeds the ${RULES.maxFileMB} MB limit. Split the file or raise the limit in Admin → Rules.`;
  if(f.size===0) return '400 Bad request — file is empty';
  return null;
}
function addFiles(files){ files.forEach(f=>{ if(PENDING_FILES.some(p=>p.name===f.name&&p.size===f.size)) return; PENDING_FILES.push({name:f.name,size:f.size,error:validateFile(f),sample:!!f.sample}); }); renderFileList(); }
function renderFileList(){
  const ul=$('#file-list'); if(!ul) return;
  ul.innerHTML=PENDING_FILES.map((f,i)=>`<li class="${f.error?'bad':''}"><span class="fname">${esc(f.name)}</span><span class="fmeta">${(f.size/1048576).toFixed(1)} MB${f.error?'':' · '+esc(guessType(f.name))}</span>${f.error?`<span class="ferr">${esc(f.error)}</span>`:''}<button class="btn btn-ghost btn-sm" data-rm="${i}" aria-label="Remove">✕</button></li>`).join('');
  $$('[data-rm]',ul).forEach(b=>b.onclick=()=>{ PENDING_FILES.splice(+b.dataset.rm,1); renderFileList(); });
  const ok=PENDING_FILES.filter(f=>!f.error).length; const btn=$('#start-ingest'); if(btn){ btn.disabled=!ok; btn.textContent=ok?`Start ingestion (${ok} file${ok>1?'s':''})`:'Start ingestion'; }
}
function guessType(name){
  const n=name.toLowerCase();
  if(/form ?c|pre-?auth|preauth/.test(n)) return 'Pre-Auth Form (Form C)'; if(/form ?a|claim ?form/.test(n)) return 'Claim Form A'; if(/discharge/.test(n)) return 'Discharge Summary';
  if(/pharm|medicine|med_bill/.test(n)) return 'Pharmacy Bill'; if(/implant|stent/.test(n)) return 'Implant Bill'; if(/diag|lab_bill/.test(n)) return 'Diagnostic Bill'; if(/food|diet|canteen/.test(n)) return 'Food Bill'; if(/opd|consult/.test(n)) return 'OPD Bill'; if(/bill|invoice/.test(n)) return 'Hospital Bill';
  if(/aadhaar|aadhar|pan|passport|kyc|voter/.test(n)) return 'KYC – Identity Proof'; if(/address/.test(n)) return 'KYC – Address Proof'; if(/cheque|check/.test(n)) return 'Cancelled Cheque';
  if(/lab|report|xray|x-ray|ct|mri|usg|path/.test(n)) return 'Investigation Report'; if(/fir|police/.test(n)) return 'FIR'; if(/post ?mortem|autopsy/.test(n)) return 'Postmortem Report'; if(/reg|certificate|licen/.test(n)) return 'Hospital Registration Certificate';
  return 'Unclassified';
}
async function startIngestion(){
  const files=PENDING_FILES.filter(f=>!f.error); if(!files.length) return;
  const source=$('#up-source').value.replace(/ \(.*\)/,''); const attach=$('#up-claim').value; const providerId=$('#up-provider').value; const memberIn=$('#up-member').value.trim();
  const btn=$('#start-ingest'); btn.disabled=true; $('#load-sample').disabled=true; $('#clear-files').disabled=true;
  const prog=$('#ingest-progress'); prog.style.display='';
  const steps=[['Validating & virus scan','All files within type/size policy'],['Uploading','Streaming to Document service (S3 on-prem)'],['OCR & extraction','Table-aware OCR, orientation correction, confidence per field'],['Classification','Per-page classification with medical / non-medical split'],['Structurization','Dates, units and currency normalized; ICD/PCS mapped'],['Tariff matching','Version selected by provider & effective date; code-first then fuzzy'],['Variance detection','Price, quantity, uncontracted, bundled, duplicate rules'],['Exception routing','Low-confidence fields and high-severity flags queued']];
  prog.innerHTML=`<div class="progress mb" style="margin-bottom:10px"><i id="ing-bar" style="width:0%"></i></div><ul class="timeline" id="ing-steps"></ul>`;
  const ul=$('#ing-steps'); let claim=null;
  for(let i=0;i<steps.length;i++){
    const li=document.createElement('li'); li.innerHTML=`<strong>${steps[i][0]}</strong>…<small>${steps[i][1]}</small>`; ul.appendChild(li);
    $('#ing-bar').style.width=Math.round(100*(i+0.5)/steps.length)+'%';
    await sleep(i===2?900:i===3?700:500);
    let note='';
    if(i===1){ claim = attach? claimById(attach) : createClaimFromUpload(files, source, providerId, memberIn); if(attach) attachFilesToClaim(claim, files, source); note=attach?`Attached ${files.length} file(s) to ${claim.id}`:`Created ${claim.id} for ${claim.patient}`; }
    if(i===3){ const pages=claim.docs.reduce((s,d)=>s+d.pages.length,0); note=`${claim.docs.length} documents, ${pages} pages · ${claim.docs.filter(d=>d.medical).length} medical / ${claim.docs.filter(d=>!d.medical).length} non-medical · 0.8 s`; claim.stage=3; }
    if(i===2){ const nf=claim.docs.reduce((s,d)=>s+d.fields.length,0); const low=claim.docs.reduce((s,d)=>s+d.fields.filter(x=>x.conf<RULES.confidenceThreshold).length,0); note=`${nf} fields extracted · ${low} below ${RULES.confidenceThreshold}% threshold`; claim.stage=2; }
    if(i===4){ note=`Primary diagnosis ${claim.diagnoses[0].icd}; ${claim.lineItems.length} line items structured`; claim.stage=4; }
    if(i===5){ const m=matchClaim(claim); note=m.version?`${m.version.id} (effective ${m.version.effectiveFrom}) · ${m.rows.filter(r=>r.method==='code').length} code, ${m.rows.filter(r=>r.method==='fuzzy').length} fuzzy, ${m.rows.filter(r=>r.method==='none').length} unmatched`:'No active tariff version for admission date'; claim.stage=5; }
    if(i===6){ const vs=computeVariances(claim); note=vs.length?`${vs.length} flag(s) · ${fmtINR(vs.reduce((s,v)=>s+v.amount,0))}`:'No variances'; claim.stage=6; claim.status=vs.length?'Variance review':'In review'; if(vs.length) notify(`${vs.length} variances flagged on ${claim.id} (${fmtINR(vs.reduce((s,v)=>s+v.amount,0))})`,'warn','#/claims/'+claim.id+'/variances'); }
    if(i===7){ const ex=computeExceptions().filter(x=>x.claimId===claim.id); note=`${ex.length} exception(s) queued`; if(!ex.length){ claim.status='Approved'; claim.stage=7; } }
    li.innerHTML=`<strong>${steps[i][0]}</strong> ✓<small>${esc(note||steps[i][1])}</small>`;
  }
  $('#ing-bar').style.width='100%';
  claim.audit.unshift({id:uid('AUD'),ts:new Date().toISOString(),user:'system',entity:'Pipeline',action:'Completed',detail:`Ingestion via ${source}: ${files.length} file(s)`});
  notify(`Ingestion success: ${files.length} document(s) received for ${claim.id} via ${source}`,'ok','#/claims/'+claim.id+'/documents');
  PENDING_FILES=[];
  const done=document.createElement('div'); done.className='callout ok mt'; done.innerHTML=`<div><strong>${claim.id} is ready.</strong> Status: ${esc(claim.status)}. <a href="#/claims/${claim.id}">Open the claim workspace</a></div>`; prog.appendChild(done);
  toast(`${claim.id} processed`,'ok'); renderNav();
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SAMPLE_NAMES=[['Anjali Menon','Female',37,'12-06-1989'],['Suresh Iyer','Male',52,'03-02-1974'],['Fatima Begum','Female',45,'22-09-1981'],['Karan Mehta','Male',31,'14-11-1994']];
function createClaimFromUpload(files, source, providerId, memberIn){
  const p=providerById(providerId); const who=SAMPLE_NAMES[_seq%SAMPLE_NAMES.length]; const num=String(1047+CLAIMS.filter(c=>c.id.startsWith('CLM-2026-')).length+1).padStart(5,'0');
  const base=CLAIMS[0].facts; const memberId=memberIn||('MEM-'+String(7000000+Math.floor(Math.random()*999999)));
  const admISO=dAgo(4).slice(0,10); const adm=admISO.split('-').reverse().join('-'); const dis=dAgo(1).slice(0,10).split('-').reverse().join('-');
  const facts=Object.assign({},base,{patient:who[0],gender:who[1],age:who[2],dob:who[3],memberId,policy:'GHP-2026-00'+(40000+Math.floor(Math.random()*9999)),hospital:p.name,city:p.city,rohini:p.rohini,hospReg:base.hospReg,hospAddress:p.city,admission:adm,admissionISO:admISO,discharge:dis,surgeryDate:adm,los:3,icuDays:1,billed:0,billNo:'HB/2026/'+(600000+Math.floor(Math.random()*99999))});
  const m=1; const li=[
    LI('Hospital Bill','Registration','ADM-01',1,'per admission',500,{category:'Admin',medical:false,date:adm}),
    LI('Hospital Bill','Room rent – Deluxe single','RR-DLX',3,'per day',7200,{category:'Room',date:adm}),
    LI('Hospital Bill','Nursing charges','NUR-STD',3,'per day',800,{category:'Nursing',date:adm}),
    LI('Hospital Bill','ICU charges','ICU-01',2,'per day',15500,{category:'ICU',date:adm}),
    LI('Hospital Bill','Doctor visits','DR-VIS',7,'per visit',950,{category:'Consultation',date:adm}),
    LI('Hospital Bill','OT charges','OT-01',1,'per procedure',18500,{category:'Surgery',date:adm}),
    LI('Hospital Bill','Surgeon fees – Lap. appendectomy','SURG-APP',1,'per procedure',36000,{category:'Surgery',date:adm}),
    LI('Hospital Bill','Anaesthesia','ANES-01',1,'per procedure',12000,{category:'Surgery',date:adm}),
    LI('Hospital Bill','Complete blood count','LAB-CBC',2,'per test',480,{category:'Laboratory',date:adm}),
    LI('Hospital Bill','Ultrasound abdomen','RAD-USG',1,'per scan',1900,{category:'Radiology',date:adm}),
    LI('Hospital Bill','Patient diet','FOOD-01',3,'per day',400,{category:'Non-medical',medical:false,date:adm}),
    LI('Pharmacy Bill','Inj. Ceftriaxone 1g','PH-CEF',6,'vial',180,{category:'Pharmacy',batch:'B2211/03-2027'}),
    LI('Pharmacy Bill','Syringe 5ml','CONS-SYR',20,'unit',12,{category:'Consumables'}),
  ];
  facts.billed=li.reduce((s,l)=>s+l.net,0); facts.gross=facts.billed+3000; facts.discount=3000; facts.pharmTotal=li.filter(l=>l.bill==='Pharmacy Bill').reduce((s,l)=>s+l.net,0); facts.expectedCost=facts.billed;
  const c=makeClaim({id:'CLM-2026-'+num, providerId, source, receivedAt:new Date().toISOString(), status:'Processing', stage:1, assignee:STATE.user.id, facts,
    docs:files.map(f=>({name:f.name,type:guessType(f.name),pages:/zip/.test(f.name)?3:/form ?c|discharge|bill/i.test(f.name)?2:1,size:(f.size/1048576).toFixed(1)+' MB',handwritten:/form ?c|scan/i.test(f.name),detections:/bill|discharge|form/i.test(f.name)?['stamp','signature']:[]})),
    diagnoses:CLAIMS[0].diagnoses.map(d=>Object.assign({},d)), procedures:CLAIMS[0].procedures.map(d=>Object.assign({},d)), icpSummary:`${who[2]}${who[1][0]}, acute appendicitis; laparoscopic appendectomy; discharged day 3.`, lineItems:li});
  c.docs.forEach(d=>{ if(d.handwritten){ d.fields.forEach((x,i)=>{ if(i%6===3) x.conf=Math.min(x.conf,72); }); } });
  CLAIMS.unshift(c); return c;
}
function attachFilesToClaim(c, files, source){
  files.forEach(f=>{ const type=guessType(f.name); const d={id:uid('DOC'),name:f.name,type,source,size:(f.size/1048576).toFixed(1)+' MB',ext:f.name.split('.').pop().toLowerCase(),uploaded:new Date().toISOString(),ocrStatus:'Completed',handwritten:false,language:'English',pages:[{n:1,cls:type,conf:95,label:type}],fields:fieldsFor(type,c.facts),detections:[],medical:!NON_MEDICAL_DOCS.includes(type),validated:false}; c.docs.push(d); });
  audit(c,'Document','Attached',files.length+' file(s) added via '+source);
}

/* ---------------- Claims list ---------------- */
function viewClaims(el){
  setHeader('Claims',[{t:'Claims'}]);
  const f=STATE.listFilters; const statuses=['All','Processing','In review','Variance review','Exception','Approved','Updated in Claim Core'];
  let rows=CLAIMS.filter(c=>(f.status==='All'||c.status===f.status)&&(!f.q||[c.id,c.patient,c.memberId,c.hospital,c.policy].join(' ').toLowerCase().includes(f.q.toLowerCase())));
  el.innerHTML=`<div class="page-head"><div><p>Every claim ingested in the last 7 days, with its pipeline stage. Open a claim to review documents, corrections, tariff matches and variances.</p></div><div class="actions"><button class="btn btn-outline" id="exp-claims">Export CSV</button><a class="btn btn-primary" href="#/intake">Upload documents</a></div></div>
  <div class="card"><div class="card-head"><div class="seg" id="status-seg">${statuses.map(s=>`<button class="${f.status===s?'active':''}" data-s="${s}">${s}${s==='All'?' ('+CLAIMS.length+')':''}</button>`).join('')}</div><div class="field" style="min-width:240px"><input id="claims-q" placeholder="Filter by claim, member, hospital…" value="${esc(f.q)}"></div></div>
  <div class="table-wrap"><table class="tbl"><thead><tr><th>Claim</th><th>Member</th><th>Hospital</th><th>Admission</th><th>Source</th><th class="num">Billed</th><th class="num">Flagged</th><th>Stage</th><th>Status</th><th>Assignee</th><th>Received</th></tr></thead><tbody>
  ${rows.length?rows.map(c=>{ const t=claimTotals(c); return `<tr class="clickable" data-go="#/claims/${c.id}"><td class="id">${c.id}</td><td>${esc(c.patient)}<div class="small muted">${c.memberId}</div></td><td>${esc(c.hospital)}</td><td>${c.admission} → ${c.discharge}</td><td>${c.source}</td><td class="num">${fmtINR(t.billed)}</td><td class="num" style="color:${t.open?'var(--red)':'inherit'}">${t.flagged?fmtINR(t.flagged):'—'}</td><td><span class="small">${c.stage+1}/9 · ${STAGES[Math.min(c.stage,8)]}</span></td><td>${statusBadge(c.status)}</td><td>${esc(userName(c.assignee))}</td><td class="small muted">${ago(c.receivedAt)} ago</td></tr>`; }).join(''):`<tr><td colspan="11"><div class="empty"><strong>No claims match</strong>Try clearing the status filter or search.</div></td></tr>`}
  </tbody></table></div></div>`;
  $$('#status-seg button',el).forEach(b=>b.onclick=()=>{ f.status=b.dataset.s; render(); });
  $('#claims-q',el).oninput=e=>{ f.q=e.target.value; const tb=$('tbody',el); viewClaims(el); $('#claims-q',el).focus(); const i=$('#claims-q',el); i.setSelectionRange(i.value.length,i.value.length); };
  $$('[data-go]',el).forEach(r=>r.onclick=()=>go(r.dataset.go));
  $('#exp-claims',el).onclick=()=>exportCSV('claims_'+NOW.toISOString().slice(0,10)+'.csv',[['Claim ID','Member','Member ID','Hospital','Admission','Discharge','Source','Billed','Flagged','Accepted deductions','Status','Assignee']].concat(rows.map(c=>{const t=claimTotals(c);return [c.id,c.patient,c.memberId,c.hospital,c.admission,c.discharge,c.source,t.billed,t.flagged,t.accepted,c.status,userName(c.assignee)];})));
}

/* ---------------- Export (works in published artifact and as a standalone file) ---------------- */
async function exportCSV(filename, rows){
  const csv=rows.map(r=>r.map(v=>{ const s=String(v??''); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(',')).join('\n');
  try{ if(window.claude && typeof window.claude.use==='function'){ const dl=await window.claude.use('downloads'); if(dl){ await dl.save({filename, data:csv}); toast('Exported '+filename,'ok'); return; } } }catch(e){ if(e&&e.code==='declined'){ toast('Export cancelled'); return; } }
  try{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); }catch(e){}
  openModal({title:'Export ready — '+filename, wide:true, body:`<p class="small muted mb">${rows.length-1} rows. If the download did not start, copy the CSV below.</p><pre class="code" style="max-height:320px">${esc(csv)}</pre>`, footer:`<button class="btn btn-outline" data-close>Close</button><button class="btn btn-primary" id="cp-csv">Copy to clipboard</button>`, onOpen:m=>{ $('#cp-csv',m).onclick=()=>{ navigator.clipboard&&navigator.clipboard.writeText(csv).then(()=>toast('Copied','ok'),()=>toast('Clipboard unavailable','warn')); }; }});
}

/* ---------------- Work queue ---------------- */
function viewQueue(el){
  setHeader('Work queue',[{t:'Work queue'}]);
  let all=computeExceptions(); const me=STATE.user.id;
  const tabs=[['mine','My queue',all.filter(x=>x.assignee===me).length],['team','Team queue',all.length],['esc','Escalations',all.filter(x=>x.escalated).length],['breach','SLA breached',all.filter(x=>x.sla==='Breached').length]];
  let rows=STATE.queueTab==='mine'?all.filter(x=>x.assignee===me):STATE.queueTab==='esc'?all.filter(x=>x.escalated):STATE.queueTab==='breach'?all.filter(x=>x.sla==='Breached'):all;
  const s=STATE.queueSort; const keyFn={priority:x=>PRIO_RANK[x.priority],age:x=>-x.ageH,sla:x=>-x.slaPct,claim:x=>x.claimId,type:x=>x.type,provider:x=>x.claim.hospital}[s.key];
  rows=rows.slice().sort((a,b)=>{ const A=keyFn(a),B=keyFn(b); return (A>B?1:A<B?-1:0)*s.dir || PRIO_RANK[a.priority]-PRIO_RANK[b.priority] || b.slaPct-a.slaPct; });
  const avgAge=all.length?(all.reduce((s,x)=>s+x.ageH,0)/all.length).toFixed(1):'0';
  el.innerHTML=`<div class="grid g-4 mb">
    <div class="kpi"><div class="l">Open exceptions</div><div class="v">${all.length}</div><div class="d">${all.filter(x=>x.assignee===me).length} assigned to you</div></div>
    <div class="kpi"><div class="l">Average age</div><div class="v">${avgAge} h</div><div class="d">Target: resolve within SLA by severity</div></div>
    <div class="kpi ${all.some(x=>x.sla==='At risk')?'warn':''}"><div class="l">SLA at risk</div><div class="v">${all.filter(x=>x.sla==='At risk').length}</div><div class="d">≥75% of SLA elapsed</div></div>
    <div class="kpi ${all.some(x=>x.sla==='Breached')?'bad':''}"><div class="l">SLA breached</div><div class="v">${all.filter(x=>x.sla==='Breached').length}</div><div class="d">Critical 2h · High 4h · Medium 8h · Low 24h</div></div>
  </div>
  <div class="card"><div class="card-head"><div class="tabs" style="margin:0;border:none">${tabs.map(([k,l,n])=>`<button class="${STATE.queueTab===k?'active':''}" data-tab="${k}">${l}<span class="cnt ${k==='breach'&&n?'warn':''}">${n}</span></button>`).join('')}</div><div class="row"><span class="small muted">Sorted by ${s.key}</span><button class="btn btn-outline btn-sm" id="q-refresh">Refresh</button></div></div>
  <div class="table-wrap"><table class="tbl"><thead>${tableSortHead([{key:'',label:'Exception'},{key:'claim',label:'Claim'},{key:'provider',label:'Provider'},{key:'type',label:'Type'},{key:'',label:'Issue'},{key:'priority',label:'Priority'},{key:'age',label:'Age'},{key:'sla',label:'SLA'},{key:'',label:'Assignee'},{key:'',label:''}],s)}</thead><tbody>
  ${rows.length?rows.map(x=>`<tr class="${x.sla==='Breached'?'flag':''}"><td class="id">${x.id}</td><td><a href="#/claims/${x.claimId}">${x.claimId}</a><div class="small muted">${esc(x.claim.patient)}</div></td><td class="small">${esc(x.claim.hospital.split(',')[0])}</td><td>${esc(x.type)}<div class="small muted">${esc(x.area)}</div></td><td style="max-width:260px">${esc(x.issue)}</td><td>${prioBadge(x.priority)}</td><td class="mono">${ago(x.since)}</td><td>${slaBadge(x)}</td><td class="small">${esc(userName(x.assignee))}</td><td><div class="row" style="flex-wrap:nowrap"><button class="btn btn-primary btn-sm" data-open="${esc(x.link)}">Open</button>${x.assignee!==me&&!x.escalated?`<button class="btn btn-outline btn-sm" data-assign="${x.claimId}">Assign to me</button>`:''}${x.escalated&&can('resolveEsc')?`<button class="btn btn-success btn-sm" data-resolve-esc="${x.claimId}|${x.escId}">Resolve</button>`:''}</div></td></tr>`).join(''):`<tr><td colspan="10"><div class="empty"><strong>Queue is clear</strong>Nothing needs attention in this view.</div></td></tr>`}
  </tbody></table></div></div>`;
  $$('[data-tab]',el).forEach(b=>b.onclick=()=>{ STATE.queueTab=b.dataset.tab; render(); });
  $$('th.sortable',el).forEach(th=>th.onclick=()=>{ if(!th.dataset.key) return; if(s.key===th.dataset.key) s.dir*=-1; else { s.key=th.dataset.key; s.dir=1; } render(); });
  $('#q-refresh',el).onclick=()=>{ render(); toast('Queue refreshed'); };
  $$('[data-open]',el).forEach(b=>b.onclick=()=>go(b.dataset.open));
  $$('[data-assign]',el).forEach(b=>b.onclick=()=>{ const c=claimById(b.dataset.assign); const before=userName(c.assignee); c.assignee=me; audit(c,'Claim','Reassigned',`Assignee ${before} → ${STATE.user.name}`,before,STATE.user.name); toast(c.id+' assigned to you','ok'); render(); });
  $$('[data-resolve-esc]',el).forEach(b=>b.onclick=()=>{ const [cid,eid]=b.dataset.resolveEsc.split('|'); const c=claimById(cid); const e=c.escalations.find(x=>x.id===eid); promptModal('Resolve escalation','Resolution note',v=>{ e.status='Resolved'; e.resolution=v; e.resolvedBy=STATE.user.name; e.resolvedAt=new Date().toISOString(); audit(c,'Exception','Escalation resolved',v); if(c.status==='Exception'){ c.status='Variance review'; } notify(`Escalation on ${c.id} resolved by ${STATE.user.name}`,'ok','#/claims/'+c.id+'/variances'); toast('Escalation resolved','ok'); render(); },{placeholder:'e.g. Case-to-case rate of ₹98,000 approved by network; deduct balance.'}); });
}

/* ---------------- Tariff repository ---------------- */
function viewTariffs(el){
  const sel=STATE.tariffSel; if(STATE.route.parts[0]){ sel.provider=STATE.route.parts[0]; sel.version=null; }
  const p=providerById(sel.provider)||PROVIDERS[0]; sel.provider=p.id; const v=p.versions.find(x=>x.id===sel.version)||activeVersionFor(p.id,NOW.toISOString())||p.versions[p.versions.length-1]; sel.version=v.id;
  setHeader('Tariff repository',[{t:'Tariff repository',href:'#/tariffs'},{t:p.name}]);
  const q=sel.q.toLowerCase(); const items=v.items.filter(i=>!q||(i.code+' '+i.desc+' '+i.category).toLowerCase().includes(q));
  const sc={Active:'b-green',Superseded:'b-gray',Upcoming:'b-blue',Draft:'b-amber'};
  el.innerHTML=`<div class="page-head"><div><p>One structured schedule per provider and contract period. The engine picks the version whose effective window contains the admission date; analysts can override per claim.</p></div><div class="actions">${can('tariff')?`<button class="btn btn-primary" id="t-upload">Upload tariff sheet</button>`:''}</div></div>
  <div class="split-list">
    <div class="card"><div class="card-head"><h3>Providers</h3><span class="small muted">${PROVIDERS.length}</span></div><div class="list-nav">${PROVIDERS.map(x=>`<button class="${x.id===p.id?'active':''}" data-prov="${x.id}">${esc(x.name)}<small>${x.versions.length} version(s) · ROHINI ${x.rohini}</small></button>`).join('')}</div></div>
    <div class="stack">
      <div class="card"><div class="card-head"><h3>Versions <span class="sub">${esc(p.name)}</span></h3></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Version</th><th>Contract</th><th>Effective from</th><th>Effective to</th><th>Status</th><th class="num">Line items</th><th>Source</th><th></th></tr></thead><tbody>
      ${p.versions.map(x=>{ const st=versionStatus(x); return `<tr class="clickable ${x.id===v.id?'flag':''}" data-ver="${x.id}"><td class="id">${x.id}</td><td>${esc(x.label)}</td><td>${x.effectiveFrom}</td><td>${x.effectiveTo||'Open-ended'}</td><td><span class="badge ${sc[st]}">${st}</span></td><td class="num">${x.items.length}</td><td class="small muted">${esc(x.source)}</td><td>${can('tariff')?`<button class="btn btn-outline btn-sm" data-edit-ver="${x.id}">Edit dates</button>`:''}</td></tr>`; }).join('')}
      </tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>${v.id} <span class="sub">${esc(v.discountNote)}</span></h3><div class="field" style="min-width:220px"><input id="t-q" placeholder="Search code or description…" value="${esc(sel.q)}"></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Description</th><th>Category</th><th>Unit</th><th class="num">Tariff (INR)</th><th>Bundles</th><th>Medical</th><th>Cap</th></tr></thead><tbody>
      ${items.length?items.map(i=>`<tr><td class="id">${i.code}</td><td>${esc(i.desc)}</td><td>${i.category}</td><td class="small">${i.unit}</td><td class="num">${fmtINR(i.price)}</td><td class="small">${i.bundle?'includes '+i.bundle.join(', '):'—'}</td><td>${i.medical?'<span class="badge b-teal">Medical</span>':'<span class="badge b-gray">Non-medical</span>'}</td><td class="small muted">${RULES.qtyCaps[i.code]?RULES.qtyCaps[i.code].label:'—'}</td></tr>`).join(''):'<tr><td colspan="8"><div class="empty">No line items match</div></td></tr>'}
      </tbody></table></div></div>
    </div>
  </div>`;
  $$('[data-prov]',el).forEach(b=>b.onclick=()=>{ sel.provider=b.dataset.prov; sel.version=null; go('#/tariffs'); render(); });
  $$('[data-ver]',el).forEach(r=>r.onclick=e=>{ if(e.target.closest('button')) return; sel.version=r.dataset.ver; render(); });
  $('#t-q',el).oninput=e=>{ sel.q=e.target.value; viewTariffs(el); const i=$('#t-q',el); i.focus(); i.setSelectionRange(i.value.length,i.value.length); };
  $$('[data-edit-ver]',el).forEach(b=>b.onclick=()=>{ const x=p.versions.find(y=>y.id===b.dataset.editVer); openModal({title:'Edit effective dates — '+x.id, body:`<div class="form-grid"><div class="field"><label>Effective from</label><input type="date" id="ef" value="${x.effectiveFrom}"></div><div class="field"><label>Effective to</label><input type="date" id="et" value="${x.effectiveTo||''}"><span class="hint">Leave blank for open-ended</span></div></div><div class="err" id="ev-err" style="margin-top:8px;color:var(--red);font-size:12px"></div>`, footer:`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="ev-ok">Save</button>`, onOpen:m=>{ $('#ev-ok',m).onclick=()=>{ const ef=$('#ef',m).value, et=$('#et',m).value; if(!ef){ $('#ev-err',m).textContent='Effective from is required.'; return; } if(et&&et<ef){ $('#ev-err',m).textContent='Effective to must be after effective from.'; return; } const overlap=p.versions.find(o=>o.id!==x.id&&o.status!=='Draft'&&o.effectiveFrom<=(et||'9999')&&(o.effectiveTo||'9999')>=ef); if(overlap){ $('#ev-err',m).textContent=`Overlaps with ${overlap.id} (${overlap.effectiveFrom} → ${overlap.effectiveTo||'open'}). Adjust that version first.`; return; } x.effectiveFrom=ef; x.effectiveTo=et||null; x.status=undefined; closeModal(); toast('Effective dates updated','ok'); render(); }; }}); });
  const up=$('#t-upload',el); if(up) up.onclick=()=>openModal({title:'Upload tariff sheet', body:`<div class="stack"><div class="field"><label>Provider</label><select id="tu-prov">${PROVIDERS.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label>Effective from</label><input type="date" id="tu-from" value="2027-04-01"></div><div class="field"><label>Effective to</label><input type="date" id="tu-to"></div></div><div class="field"><label>File</label><input type="file" id="tu-file" accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"><span class="hint">Scanned PDFs are auto-rotated; discount verbiage is parsed into line-level discounts; non-medical items are tagged.</span></div><div class="err" id="tu-err" style="color:var(--red);font-size:12px"></div></div>`, footer:`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="tu-ok">Extract & create draft</button>`, onOpen:m=>{ $('#tu-ok',m).onclick=async()=>{ const f=$('#tu-file',m).files[0]; const from=$('#tu-from',m).value; if(!from){ $('#tu-err',m).textContent='Effective from is required.'; return; } const fname=f?f.name:'Tariff_sample.pdf'; if(f){ const err=validateFile(f); if(err){ $('#tu-err',m).textContent=err; return; } } const prov=providerById($('#tu-prov',m).value); $('#tu-ok',m).disabled=true; $('#tu-ok',m).textContent='Extracting…'; await sleep(1200); const nv={id:'TV-'+prov.id.slice(-3)+'-DRAFT-'+(prov.versions.length+1), label:'Draft from '+fname, effectiveFrom:from, effectiveTo:$('#tu-to',m).value||null, status:'Draft', items:baseTariff(1.1), discountNote:'Parsed: 10% on pharmacy MRP (from page 2 verbiage)', source:fname+' (uploaded now)', uploaded:new Date().toISOString()}; prov.versions.push(nv); sel.provider=prov.id; sel.version=nv.id; closeModal(); toast('Draft version '+nv.id+' created with '+nv.items.length+' line items','ok'); audit(CLAIMS[0],'Tariff','Draft created',nv.id+' from '+fname); render(); }; }});
}

/* ---------------- Reports ---------------- */
function viewReports(el){
  setHeader('Reports',[{t:'Reports'}]);
  const allV=CLAIMS.flatMap(c=>computeVariances(c).map(v=>Object.assign({claim:c},v)));
  const byType={}; allV.forEach(v=>{ byType[v.type]=(byType[v.type]||0)+v.amount; });
  const totalBilled=CLAIMS.reduce((s,c)=>s+claimTotals(c).billed,0); const totalFlag=allV.reduce((s,v)=>s+v.amount,0); const accepted=allV.filter(v=>v.decision.status==='Accepted').reduce((s,v)=>s+v.amount,0);
  const exc=computeExceptions(); const sla=exc.length?Math.round(100*exc.filter(e=>e.sla!=='Breached').length/exc.length):100;
  const docStats={}; CLAIMS.forEach(c=>c.docs.forEach(d=>{ const s=docStats[d.type]=docStats[d.type]||{n:0,pages:0,conf:0,f:0}; s.n++; s.pages+=d.pages.length; d.fields.forEach(x=>{ s.conf+=x.conf; s.f++; }); }));
  const days=[...Array(7)].map((_,i)=>{ const d=new Date(NOW.getTime()-(6-i)*864e5); const key=d.toISOString().slice(0,10); return {label:d.toLocaleDateString('en-IN',{weekday:'short'}), n:CLAIMS.filter(c=>c.receivedAt.slice(0,10)===key).length, done:CLAIMS.filter(c=>c.receivedAt.slice(0,10)===key&&c.stage>=7).length}; });
  const maxN=Math.max(1,...days.map(d=>d.n));
  const byHosp={}; CLAIMS.forEach(c=>{ const h=byHosp[c.hospital]=byHosp[c.hospital]||{n:0,billed:0,flag:0}; h.n++; h.billed+=claimTotals(c).billed; h.flag+=claimTotals(c).flagged; });
  el.innerHTML=`<div class="page-head"><div><p>Computed live from the claims in this workspace. Exports include every row behind the numbers.</p></div><div class="actions"><button class="btn btn-outline" id="exp-var">Export variances CSV</button><button class="btn btn-outline" id="exp-fields">Export extracted fields CSV</button></div></div>
  <div class="grid g-5 mb">
    <div class="kpi"><div class="l">Claims (7 days)</div><div class="v">${CLAIMS.length}</div><div class="d">${fmtINR(totalBilled)} billed</div></div>
    <div class="kpi good"><div class="l">Straight-through rate</div><div class="v">${Math.round(100*CLAIMS.filter(c=>c.stage>=7).length/CLAIMS.length)}%</div><div class="d">No manual step needed</div></div>
    <div class="kpi"><div class="l">Avg extraction confidence</div><div class="v">${Math.round(Object.values(docStats).reduce((s,x)=>s+x.conf,0)/Math.max(1,Object.values(docStats).reduce((s,x)=>s+x.f,0)))}%</div><div class="d">Printed ≥98% · handwritten ≥90% target</div></div>
    <div class="kpi bad"><div class="l">Leakage flagged</div><div class="v">${fmtINR(totalFlag)}</div><div class="d">${fmtINR(accepted)} confirmed as deductions</div></div>
    <div class="kpi ${sla<90?'warn':'good'}"><div class="l">SLA compliance</div><div class="v">${sla}%</div><div class="d">Target ≥90% within SLA</div></div>
  </div>
  <div class="grid g-2 mb">
    <div class="card"><div class="card-head"><h3>Claims received vs completed</h3><span class="small muted">Last 7 days</span></div><div class="card-body">
      <svg viewBox="0 0 560 200" width="100%" role="img" aria-label="Claims per day">${days.map((d,i)=>{ const x=30+i*74; const h1=d.n/maxN*140, h2=d.done/maxN*140; return `<rect x="${x}" y="${160-h1}" width="26" height="${h1}" fill="#16233B" rx="2"/><rect x="${x+30}" y="${160-h2}" width="26" height="${h2}" fill="#0F766E" rx="2"/><text x="${x+28}" y="182" font-size="12" text-anchor="middle" fill="#5B6579">${d.label}</text><text x="${x+13}" y="${152-h1}" font-size="11" text-anchor="middle" fill="#16233B">${d.n||''}</text>`; }).join('')}<line x1="20" y1="160" x2="550" y2="160" stroke="#D9DEE6"/></svg>
      <div class="row small muted" style="gap:16px;margin-top:4px"><span><span class="status-dot" style="background:#16233B"></span>Received</span><span><span class="status-dot" style="background:#0F766E"></span>Completed (approved/updated)</span></div>
    </div></div>
    <div class="card"><div class="card-head"><h3>Variance breakdown by rule type</h3><span class="small muted">${allV.length} flags</span></div><div class="card-body">
      ${Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,a])=>`<div class="bar-h"><span class="lbl">${t}</span><span class="bar"><i style="width:${Math.round(100*a/Math.max(1,totalFlag))}%;background:${{'Price variance':'#B91C1C','Quantity cap':'#B45309','Uncontracted item':'#16233B','Bundled item':'#1D4ED8','Duplicate':'#0F766E'}[t]||'#16233B'}"></i></span><span class="val">${fmtINR(a)}</span></div>`).join('')||'<div class="empty">No variances</div>'}
      <div class="small muted mt">Detection tolerance ${RULES.priceTolerancePct}% · fuzzy threshold ${RULES.fuzzyThreshold}% — change in Admin → Rules and this chart recomputes.</div>
    </div></div>
  </div>
  <div class="grid g-2">
    <div class="card"><div class="card-head"><h3>Document classification & extraction</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Document type</th><th class="num">Docs</th><th class="num">Pages</th><th class="num">Fields</th><th class="num">Avg confidence</th></tr></thead><tbody>${Object.entries(docStats).sort((a,b)=>b[1].n-a[1].n).map(([t,s])=>`<tr><td>${esc(t)}</td><td class="num">${s.n}</td><td class="num">${s.pages}</td><td class="num">${s.f}</td><td class="num">${s.f?Math.round(s.conf/s.f):'—'}%</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>Providers by billed amount</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Provider</th><th class="num">Claims</th><th class="num">Billed</th><th class="num">Flagged</th><th class="num">Leakage %</th></tr></thead><tbody>${Object.entries(byHosp).sort((a,b)=>b[1].billed-a[1].billed).map(([h,s])=>`<tr><td>${esc(h)}</td><td class="num">${s.n}</td><td class="num">${fmtINR(s.billed)}</td><td class="num">${fmtINR(s.flag)}</td><td class="num" style="color:${s.flag/s.billed>0.1?'var(--red)':'inherit'}">${(100*s.flag/s.billed).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div></div>
  </div>`;
  $('#exp-var',el).onclick=()=>exportCSV('variances_'+NOW.toISOString().slice(0,10)+'.csv',[['Claim','Provider','Bill','Line item','Code','Rule ID','Type','Severity','Amount','Decision','Rationale']].concat(allV.map(v=>[v.claim.id,v.claim.hospital,v.li.bill,v.li.desc,v.li.code||'',v.ruleId,v.type,v.severity,v.amount,v.decision.status,v.rationale])));
  $('#exp-fields',el).onclick=()=>exportCSV('extracted_fields_'+NOW.toISOString().slice(0,10)+'.csv',[['Claim','Document','Type','Section','Field','Value','Confidence','Verified']].concat(CLAIMS.flatMap(c=>c.docs.flatMap(d=>d.fields.map(x=>[c.id,d.name,d.type,x.section,x.label,x.masked?x.value:x.value,x.conf,x.verified?'Yes':'No'])))));
}

/* ---------------- Admin ---------------- */
function viewAdmin(el){
  if(STATE.route.parts[0]) STATE.adminTab=STATE.route.parts[0];
  setHeader('Admin',[{t:'Admin'}]);
  if(!can('admin')){ el.innerHTML=`<div class="callout warn"><div><strong>Admin console is restricted.</strong> Your role (${esc(STATE.user.role)}) does not include administration. Switch to the Admin user from the user menu in the left rail to demo this area.</div></div>`; return; }
  const tab=STATE.adminTab; const tabs=[['users','Users & roles'],['rules','Rules engine'],['integrations','Integrations'],['notifications','Notification templates'],['logs','System logs']];
  let body='';
  if(tab==='users') body=`<div class="card"><div class="card-head"><h3>Users</h3><button class="btn btn-primary btn-sm" id="add-user">Add user</button></div><div class="table-wrap"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th>Permissions</th><th></th></tr></thead><tbody>${USERS.map(u=>`<tr class="${u.status==='Inactive'?'dim':''}"><td><div class="row"><span class="avatar" style="background:var(--ink)">${u.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</span><div><div class="strong">${esc(u.name)}</div><div class="small muted">${esc(u.email)}</div></div></div></td><td><select data-role="${u.id}" class="btn btn-outline btn-sm" style="padding:4px 8px">${ROLES.map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select></td><td><span class="badge ${u.status==='Active'?'b-green':'b-gray'}">${u.status}</span></td><td class="small muted">${fmtDT(u.lastLogin)}</td><td class="small">${Object.entries(PERMS[u.role]).filter(([k,v])=>v).map(([k])=>k).join(', ')}</td><td><button class="btn btn-outline btn-sm" data-toggle="${u.id}">${u.status==='Active'?'Deactivate':'Activate'}</button></td></tr>`).join('')}</tbody></table></div></div>`;
  else if(tab==='rules') body=`<div class="grid g-2"><div class="card"><div class="card-head"><h3>Detection & routing thresholds</h3><span class="small muted">Changes apply immediately across claims</span></div><div class="card-body"><div class="form-grid">
      <div class="field"><label>Price tolerance (%)</label><input type="number" id="r-tol" min="0" max="50" step="0.5" value="${RULES.priceTolerancePct}"><span class="hint">RULE-PR-001 flags unit prices above tariff + tolerance</span></div>
      <div class="field"><label>Confidence threshold for validation (%)</label><input type="number" id="r-conf" min="50" max="99" value="${RULES.confidenceThreshold}"><span class="hint">Fields below this route to the work queue</span></div>
      <div class="field"><label>Fuzzy match threshold (%)</label><input type="number" id="r-fuzzy" min="50" max="100" value="${RULES.fuzzyThreshold}"><span class="hint">Description similarity needed when no code match</span></div>
      <div class="field"><label>Max upload size (MB)</label><input type="number" id="r-max" min="1" max="500" value="${RULES.maxFileMB}"><span class="hint">Extendable without redeploy</span></div>
      </div><div class="row mt" style="justify-content:flex-end"><button class="btn btn-outline" id="r-reset">Reset defaults</button><button class="btn btn-primary" id="r-save">Save rules</button></div><div id="r-err" class="small" style="color:var(--red);margin-top:6px"></div></div></div>
      <div class="stack"><div class="card"><div class="card-head"><h3>SLA targets by severity (hours)</h3></div><div class="card-body"><div class="form-grid">${Object.keys(RULES.slaHours).map(k=>`<div class="field"><label>${k}</label><input type="number" min="0.5" step="0.5" data-sla="${k}" value="${RULES.slaHours[k]}"></div>`).join('')}</div></div></div>
      <div class="card"><div class="card-head"><h3>Quantity caps</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Rule</th></tr></thead><tbody>${Object.entries(RULES.qtyCaps).map(([k,v])=>`<tr><td class="id">${k}</td><td>${v.label}</td></tr>`).join('')}</tbody></table></div></div></div></div>`;
  else if(tab==='integrations') body=`<div class="grid g-2">${[['Claim Core','REST · POST /claims/{id}/digitized','Healthy','var(--green)','Idempotent updates; retry with exponential backoff (1s, 2s, 4s); reconciliation job 24h'],['Provider / Contract master','REST · GET /providers, nightly sync','Healthy','var(--green)','5 providers synced 03:10 IST'],['Tariff DB','PostgreSQL · versioned schedules','Healthy','var(--green)','7 versions; effective-date index'],['Document / OCR service','gRPC · table-aware OCR','Degraded','var(--amber)','3× 504 in last hour; circuit half-open; fallback OCR active'],['SFTP ingestion','sftp://ingest.acme.local/claims','Healthy','var(--green)','Polling every 5 min'],['Email ingestion','cashless@acme.com (Graph API)','Healthy','var(--green)','2 mails parsed today'],['Data warehouse','Nightly extract to BI','Healthy','var(--green)','Last load 02:00 IST']].map(([n,d,s,c,x])=>`<div class="card"><div class="card-body"><div class="row" style="justify-content:space-between"><div><div class="strong">${n}</div><div class="small muted">${d}</div></div><span class="badge" style="background:${c}22;color:${c}">${s}</span></div><div class="small mt" style="margin-top:10px">${x}</div><div class="row mt" style="margin-top:10px"><button class="btn btn-outline btn-sm" data-test="${n}">Test connection</button><button class="btn btn-ghost btn-sm" data-cfg="${n}">Configure</button></div></div></div>`).join('')}</div>`;
  else if(tab==='notifications') body=`<div class="card"><div class="card-head"><h3>Templates</h3><span class="small muted">Placeholders resolve at send time; localized variants per channel</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Event</th><th>Channels</th><th>Template</th><th>Enabled</th></tr></thead><tbody>${[['Ingestion success','In-app, Email','{{count}} documents received for {{claimId}} via {{source}}'],['Ingestion failure','In-app, Email, SMS','Ingestion failed for {{fileName}} on {{claimId}}: {{error}}'],['Variance flags raised','In-app','{{count}} variances flagged on {{claimId}} ({{amount}})'],['SLA breach alert','In-app, Email, SMS','{{exceptionId}} on {{claimId}} breached {{priority}} SLA ({{hours}}h)'],['Escalation','In-app, Email','{{claimId}} escalated to {{role}}: {{reason}}']].map(([e,c,t])=>`<tr><td>${e}</td><td class="small">${c}</td><td class="small mono">${esc(t)}</td><td><label class="toggle"><input type="checkbox" checked data-tpl="${e}"></label></td></tr>`).join('')}</tbody></table></div></div>`;
  else if(tab==='logs') body=`<div class="card"><div class="card-head"><h3>System & access logs</h3><span class="small muted">Correlation IDs link API, OCR and workflow events</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Level</th><th>Correlation</th><th>Message</th></tr></thead><tbody>${SYSTEM_LOG.concat(CLAIMS.flatMap(c=>c.audit.filter(a=>a.user!=='system').map(a=>({ts:a.ts,level:'AUDIT',corr:c.id,msg:`${a.user}: ${a.entity} ${a.action} — ${a.detail}`})))).sort((a,b)=>b.ts.localeCompare(a.ts)).slice(0,40).map(l=>`<tr><td class="small mono">${fmtDT(l.ts)}</td><td><span class="badge ${{INFO:'b-blue',WARN:'b-amber',ERROR:'b-red',AUDIT:'b-teal'}[l.level]}">${l.level}</span></td><td class="small mono">${l.corr}</td><td class="small">${esc(l.msg)}</td></tr>`).join('')}</tbody></table></div></div>`;
  el.innerHTML=`<div class="tabs">${tabs.map(([k,l])=>`<a href="#/admin/${k}" class="${tab===k?'active':''}">${l}</a>`).join('')}</div>${body}`;
  if(tab==='users'){
    $('#add-user',el).onclick=()=>openModal({title:'Add user', body:`<div class="stack"><div class="field"><label>Full name</label><input id="nu-name"></div><div class="field"><label>Email</label><input id="nu-email" type="email" placeholder="name@acme.com"></div><div class="field"><label>Role</label><select id="nu-role">${ROLES.map(r=>`<option>${r}</option>`).join('')}</select></div><div class="err" id="nu-err" style="color:var(--red);font-size:12px"></div></div>`, footer:`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="nu-ok">Create user</button>`, onOpen:m=>{ $('#nu-ok',m).onclick=()=>{ const n=$('#nu-name',m).value.trim(), e=$('#nu-email',m).value.trim(); if(n.length<3){ $('#nu-err',m).textContent='Name must be at least 3 characters.'; return; } if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)){ $('#nu-err',m).textContent='Enter a valid email address.'; return; } if(USERS.some(u=>u.email.toLowerCase()===e.toLowerCase())){ $('#nu-err',m).textContent='A user with this email already exists.'; return; } USERS.push({id:uid('U'),name:n,email:e,role:$('#nu-role',m).value,status:'Active',lastLogin:new Date().toISOString()}); closeModal(); toast('User created','ok'); renderUserBox(); render(); }; }});
    $$('[data-role]',el).forEach(s=>s.onchange=()=>{ const u=USERS.find(x=>x.id===s.dataset.role); u.role=s.value; if(u.id===STATE.user.id) renderUserBox(); toast(u.name+' is now '+u.role,'ok'); render(); });
    $$('[data-toggle]',el).forEach(b=>b.onclick=()=>{ const u=USERS.find(x=>x.id===b.dataset.toggle); if(u.id===STATE.user.id){ toast('You cannot deactivate the user you are acting as','warn'); return; } u.status=u.status==='Active'?'Inactive':'Active'; toast(u.name+' '+u.status.toLowerCase(),'ok'); renderUserBox(); render(); });
  }
  if(tab==='rules'){
    $('#r-save',el).onclick=()=>{ const tol=+$('#r-tol',el).value, conf=+$('#r-conf',el).value, fz=+$('#r-fuzzy',el).value, mx=+$('#r-max',el).value; const err=$('#r-err',el); if(!(tol>=0&&tol<=50)) return err.textContent='Price tolerance must be 0–50%.'; if(!(conf>=50&&conf<=99)) return err.textContent='Confidence threshold must be 50–99%.'; if(!(fz>=50&&fz<=100)) return err.textContent='Fuzzy threshold must be 50–100%.'; if(!(mx>=1&&mx<=500)) return err.textContent='Max upload must be 1–500 MB.'; const before=JSON.stringify(RULES); RULES.priceTolerancePct=tol; RULES.confidenceThreshold=conf; RULES.fuzzyThreshold=fz; RULES.maxFileMB=mx; $$('[data-sla]',el).forEach(i=>{ const v=+i.value; if(v>0) RULES.slaHours[i.dataset.sla]=v; }); audit(CLAIMS[0],'Rules','Updated',`tolerance ${tol}%, confidence ${conf}%, fuzzy ${fz}%, max ${mx}MB`,before,JSON.stringify(RULES)); toast('Rules saved — variances and queue recomputed','ok'); render(); };
    $('#r-reset',el).onclick=()=>{ RULES.priceTolerancePct=5; RULES.confidenceThreshold=85; RULES.fuzzyThreshold=78; RULES.maxFileMB=50; RULES.slaHours={Critical:2,High:4,Medium:8,Low:24}; toast('Defaults restored'); render(); };
  }
  if(tab==='integrations'){ $$('[data-test]',el).forEach(b=>b.onclick=async()=>{ b.disabled=true; b.textContent='Testing…'; await sleep(700); b.disabled=false; b.textContent='Test connection'; const n=b.dataset.test; if(n.includes('OCR')) toast(n+': 504 Gateway Timeout on 1 of 3 probes — degraded','warn'); else toast(n+': 200 OK in '+(30+Math.floor(Math.random()*90))+' ms','ok'); }); $$('[data-cfg]',el).forEach(b=>b.onclick=()=>openModal({title:'Configure — '+b.dataset.cfg, body:`<div class="stack"><div class="field"><label>Endpoint</label><input value="https://${b.dataset.cfg.toLowerCase().replace(/[^a-z]+/g,'-')}.acme.local/api/v1"></div><div class="form-grid"><div class="field"><label>Timeout (ms)</label><input type="number" value="5000"></div><div class="field"><label>Retries</label><input type="number" value="3"></div></div><div class="field"><label>Auth</label><select><option>mTLS + OAuth2 client credentials</option><option>API key</option></select></div></div>`, footer:`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="cfg-ok">Save</button>`, onOpen:m=>{ $('#cfg-ok',m).onclick=()=>{ closeModal(); toast('Configuration saved','ok'); }; }})); }
  if(tab==='notifications'){ $$('[data-tpl]',el).forEach(i=>i.onchange=()=>toast(`${i.dataset.tpl} notifications ${i.checked?'enabled':'disabled'}`)); }
}
