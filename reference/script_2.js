
/* ============================================================
   App core: state, router, shell, modals, toasts, notifications
   ============================================================ */
const STATE = { user: USERS[0], route:{path:'intake',parts:[],query:{}}, listFilters:{status:'All',q:''}, queueTab:'mine', queueSort:{key:'priority',dir:1}, adminTab:'users', tariffSel:{provider:'PRV-001',version:'TV-APL-2026',q:''}, reportsRange:7, reviewSel:{} };
const $ = (s,el=document)=>el.querySelector(s); const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const can = p => !!PERMS[STATE.user.role][p];
const userName = id => (USERS.find(u=>u.id===id)||{}).name || (id==='unassigned'?'Unassigned':id||'Unassigned');

/* ---- Toasts ---- */
function toast(msg, kind=''){ const t=document.createElement('div'); t.className='toast '+kind; t.textContent=msg; $('#toasts').appendChild(t); setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);},3200); }

/* ---- Modal ---- */
function openModal({title, body, footer, wide, onOpen}){
  const m=$('#modal'); m.className='modal'+(wide?' wide':'');
  m.innerHTML=`<header><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header><div class="mbody">${body}</div>${footer?`<footer>${footer}</footer>`:''}`;
  $('#modal-bg').classList.add('open'); m.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeModal); if(onOpen) onOpen(m);
  const first=m.querySelector('input,select,textarea,button:not([data-close])'); if(first) first.focus();
}
function closeModal(){ $('#modal-bg').classList.remove('open'); $('#modal').innerHTML=''; }
$('#modal-bg').addEventListener('click',e=>{ if(e.target.id==='modal-bg') closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeModal(); $('#notif-panel').classList.remove('open'); $('#search-results').classList.remove('open'); } });
function confirmModal(title, text, onYes, yesLabel='Confirm', danger=false){
  openModal({title, body:`<p style="font-size:13.5px">${text}</p>`, footer:`<button class="btn btn-outline" data-close>Cancel</button><button class="btn ${danger?'btn-danger':'btn-primary'}" id="m-yes">${esc(yesLabel)}</button>`, onOpen:m=>{ $('#m-yes',m).onclick=()=>{ closeModal(); onYes(); }; }});
}
function promptModal(title, label, onSubmit, {placeholder='',required=true,submitLabel='Save',extra=''}={}){
  openModal({title, body:`${extra}<div class="field"><label>${esc(label)}</label><textarea id="m-text" rows="3" placeholder="${esc(placeholder)}"></textarea><div class="err" id="m-err"></div></div>`, footer:`<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="m-ok">${esc(submitLabel)}</button>`, onOpen:m=>{
    const go=()=>{ const v=$('#m-text',m).value.trim(); if(required&&!v){ $('#m-err',m).textContent='A comment is required for the audit trail.'; return; } closeModal(); onSubmit(v); };
    $('#m-ok',m).onclick=go; $('#m-text',m).addEventListener('keydown',e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) go(); });
  }});
}

/* ---- Audit & notifications ---- */
function audit(c, entity, action, detail, before, after){ c.audit.unshift({id:uid('AUD'), ts:new Date().toISOString(), user:STATE.user.name, entity, action, detail, before, after}); }
function notify(text, kind='ok', link=null){ NOTIFS.unshift({id:uid('N'), ts:new Date().toISOString(), kind, text, read:false, link}); renderNotifs(); }
function renderNotifs(){
  const unread=NOTIFS.filter(n=>!n.read).length; const d=$('#notif-count'); d.style.display=unread?'grid':'none'; d.textContent=unread;
  const col={ok:'var(--green)',warn:'var(--amber)',bad:'var(--red)',info:'var(--blue)'};
  $('#notif-list').innerHTML = NOTIFS.length? NOTIFS.slice(0,12).map(n=>`<li class="${n.read?'':'unread'}" data-id="${n.id}" style="cursor:${n.link?'pointer':'default'}"><span class="notif-ico" style="background:${col[n.kind]||col.info}"></span><div>${esc(n.text)}<div class="t">${fmtDT(n.ts)}</div></div></li>`).join('') : '<li class="empty">No notifications</li>';
  $$('#notif-list li[data-id]').forEach(li=>li.onclick=()=>{ const n=NOTIFS.find(x=>x.id===li.dataset.id); n.read=true; $('#notif-panel').classList.remove('open'); renderNotifs(); if(n.link) location.hash=n.link; });
}
$('#notif-btn').onclick=e=>{ e.stopPropagation(); $('#notif-panel').classList.toggle('open'); $('#search-results').classList.remove('open'); };
$('#notif-clear').onclick=()=>{ NOTIFS.forEach(n=>n.read=true); renderNotifs(); };
document.addEventListener('click',e=>{ if(!e.target.closest('#notif-panel')&&!e.target.closest('#notif-btn')) $('#notif-panel').classList.remove('open'); if(!e.target.closest('.search')) $('#search-results').classList.remove('open'); });

/* ---- Global search ---- */
$('#global-search').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase(); const box=$('#search-results'); if(q.length<2){ box.classList.remove('open'); return; }
  const hits=[];
  CLAIMS.forEach(c=>{ if([c.id,c.patient,c.memberId,c.policy,c.hospital].join(' ').toLowerCase().includes(q)) hits.push({t:c.id+' · '+c.patient, s:c.hospital+' · '+c.status, link:'#/claims/'+c.id}); });
  computeExceptions().forEach(x=>{ if((x.id+' '+x.issue+' '+x.type).toLowerCase().includes(q)) hits.push({t:x.id+' · '+x.type, s:x.claimId+' · '+x.issue, link:x.link}); });
  PROVIDERS.forEach(p=>{ if(p.name.toLowerCase().includes(q)) hits.push({t:p.name, s:'Tariff repository · '+p.versions.length+' version(s)', link:'#/tariffs/'+p.id}); });
  box.innerHTML = hits.length? hits.slice(0,8).map(h=>`<button data-link="${esc(h.link)}">${esc(h.t)}<small>${esc(h.s)}</small></button>`).join('') : '<div class="empty" style="padding:16px">No matches</div>';
  box.classList.add('open'); $$('button[data-link]',box).forEach(b=>b.onclick=()=>{ location.hash=b.dataset.link; box.classList.remove('open'); e.target.value=''; });
});
$('#global-search').addEventListener('keydown',e=>{ if(e.key==='Enter'){ const b=$('#search-results button[data-link]'); if(b) b.click(); } });

/* ---- Router ---- */
const NAV = [
  {group:'Work'},
  {path:'intake', label:'Intake', icon:'<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'},
  {path:'claims', label:'Claims', icon:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'},
  {path:'queue', label:'Work queue', icon:'<path d="M4 6h16M4 12h16M4 18h10"/>', count:()=>computeExceptions().filter(x=>x.sla!=='On track').length, warn:true},
  {group:'Reference'},
  {path:'tariffs', label:'Tariff repository', icon:'<path d="M3 7h18M3 12h18M3 17h18M8 7v10M16 7v10"/>'},
  {path:'reports', label:'Reports', icon:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'},
  {group:'System'},
  {path:'admin', label:'Admin', icon:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'},
];
function parseHash(){
  const h=location.hash.replace(/^#\/?/,''); const [pathPart,qs]=h.split('?'); const parts=pathPart.split('/').filter(Boolean); const query={};
  (qs||'').split('&').filter(Boolean).forEach(kv=>{ const [k,v]=kv.split('='); query[decodeURIComponent(k)]=decodeURIComponent(v||''); });
  return {path:parts[0]||'intake', parts:parts.slice(1), query};
}
function go(h){ location.hash=h; }
function renderNav(){
  $('#nav').innerHTML=NAV.map(n=>n.group?`<div class="nav-group">${n.group}</div>`:`<a href="#/${n.path}" class="${STATE.route.path===n.path?'active':''}"><svg viewBox="0 0 24 24">${n.icon}</svg>${n.label}${n.count?`<span class="n-count ${n.warn&&n.count()?'warn':''}">${n.count()}</span>`:''}</a>`).join('');
  $('#mobile-nav').innerHTML=NAV.filter(n=>n.path).map(n=>`<a href="#/${n.path}" class="${STATE.route.path===n.path?'active':''}">${n.label}</a>`).join('');
}
function setHeader(title, crumbs){ $('#page-title').textContent=title; $('#crumbs').innerHTML=(crumbs||[]).map((c,i)=>(i?'<span>›</span>':'')+(c.href?`<a href="${c.href}">${esc(c.t)}</a>`:`<span>${esc(c.t)}</span>`)).join(''); }

function render(){
  STATE.route=parseHash(); renderNav(); renderNotifs(); const r=STATE.route; const el=$('#content');
  try{
    if(r.path==='intake') viewIntake(el);
    else if(r.path==='claims' && r.parts[0]) { const c=claimById(r.parts[0]); if(!c){ el.innerHTML=`<div class="card"><div class="empty"><strong>Claim not found</strong>${esc(r.parts[0])} does not exist. <a href="#/claims">Back to claims</a></div></div>`; setHeader('Claims',[{t:'Claims',href:'#/claims'}]); } else viewClaim(el,c,r.parts[1]||'overview'); }
    else if(r.path==='claims') viewClaims(el);
    else if(r.path==='queue') viewQueue(el);
    else if(r.path==='tariffs') viewTariffs(el);
    else if(r.path==='reports') viewReports(el);
    else if(r.path==='admin') viewAdmin(el);
    else { location.hash='#/intake'; return; }
  }catch(err){ console.error(err); el.innerHTML=`<div class="callout bad"><div><strong>Something went wrong rendering this page.</strong><br>${esc(err.message)} — <a href="#/intake">go to Intake</a></div></div>`; }
  window.scrollTo({top:0});
}
window.addEventListener('hashchange',render);

/* ---- Role switch (demo) ---- */
function renderUserBox(){
  $('#rail-avatar').textContent=STATE.user.name.split(' ').map(w=>w[0]).join('').slice(0,2); $('#rail-username').textContent=STATE.user.name;
  const s=$('#role-switch'); s.innerHTML=USERS.filter(u=>u.status==='Active').map(u=>`<option value="${u.id}" ${u.id===STATE.user.id?'selected':''}>${esc(u.role)}</option>`).join('');
}
$('#role-switch').onchange=e=>{ STATE.user=USERS.find(u=>u.id===e.target.value); renderUserBox(); toast('Now acting as '+STATE.user.name+' ('+STATE.user.role+')'); render(); };

/* ---- Helpers shared by views ---- */
const statusBadge = s => { const m={'Processing':'b-blue','In review':'b-amber','Variance review':'b-red','Exception':'b-red','Approved':'b-green','Updated in Claim Core':'b-teal','Rejected':'b-gray'}; return `<span class="badge ${m[s]||'b-gray'}">${esc(s)}</span>`; };
const prioBadge = p => `<span class="badge ${{Critical:'b-red',High:'b-red',Medium:'b-amber',Low:'b-blue'}[p]}">${p}</span>`;
const slaBadge = e => { const col=e.sla==='Breached'?'var(--red)':e.sla==='At risk'?'var(--amber)':'var(--green)'; return `<span class="badge ${e.sla==='Breached'?'b-red':e.sla==='At risk'?'b-amber':'b-green'}">${e.sla}</span><span class="sla-bar" title="${Math.round(e.slaPct*100)}% of ${e.slaHours}h SLA"><i style="width:${Math.min(100,Math.round(e.slaPct*100))}%;background:${col}"></i></span>`; };
const confEl = (n,verified) => verified?`<span class="conf ok"><i></i>Verified</span>`:`<span class="conf ${n>=RULES.confidenceThreshold?'hi':n>=70?'md':'lo'}"><i></i>${n}%</span>`;
const STAGES=['Received','Extract','Classify','Structure','Tariff match','Variance','Exceptions','Approve','Claim update'];
function pipelineEl(c){
  const blocked = c.status==='Exception'||c.status==='Variance review'||c.status==='In review';
  return `<div class="pipeline">${STAGES.map((s,i)=>{ let cls=''; if(i<c.stage) cls='done'; else if(i===c.stage) cls=(c.status==='Processing'?'active':blocked?'blocked':'active'); let sub=''; if(cls==='done') sub='Complete'; else if(i===c.stage) sub=c.status==='Processing'?'Running…':blocked?'Needs action':'Ready'; return `<div class="st ${cls}"><div class="n">Stage ${i+1}</div><div class="t">${s}</div><div class="s">${sub}</div></div>`; }).join('')}</div>`;
}
function tableSortHead(cols, sort, onKey){ return '<tr>'+cols.map(c=>`<th class="${c.key?'sortable':''} ${c.cls||''}" data-key="${c.key||''}">${c.label}${sort&&sort.key===c.key?`<span class="arrow">${sort.dir>0?'▲':'▼'}</span>`:''}</th>`).join('')+'</tr>'; }
