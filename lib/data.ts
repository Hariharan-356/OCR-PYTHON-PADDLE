// ClaimsDigi seed data and models
import { User, RuleConfig, Provider, Claim, NotificationItem, SystemLogItem, LineItem, ClaimField, ClaimFacts } from './types';

export const NOW = new Date();
export const hAgo = (h: number) => new Date(NOW.getTime() - h * 3600e3).toISOString();
export const dAgo = (d: number) => hAgo(d * 24);
export const fmtINR = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const fmtDT = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
export const fmtD = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const ago = (iso: string) => {
  const m = Math.max(0, (NOW.getTime() - new Date(iso).getTime()) / 60000);
  if (m < 60) return Math.round(m) + 'm';
  const h = m / 60;
  if (h < 48) return Math.floor(h) + 'h ' + Math.round(m % 60) + 'm';
  return Math.floor(h / 24) + 'd ' + Math.floor(h % 24) + 'h';
};
export const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

let _seq = 1000;
export const uid = (p: string) => p + '-' + (++_seq);

export const USERS = [
  {id:'U1', name:'Rahul Patel',  email:'rahul.patel@acme.com',  role:'Claims Processor', status:'Active',   lastLogin:hAgo(0.2)},
  {id:'U2', name:'Priya Menon',  email:'priya.menon@acme.com',  role:'Claims Processor', status:'Active',   lastLogin:hAgo(1.5)},
  {id:'U3', name:'Amit Kulkarni',email:'amit.kulkarni@acme.com',role:'Team Lead',        status:'Active',   lastLogin:hAgo(4)},
  {id:'U4', name:'Sunita Rao',   email:'sunita.rao@acme.com',   role:'Network Manager',  status:'Active',   lastLogin:hAgo(26)},
  {id:'U5', name:'Vikram Shah',  email:'vikram.shah@acme.com',  role:'Compliance',       status:'Inactive', lastLogin:dAgo(12)},
  {id:'U6', name:'Neha Iyer',    email:'neha.iyer@acme.com',    role:'Admin',            status:'Active',   lastLogin:hAgo(0.5)},
];
export const ROLES = ['Claims Processor','Team Lead','Network Manager','Compliance','Admin'];
export const PERMS = {
  'Claims Processor':{upload:1,review:1,variance:1,queue:1,tariff:0,admin:0,claimUpdate:0,escalate:1,resolveEsc:0},
  'Team Lead':       {upload:1,review:1,variance:1,queue:1,tariff:1,admin:0,claimUpdate:1,escalate:1,resolveEsc:1},
  'Network Manager': {upload:0,review:0,variance:1,queue:1,tariff:1,admin:0,claimUpdate:0,escalate:1,resolveEsc:1},
  'Compliance':      {upload:0,review:1,variance:1,queue:1,tariff:0,admin:0,claimUpdate:0,escalate:1,resolveEsc:1},
  'Admin':           {upload:1,review:1,variance:1,queue:1,tariff:1,admin:1,claimUpdate:1,escalate:1,resolveEsc:1},
};


export const INITIAL_RULES: RuleConfig = {
  priceTolerancePct: 5,
  confidenceThreshold: 85,
  fuzzyThreshold: 78,
  maxFileMB: 50,
  allowedExt: ['pdf','doc','docx','html','xlsx','xls','png','jpg','jpeg','zip','tif','tiff'],
  slaHours: {Critical:2, High:4, Medium:8, Low:24},
  qtyCaps: {'DR-VIS':{perDay:2,label:'2 visits / day'}, 'CONS-01':{perDay:1,label:'1 consultation / day'}, 'RR-GEN':{perAdmission:'LOS',label:'Length of stay'}, 'RR-DLX':{perAdmission:'LOS',label:'Length of stay'}, 'ICU-01':{perAdmission:'ICU',label:'Documented ICU days'}, 'FOOD-01':{perAdmission:'LOS',label:'Length of stay'}},
};
export const RULES: RuleConfig = INITIAL_RULES;


export const ICD = {
  'K35.80':'Unspecified acute appendicitis','K35.2':'Acute appendicitis with generalized peritonitis','I21.4':'Non-ST elevation myocardial infarction','I25.10':'Atherosclerotic heart disease of native coronary artery','A90':'Dengue fever [classical dengue]','A91':'Dengue haemorrhagic fever','M17.11':'Unilateral primary osteoarthritis, right knee','M17.0':'Bilateral primary osteoarthritis of knee','S72.001A':'Fracture of unspecified part of neck of right femur','H25.11':'Age-related nuclear cataract, right eye','E11.9':'Type 2 diabetes mellitus without complications','I10':'Essential (primary) hypertension','J18.9':'Pneumonia, unspecified organism'
};
const PCS = {
  '0DTJ4ZZ':'Resection of appendix, percutaneous endoscopic','02703DZ':'Dilation of coronary artery, one artery, with intraluminal device (stent)','0SRC0J9':'Replacement of right knee joint with synthetic substitute','0QS604Z':'Reposition right upper femur with internal fixation device','08RJ3JZ':'Replacement of right eye lens with synthetic substitute, percutaneous','3E0G76Z':'Introduction of nutritional substance into upper GI, via natural opening'
};


export const T = (code,desc,unit,price,category,opts={}) => Object.assign({code,desc,unit,price,category,medical:true},opts);
const baseTariff = m => [
  T('ADM-01','Registration & admin charges','per admission',500*m,'Admin',{medical:false}),
  T('RR-GEN','Room rent – General ward','per day',2500*m,'Room',{bundle:['NUR-STD']}),
  T('RR-DLX','Room rent – Deluxe Single','per day',6000*m,'Room',{bundle:['NUR-STD']}),
  T('ICU-01','ICU charges','per day',15000*m,'ICU',{bundle:['NUR-STD','MON-01']}),
  T('NUR-STD','Nursing charges','per day',800*m,'Nursing'),
  T('MON-01','Cardiac monitoring','per day',1200*m,'ICU'),
  T('DR-VIS','Doctor visit (in-patient)','per visit',900*m,'Consultation'),
  T('CONS-01','Specialist consultation','per visit',1200*m,'Consultation'),
  T('OT-01','Operation theatre charges','per procedure',18000*m,'Surgery',{bundle:['CONS-GLV','CONS-DRP']}),
  T('SURG-APP','Surgeon fee – Laparoscopic appendectomy','per procedure',35000*m,'Surgery'),
  T('SURG-PTCA','Surgeon fee – PTCA','per procedure',60000*m,'Surgery'),
  T('SURG-TKR','Surgeon fee – Total knee replacement','per procedure',85000*m,'Surgery'),
  T('SURG-ORIF','Surgeon fee – ORIF femur','per procedure',55000*m,'Surgery'),
  T('SURG-CAT','Surgeon fee – Phacoemulsification','per procedure',18000*m,'Surgery'),
  T('ANES-01','Anaesthetist fee','per procedure',12000*m,'Surgery'),
  T('LAB-CBC','Complete blood count (CBC)','per test',450*m,'Laboratory'),
  T('LAB-LFT','Liver function test','per test',900*m,'Laboratory'),
  T('LAB-RBS','Blood sugar (random)','per test',150*m,'Laboratory'),
  T('LAB-NS1','Dengue NS1 antigen','per test',1200*m,'Laboratory'),
  T('LAB-TROP','Troponin I','per test',1800*m,'Laboratory'),
  T('RAD-USG','Ultrasound abdomen','per scan',1800*m,'Radiology'),
  T('RAD-CT','CT abdomen with contrast','per scan',7500*m,'Radiology'),
  T('RAD-XR','X-ray (per view)','per view',600*m,'Radiology'),
  T('RAD-ECHO','2D echocardiography','per scan',3500*m,'Radiology'),
  T('IMP-STENT','Drug-eluting coronary stent','per unit',32000*m,'Implant'),
  T('IMP-IOL','Intraocular lens (foldable)','per unit',9000*m,'Implant'),
  T('CONS-GLV','Surgical gloves','per pair',60*m,'Consumables'),
  T('CONS-DRP','Surgical drapes','per set',450*m,'Consumables'),
  T('CONS-SYR','Syringes & IV sets','per unit',35*m,'Consumables'),
  T('PHY-01','Physiotherapy session','per session',700*m,'Rehab'),
  T('FOOD-01','Patient diet','per day',400*m,'Non-medical',{medical:false}),
  T('AMB-01','Ambulance charges','per trip',2500*m,'Transport',{medical:false}),
  T('PKG-APPX','Laparoscopic appendectomy – package (all inclusive)','per package',115000*m,'Package'),
];
export const PROVIDERS = [
  {id:'PRV-001', name:'Apollo Hospitals, Chennai', city:'Chennai', rohini:'8900080123456', versions:[
    {id:'TV-APL-2025', label:'FY25-26 contract', effectiveFrom:'2025-04-01', effectiveTo:'2026-03-31', items:baseTariff(1), discountNote:'10% discount on pharmacy MRP; consumables inclusive in OT charges.', source:'Apollo_Tariff_FY25.pdf (scanned, 14 pages)', uploaded:dAgo(500)},
    {id:'TV-APL-2026', label:'FY26-27 contract', effectiveFrom:'2026-04-01', effectiveTo:null, items:baseTariff(1.08).map(i=>i.code==='RR-DLX'?Object.assign(i,{price:6500}):i), discountNote:'12% discount on pharmacy MRP; 5% on diagnostics above ₹10,000. Consumables inclusive in OT charges.', source:'Apollo_Tariff_FY26_v2.pdf (scanned, 16 pages, rotated)', uploaded:dAgo(160)},
  ]},
  {id:'PRV-002', name:'Fortis Hospital, Mulund, Mumbai', city:'Mumbai', rohini:'8900080234567', versions:[
    {id:'TV-FOR-2026', label:'CY26 contract', effectiveFrom:'2026-01-01', effectiveTo:'2026-12-31', items:baseTariff(1.15), discountNote:'8% on pharmacy; implants at MRP capped per IRDAI advisory.', source:'Fortis_Mulund_Tariff_2026.xlsx', uploaded:dAgo(260)},
  ]},
  {id:'PRV-003', name:'Max Super Speciality, Saket, Delhi', city:'Delhi', rohini:'8900080345678', versions:[
    {id:'TV-MAX-2026', label:'FY26-27 contract', effectiveFrom:'2026-04-01', effectiveTo:null, items:baseTariff(1.2), discountNote:'15% on pharmacy MRP.', source:'MaxSaket_Tariff_2026.pdf', uploaded:dAgo(170)},
  ]},
  {id:'PRV-004', name:'Medanta – The Medicity, Gurugram', city:'Gurugram', rohini:'8900080456789', versions:[
    {id:'TV-MED-2025', label:'FY25-26 contract (expired)', effectiveFrom:'2025-04-01', effectiveTo:'2026-03-31', items:baseTariff(1.25), discountNote:'10% on pharmacy MRP.', source:'Medanta_Tariff_FY25.pdf', uploaded:dAgo(520)},
    {id:'TV-MED-2026', label:'FY26-27 contract', effectiveFrom:'2026-04-01', effectiveTo:null, items:baseTariff(1.3).filter(i=>!['IMP-STENT'].includes(i.code)), discountNote:'10% on pharmacy MRP; knee implants excluded from schedule (case-to-case approval).', source:'Medanta_Tariff_FY26.pdf', uploaded:dAgo(150)},
  ]},
  {id:'PRV-005', name:'KIMSHEALTH, Thiruvananthapuram', city:'Thiruvananthapuram', rohini:'8900080567890', versions:[
    {id:'TV-KIM-2026', label:'FY26-27 contract', effectiveFrom:'2026-04-01', effectiveTo:null, items:baseTariff(0.85), discountNote:'12% on pharmacy MRP.', source:'KIMS_Tariff_FY26.pdf', uploaded:dAgo(140)},
  ]},
];
export const providerById = id => PROVIDERS.find(p=>p.id===id);
export function activeVersionFor(providerId: string, dateISO: string): any {
  const p = providerById(providerId); if(!p) return null;
  const d = dateISO.slice(0,10);
  const v = p.versions.filter((v: any)=>v.status!=='Draft' && v.effectiveFrom<=d && (!v.effectiveTo || v.effectiveTo>=d));
  return v.sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
}
export function versionStatus(v: any): string { const d=NOW.toISOString().slice(0,10); if(v.status==='Draft') return 'Draft'; if(v.effectiveFrom>d) return 'Upcoming'; if(v.effectiveTo && v.effectiveTo<d) return 'Superseded'; return 'Active'; }


export const DOC_TYPES = ['Pre-Auth Form (Form C)','Claim Form A','Claim Form B','Discharge Summary','Hospital Bill','Pharmacy Bill','Diagnostic Bill','OPD Bill','Implant Bill','Food Bill','Investigation Report','KYC – Identity Proof','KYC – Address Proof','Cancelled Cheque','Hospital Registration Certificate','FIR','Postmortem Report','Unclassified'];
export const NON_MEDICAL_DOCS = ['KYC – Identity Proof','KYC – Address Proof','Cancelled Cheque','FIR','Claim Form A','Claim Form B','Food Bill'];
export const BILL_TYPES = ['Hospital Bill','Pharmacy Bill','Diagnostic Bill','OPD Bill','Implant Bill','Food Bill'];


export const F = (section,label,value,conf,opts={}) => Object.assign({id:uid('FLD'),section,label,value:String(value??''),conf,original:String(value??''),verified:false,history:[]},opts);
export function fieldsFor(docType, f, tweak){ // f = claim facts
  const L = [];
  const c = (base, spread=4) => Math.min(99, Math.max(55, Math.round(base + 5 + (Math.sin(_seq*7.3)*spread))));
  switch(docType){
    case 'Pre-Auth Form (Form C)':
      L.push(F('Hospital details','Name of the hospital',f.hospital,c(96)),F('Hospital details','Hospital location',f.city,c(95)),F('Hospital details','Rohini id',f.rohini,c(90)),F('Hospital details','NHCX id','NHCX-'+f.rohini.slice(-6),c(83)),
        F('Insured / patient','Name of the patient',f.patient,c(94)),F('Insured / patient','Gender',f.gender,c(97)),F('Insured / patient','Age (years)',f.age,c(93)),F('Insured / patient','Date of birth',f.dob,c(88)),F('Insured / patient','Contact number',f.phone,c(86)),F('Insured / patient','Insured id / Member id',f.memberId,c(95)),F('Insured / patient','Policy number',f.policy,c(96)),F('Insured / patient','Name of corporate',f.corporate,c(90)),F('Insured / patient','Occupation',f.occupation,c(80)),F('Insured / patient','Address',f.address,c(78)),
        F('Treating doctor','Name of treating doctor',f.doctor,c(91)),F('Treating doctor','Presenting complaints',f.complaint,c(84)),F('Treating doctor','Duration of present ailment',f.duration,c(82)),F('Treating doctor','Provisional diagnosis',f.diagnosis,c(87)),F('Treating doctor','ICD-10 code',f.icd,c(79)),F('Treating doctor','Proposed line of treatment',f.treatmentLine,c(90)),F('Treating doctor','Surgical treatment (Y/N)',f.surgical?'Yes':'No',c(94)),F('Treating doctor','Name of surgery',f.surgical?f.procedure:'—',c(85)),F('Treating doctor','PCS code',f.surgical?f.pcs:'—',c(76)),
        F('Admission details','Date of admission',f.admission,c(92)),F('Admission details','Emergency / planned',f.emergency?'Emergency':'Planned',c(93)),F('Admission details','Expected length of stay',f.los+' days',c(88)),F('Admission details','Days in ICU',f.icuDays,c(84)),F('Admission details','Room type',f.roomType,c(91)),F('Admission details','Sum total expected cost',fmtINR(f.expectedCost),c(90)),F('Admission details','Past history – chronic illness',f.history,c(77)),
        F('Declarations','Patient signature','Present',98,{detect:'signature'}),F('Declarations','Hospital seal','Present',97,{detect:'stamp'}),F('Declarations','Doctor signature','Present',96,{detect:'signature'}),F('Declarations','Date',f.admission,c(90)));
      break;
    case 'Discharge Summary':
      L.push(F('Hospital','Name of the hospital',f.hospital,c(97)),F('Hospital','Registration no. of hospital',f.hospReg,c(89)),F('Hospital','Complete address',f.hospAddress,c(86)),F('Hospital','Name of treating doctor',f.doctor,c(93)),F('Hospital','Phone no. of doctor',f.doctorPhone,c(84)),
        F('Patient','Claimant name',f.patient,c(96)),F('Patient','Claimant age',f.age,c(94)),F('Stay','Date of admission',f.admission,c(95)),F('Stay','Date of discharge',f.discharge,c(94)),F('Stay','Days in ICU (documented)',f.icuDays,c(90)),
        F('Clinical','Diagnosis',f.diagnosis+(f.secondary?'; '+f.secondary:''),c(90)),F('Clinical','ICD-10 code',f.icd,c(82)),F('Clinical','Type of treatment',f.surgical?'Surgical':'Medical',c(95)),F('Clinical','Name of procedure',f.surgical?f.procedure:'—',c(88)),F('Clinical','PCS code',f.surgical?f.pcs:'—',c(80)),F('Clinical','Date of surgery',f.surgical?f.surgeryDate:'—',c(90)),F('Clinical','Chief complaint',f.complaint,c(88)),F('Clinical','Past medical history',f.history,c(83)),F('Clinical','Course during hospitalization',f.course,c(81)),F('Clinical','Investigation findings',f.investigations,c(85)),F('Clinical','Treatment details',f.treatment,c(84)),F('Clinical','Stamp availability','Yes',97,{detect:'stamp'}));
      break;
    case 'Hospital Bill':
      L.push(F('Biller','Name of biller',f.hospital,c(97)),F('Biller','Address of biller',f.hospAddress,c(88)),F('Biller','Hospital registration number',f.hospReg,c(86)),F('Biller','GST no.',f.gst,c(91)),
        F('Bill header','Bill no.',f.billNo,c(96)),F('Bill header','Bill date',f.discharge,c(95)),F('Bill header','Name of patient',f.patient,c(96)),F('Bill header','Date of admission',f.admission,c(94)),F('Bill header','Date of discharge',f.discharge,c(94)),F('Bill header','Name of treating doctor',f.doctor,c(90)),
        F('Totals','Gross amount',fmtINR(f.gross),c(95)),F('Totals','Discount',fmtINR(f.discount),c(89)),F('Totals','GST amount',fmtINR(f.gstAmt),c(90)),F('Totals','Total amount paid',fmtINR(f.billed),c(96)),F('Totals','Stamp availability','Yes',96,{detect:'stamp'}),F('Totals','Revenue stamp','Yes',88,{detect:'stamp'}),F('Totals','Hospital logo','Detected',95,{detect:'logo'}));
      break;
    case 'Pharmacy Bill':
      L.push(F('Biller','Name of biller',f.hospital+' Pharmacy',c(95)),F('Biller','GST no.',f.gst,c(90)),F('Bill header','Bill no.',f.billNo.replace('HB','PH'),c(94)),F('Bill header','Bill date',f.discharge,c(93)),F('Bill header','Name of patient',f.patient,c(95)),F('Bill header','Name of treating doctor',f.doctor,c(87)),F('Totals','Discount',fmtINR(f.pharmDiscount),c(86)),F('Totals','Total amount paid',fmtINR(f.pharmTotal),c(95)),F('Totals','Stamp availability','Yes',92,{detect:'stamp'}));
      break;
    case 'Diagnostic Bill':
      L.push(F('Biller','Name of biller',f.hospital+' Diagnostics',c(94)),F('Bill header','Bill no.',f.billNo.replace('HB','DG'),c(93)),F('Bill header','Date of sample collection',f.admission,c(90)),F('Bill header','Reporting date',f.admission,c(90)),F('Bill header','Name of patient',f.patient,c(95)),F('Totals','Total amount paid',fmtINR(f.diagTotal||0),c(94)));
      break;
    case 'Investigation Report':
      L.push(F('Lab','Lab name',f.hospital+' Laboratory',c(95)),F('Lab','Lab registration no.','LAB/'+f.hospReg.slice(-5),c(85)),F('Lab','NABL accreditation','MC-'+f.rohini.slice(-4),c(88)),F('Lab','Pathologist name',f.pathologist,c(90)),F('Lab','Registration no. of pathologist','MCI-'+f.rohini.slice(-5),c(80)),F('Sample','Date of sample collection',f.admission,c(93)),F('Sample','Date of report',f.admission,c(93)),F('Sample','Referring doctor',f.doctor,c(91)),F('Patient','Name of patient',f.patient,c(96)),F('Patient','Age of patient',f.age,c(93)),F('Patient','Patient id','UHID-'+f.memberId.slice(-6),c(89)));
      break;
    case 'KYC – Identity Proof':
      L.push(F('Identity proof (insured)','Type of proof submitted',f.kycType,c(98)),F('Identity proof (insured)','Name',f.patient,c(94)),F('Identity proof (insured)','Date of birth',f.dob,c(93)),F('Identity proof (insured)','Id number',f.kycMasked,c(96),{masked:true}),F('Identity proof (insured)','Validity','Lifetime',c(97)));
      break;
    case 'KYC – Address Proof':
      L.push(F('Address proof (insured)','Type of proof submitted','Aadhaar',c(97)),F('Address proof (insured)','Name',f.patient,c(94)),F('Address proof (insured)','Full address',f.address,c(84)),F('Address proof (insured)','Id number',f.kycMasked,c(95),{masked:true}));
      break;
    case 'Cancelled Cheque':
      L.push(F('Bank','Account holder name',f.patient,c(93)),F('Bank','Account number','XXXXXX'+f.memberId.slice(-4),c(90),{masked:true}),F('Bank','Bank name & branch',f.bank,c(91)),F('Bank','IFSC',f.ifsc,c(92)));
      break;
    case 'Claim Form A':
      L.push(F('Primary insured','Policy number',f.policy,c(95)),F('Primary insured','Member id',f.memberId,c(94)),F('Primary insured','Name',f.patient,c(95)),F('Primary insured','Phone number',f.phone,c(88)),F('Primary insured','Email id',f.email,c(86)),F('Hospitalization','Name of hospital',f.hospital,c(94)),F('Hospitalization','City',f.city,c(95)),F('Hospitalization','Date of admission',f.admission,c(92)),F('Hospitalization','Date of discharge',f.discharge,c(92)),F('Claim','Hospitalization expenses',fmtINR(f.billed),c(93)),F('Claim','Pre-hospitalization expenses',fmtINR(f.preHosp||0),c(85)),F('Bank account','PAN',f.pan,c(90),{masked:true}),F('Bank account','Account number','XXXXXX'+f.memberId.slice(-4),c(91),{masked:true}),F('Bank account','IFSC details',f.ifsc,c(92)));
      break;
    case 'Hospital Registration Certificate':
      L.push(F('Certificate','Hospital registration number',f.hospReg,c(92)),F('Certificate','Name of hospital',f.hospital,c(96)),F('Certificate','Address of hospital',f.hospAddress,c(87)),F('Certificate','No. of beds','420',c(90)),F('Certificate','Validity of registration','31-03-2028',c(89)),F('Certificate','Registering authority','State Health Dept.',c(88)),F('Certificate','Stamp availability','Yes',95,{detect:'stamp'}));
      break;
    default:
      L.push(F('Document','Detected title',docType,c(70)),F('Document','Page language','English',c(90)));
  }
  (tweak||[]).forEach(t=>{ const x=L.find(l=>l.label===t.label); if(x){ if(t.conf!=null)x.conf=t.conf; if(t.value!=null){x.value=t.value;x.original=t.value;} } });
  return L;
}

/* ---------- Line items ---------- */
export const LI = (bill: any, desc: any, code: any, qty: any, unit: any, unitPrice: any, opts: any = {}) => Object.assign({id:uid('LN'),bill,desc,code,qty,unit,unitPrice,gross:qty*unitPrice,discount:0,net:qty*unitPrice,date:null,category:opts.category||'',medical:opts.medical!==false,conf:opts.conf||92,batch:opts.batch||'',pnp:opts.pnp||'P'},opts);

/* ---------- Claims ---------- */
export function makeClaim(o){
  const f = o.facts;
  const docs = o.docs.map(d=>{
    const doc = {id:uid('DOC'), name:d.name, type:d.type, source:d.source||o.source, size:d.size||(0.4+Math.random()*3).toFixed(1)+' MB', ext:d.name.split('.').pop().toLowerCase(), uploaded:o.receivedAt, ocrStatus:d.ocrStatus||'Completed', handwritten:!!d.handwritten, language:d.language||'English', pages:[], fields:[], detections:d.detections||[], medical:!NON_MEDICAL_DOCS.includes(d.type), validated:false};
    const n = d.pages||1;
    for(let i=1;i<=n;i++) doc.pages.push({n:i, cls:d.type, conf:Math.min(99, 93+Math.round(Math.random()*6)), label:d.type+(n>1?' '+i:'')});
    doc.fields = fieldsFor(d.type, f, d.tweak);
    if(d.handwritten) doc.fields.forEach(x=>{ if(!x.detect) x.conf=Math.max(58,x.conf-2); });
    // Claims that have already cleared the review stage carry validated documents (100% audited per BRD)
    if(!['Processing','In review'].includes(o.status)){ doc.validated=true; doc.fields.forEach(x=>{ if(x.conf<RULES.confidenceThreshold){ x.verified=true; x.history.push({ts:o.receivedAt,user:o.reviewer||'Rahul Patel',action:'Confirmed'}); } else x.verified=true; }); }
    return doc;
  });
  const claim = {
    id:o.id, patient:f.patient, memberId:f.memberId, policy:f.policy, providerId:o.providerId, hospital:f.hospital, city:f.city,
    admission:f.admission, discharge:f.discharge, admissionISO:f.admissionISO, source:o.source, receivedAt:o.receivedAt, status:o.status, stage:o.stage,
    lob:o.lob||'Group Health', claimType:o.claimType||'Cashless', billed:f.billed, docs, facts:f,
    diagnoses:o.diagnoses, procedures:o.procedures, icpSummary:o.icpSummary, lineItems:o.lineItems,
    tariffVersionId:null, tariffOverride:false, matchOverrides:{}, decisions:{}, escalations:o.escalations||[], audit:[], notes:[],
    claimCore:o.claimCore||{status:'Not pushed', attempts:0, history:[], idempotencyKey:null}, assignee:o.assignee||null, ocrFallback:o.ocrFallback||null,
  };
  claim.audit.push({id:uid('AUD'), ts:o.receivedAt, user:'system', entity:'Document', action:'Ingested', detail:docs.length+' file(s) received via '+o.source});
  (o.audit||[]).forEach(a=>claim.audit.push(Object.assign({id:uid('AUD')},a)));
  return claim;
}

export const CLAIMS: Claim[] = [];
CLAIMS.push(makeClaim({
  id:'CLM-2026-01047', providerId:'PRV-001', source:'IHX', receivedAt:hAgo(3.2), status:'Variance review', stage:5, assignee:'U1',
  facts:{patient:'Rajesh Kumar', gender:'Male', age:41, dob:'15-03-1985', phone:'98400 12345', memberId:'MEM-7841203', policy:'GHP-2026-0044817', corporate:'Infomatrix Solutions Pvt Ltd', occupation:'Software engineer', address:'12, Anna Nagar West, Chennai 600040', hospital:'Apollo Hospitals, Chennai', city:'Chennai', rohini:'8900080123456', hospReg:'TN/CHN/2011/04521', hospAddress:'21 Greams Lane, Off Greams Road, Chennai 600006', gst:'33AAACA1234A1Z5', doctor:'Dr. S. Venkatesh', doctorPhone:'98410 22110', pathologist:'Dr. M. Radhika', complaint:'Right lower abdominal pain, fever, vomiting since 2 days', duration:'2 days', diagnosis:'Acute appendicitis', secondary:'Type 2 diabetes mellitus', icd:'K35.80', treatmentLine:'Surgical management', surgical:true, procedure:'Laparoscopic appendectomy', pcs:'0DTJ4ZZ', surgeryDate:'17-09-2026', admission:'16-09-2026', admissionISO:'2026-09-16', discharge:'21-09-2026', los:5, icuDays:3, roomType:'Deluxe single', emergency:true, expectedCost:135000, history:'Diabetes since 2019', course:'Admitted with acute abdomen. USG confirmed inflamed appendix. Underwent laparoscopic appendectomy on 17-09-2026 under GA. Post-op ICU observation 3 days for glycaemic control. Uneventful recovery.', investigations:'CBC: TLC 14,200; USG abdomen: inflamed appendix 9 mm; RBS 212 mg/dL', treatment:'IV antibiotics, insulin sliding scale, analgesics; laparoscopic appendectomy', billNo:'HB/2026/118204', gross:151000, discount:6000, gstAmt:0, billed:145000, pharmDiscount:1180, pharmTotal:10620, kycType:'Aadhaar', kycMasked:'XXXX XXXX 4471', bank:'HDFC Bank, Anna Nagar', ifsc:'HDFC0000452', email:'rajesh.k@example.com', pan:'ABCPK1234X'},
  docs:[
    {name:'FormC_PreAuth_RajeshKumar.pdf', type:'Pre-Auth Form (Form C)', pages:3, handwritten:true, size:'2.4 MB', detections:['stamp','signature'], tweak:[{label:'ICD-10 code',conf:72},{label:'PCS code',conf:68},{label:'Address',conf:74},{label:'Past history – chronic illness',conf:69}]},
    {name:'Discharge_Summary.pdf', type:'Discharge Summary', pages:2, size:'1.1 MB', detections:['stamp','signature'], tweak:[{label:'ICD-10 code',conf:81}]},
    {name:'Hospital_Final_Bill.pdf', type:'Hospital Bill', pages:2, size:'0.9 MB', detections:['stamp','logo']},
    {name:'Pharmacy_Bill.jpg', type:'Pharmacy Bill', pages:1, size:'3.8 MB', detections:['stamp'], tweak:[{label:'Discount',conf:79}]},
    {name:'Lab_Reports.pdf', type:'Investigation Report', pages:2, size:'0.6 MB'},
    {name:'Aadhaar_Card.png', type:'KYC – Identity Proof', pages:1, size:'1.7 MB'},
    {name:'Cancelled_Cheque.jpg', type:'Cancelled Cheque', pages:1, size:'0.8 MB'},
  ],
  diagnoses:[{text:'Acute appendicitis', icd:'K35.80', conf:0.91, primary:true, alt:['K35.2']},{text:'Type 2 diabetes mellitus (known case)', icd:'E11.9', conf:0.95, primary:false}],
  procedures:[{text:'Laparoscopic appendectomy', pcs:'0DTJ4ZZ', conf:0.93, primary:true}],
  icpSummary:'41M, T2DM, presented with acute abdomen; USG-confirmed appendicitis. Laparoscopic appendectomy on 17-Sep under GA. 3 ICU days for glycaemic control; discharged stable on day 5.',
  lineItems:[
    LI('Hospital Bill','Registration charges','ADM-01',1,'per admission',500,{category:'Admin',medical:false,date:'16-09-2026'}),
    LI('Hospital Bill','Room rent – Deluxe Single (16/09–20/09)','RR-DLX',5,'per day',8500,{category:'Room',date:'16-09-2026'}),
    LI('Hospital Bill','Nursing charges','NUR-STD',5,'per day',800,{category:'Nursing',date:'16-09-2026'}),
    LI('Hospital Bill','ICU charges','ICU-01',5,'per day',15000,{category:'ICU',date:'17-09-2026'}),
    LI('Hospital Bill','Doctor visit – Dr Venkatesh','DR-VIS',8,'per visit',900,{category:'Consultation',date:'16-09-2026'}),
    LI('Hospital Bill','OT charges','OT-01',1,'per procedure',18000,{category:'Surgery',date:'17-09-2026'}),
    LI('Hospital Bill','Surgeon fees – Lap. appendectomy','SURG-APP',1,'per procedure',35000,{category:'Surgery',date:'17-09-2026'}),
    LI('Hospital Bill','Anaesthesia charges','ANES-01',1,'per procedure',12000,{category:'Surgery',date:'17-09-2026'}),
    LI('Hospital Bill','Robotic assistance charge',null,1,'per procedure',9500,{category:'Surgery',date:'17-09-2026',conf:88}),
    LI('Hospital Bill','Surgical gloves (sterile)','CONS-GLV',12,'per pair',60,{category:'Consumables',date:'17-09-2026'}),
    LI('Hospital Bill','CBC','LAB-CBC',1,'per test',600,{category:'Laboratory',date:'16-09-2026'}),
    LI('Hospital Bill','Complete Blood Count','LAB-CBC',1,'per test',600,{category:'Laboratory',date:'16-09-2026',conf:90}),
    LI('Hospital Bill','USG whole abdomen','RAD-USG',1,'per scan',1800,{category:'Radiology',date:'16-09-2026'}),
    LI('Hospital Bill','Blood sugar random','LAB-RBS',6,'per test',150,{category:'Laboratory',date:'16-09-2026'}),
    LI('Hospital Bill','Patient diet','FOOD-01',5,'per day',400,{category:'Non-medical',medical:false,date:'16-09-2026'}),
    LI('Pharmacy Bill','Inj. Ceftriaxone 1g','PH-CEF',10,'vial',180,{category:'Pharmacy',batch:'B2211/03-2027',date:'16-09-2026'}),
    LI('Pharmacy Bill','Inj. Pantoprazole 40mg','PH-PAN',6,'vial',95,{category:'Pharmacy',batch:'P8891/11-2027',date:'16-09-2026'}),
    LI('Pharmacy Bill','Insulin regular 40 IU','PH-INS',3,'vial',290,{category:'Pharmacy',batch:'IN4410/06-2027',date:'16-09-2026'}),
    LI('Pharmacy Bill','Tab. Paracetamol 650','PH-PCM',20,'tab',4,{category:'Pharmacy',batch:'PC101/02-2028',date:'18-09-2026'}),
    LI('Pharmacy Bill','Syringe 5ml disposable','CONS-SYR',40,'unit',12,{category:'Consumables',date:'16-09-2026'}),
    LI('Pharmacy Bill','Attendant meal','FOOD-01',5,'per day',300,{category:'Non-medical',medical:false,pnp:'NP',date:'16-09-2026'}),
    LI('Pharmacy Bill','Toiletries kit',null,1,'unit',350,{category:'Non-medical',medical:false,pnp:'NP',date:'16-09-2026'}),
  ],
  audit:[{ts:hAgo(3.1),user:'system',entity:'Document',action:'Classified',detail:'7 documents, 12 pages classified (avg 96%)'},{ts:hAgo(3.0),user:'system',entity:'Extraction',action:'Completed',detail:'162 fields extracted; 6 below threshold'},{ts:hAgo(2.9),user:'system',entity:'Tariff',action:'Matched',detail:'Version TV-APL-2026 selected by admission date 16-09-2026'}],
}));

CLAIMS.push(makeClaim({
  id:'CLM-2026-01046', providerId:'PRV-002', source:'IHX', receivedAt:hAgo(6.5), status:'In review', stage:3, assignee:'U2',
  facts:{patient:'Priya Sharma', gender:'Female', age:58, dob:'02-11-1967', phone:'98200 77812', memberId:'MEM-6620991', policy:'GHP-2026-0031122', corporate:'Meridian Retail Ltd', occupation:'Homemaker', address:'B-704, Lake Homes, Powai, Mumbai 400076', hospital:'Fortis Hospital, Mulund, Mumbai', city:'Mumbai', rohini:'8900080234567', hospReg:'MH/MUM/2008/11209', hospAddress:'Mulund Goregaon Link Rd, Mulund West, Mumbai 400078', gst:'27AABCF5678B1Z2', doctor:'Dr. A. Deshpande', doctorPhone:'98210 41190', pathologist:'Dr. K. Joshi', complaint:'Chest pain radiating to left arm, sweating', duration:'6 hours', diagnosis:'NSTEMI', secondary:'Hypertension', icd:'I21.4', treatmentLine:'Intensive care + surgical', surgical:true, procedure:'PTCA with single DES', pcs:'02703DZ', surgeryDate:'19-09-2026', admission:'18-09-2026', admissionISO:'2026-09-18', discharge:'22-09-2026', los:4, icuDays:2, roomType:'Twin sharing', emergency:true, expectedCost:245000, history:'Hypertension since 2015', course:'Emergency admission with NSTEMI. Angiography showed 90% LAD lesion; PTCA with DES to LAD on 19-09. CCU 2 days; shifted to ward; discharged on DAPT.', investigations:'Troponin I 2.4 ng/mL; ECG ST depression V4–V6; Echo EF 48%', treatment:'Heparin, DAPT, statin; PTCA with DES', billNo:'HB/2026/220981', gross:238400, discount:7900, gstAmt:0, billed:230500, pharmDiscount:2200, pharmTotal:18400, kycType:'PAN', kycMasked:'XXXXX1234X', bank:'ICICI Bank, Powai', ifsc:'ICIC0000114', email:'priya.s@example.com', pan:'ABCPS9876K'},
  docs:[
    {name:'PreAuth_FormC.pdf', type:'Pre-Auth Form (Form C)', pages:3, handwritten:true, size:'3.1 MB', detections:['stamp','signature'], tweak:[{label:'PCS code',conf:66,value:'0270 3DZ'},{label:'Contact number',conf:71},{label:'Date of birth',conf:73,value:'02-11-1961'},{label:'Sum total expected cost',conf:70}]},
    {name:'Discharge_Summary.pdf', type:'Discharge Summary', pages:3, size:'1.4 MB', detections:['stamp','signature'], tweak:[{label:'Name of procedure',conf:68,value:'PTCA with sing1e DES'},{label:'Phone no. of doctor',conf:74}]},
    {name:'Final_Bill.pdf', type:'Hospital Bill', pages:3, size:'1.2 MB', detections:['stamp','logo']},
    {name:'Implant_Invoice_Stent.pdf', type:'Implant Bill', pages:1, size:'0.3 MB', detections:['stamp']},
    {name:'Cath_Lab_Report.pdf', type:'Investigation Report', pages:2, size:'0.7 MB'},
    {name:'PAN_Card.jpg', type:'KYC – Identity Proof', pages:1, size:'0.9 MB'},
  ],
  diagnoses:[{text:'NSTEMI (non-ST elevation myocardial infarction)', icd:'I21.4', conf:0.9, primary:true},{text:'Essential hypertension', icd:'I10', conf:0.96, primary:false},{text:'Single vessel coronary artery disease', icd:'I25.10', conf:0.88, primary:false}],
  procedures:[{text:'PTCA with drug-eluting stent to LAD', pcs:'02703DZ', conf:0.86, primary:true},{text:'Coronary angiography', pcs:'B2111ZZ', conf:0.8, primary:false}],
  icpSummary:'58F, hypertensive, emergency admission with NSTEMI. Single-vessel CAD (LAD 90%). PTCA + 1 DES on 19-Sep. CCU 2 days, discharged day 4 on DAPT.',
  lineItems:[
    LI('Hospital Bill','Registration','ADM-01',1,'per admission',575,{category:'Admin',medical:false,date:'18-09-2026'}),
    LI('Hospital Bill','Room rent – twin sharing','RR-GEN',2,'per day',2875,{category:'Room',date:'20-09-2026'}),
    LI('Hospital Bill','CCU charges','ICU-01',2,'per day',17250,{category:'ICU',date:'18-09-2026'}),
    LI('Hospital Bill','Cardiac monitoring','MON-01',2,'per day',1380,{category:'ICU',date:'18-09-2026'}),
    LI('Hospital Bill','Consultant visits – cardiology','DR-VIS',12,'per visit',1035,{category:'Consultation',date:'18-09-2026'}),
    LI('Hospital Bill','Cath lab charges','OT-01',1,'per procedure',20700,{category:'Surgery',date:'19-09-2026'}),
    LI('Hospital Bill','Interventional cardiologist fee','SURG-PTCA',1,'per procedure',69000,{category:'Surgery',date:'19-09-2026'}),
    LI('Hospital Bill','Troponin I','LAB-TROP',2,'per test',2070,{category:'Laboratory',date:'18-09-2026'}),
    LI('Hospital Bill','2D Echo','RAD-ECHO',1,'per scan',4025,{category:'Radiology',date:'18-09-2026'}),
    LI('Hospital Bill','Patient diet','FOOD-01',4,'per day',460,{category:'Non-medical',medical:false,date:'18-09-2026'}),
    LI('Implant Bill','Drug eluting stent 3.0×28 mm (Xience)','IMP-STENT',1,'per unit',48500,{category:'Implant',batch:'STK-99128/2029',date:'19-09-2026',sticker:'XN-3028-77120'}),
    LI('Pharmacy Bill','Inj. Heparin 5000 IU','PH-HEP',8,'vial',110,{category:'Pharmacy',batch:'H5511/08-2027'}),
    LI('Pharmacy Bill','Tab. Ticagrelor 90mg','PH-TIC',14,'tab',48,{category:'Pharmacy',batch:'TG201/01-2028'}),
    LI('Pharmacy Bill','Tab. Atorvastatin 80mg','PH-ATV',10,'tab',22,{category:'Pharmacy',batch:'AT881/05-2028'}),
  ],
  audit:[{ts:hAgo(6.3),user:'system',entity:'Document',action:'Classified',detail:'6 documents, 13 pages classified'},{ts:hAgo(6.2),user:'system',entity:'Extraction',action:'Completed',detail:'7 fields below confidence threshold routed for validation'}],
}));

CLAIMS.push(makeClaim({
  id:'CLM-2026-01045', providerId:'PRV-003', source:'ClaimBook', receivedAt:hAgo(28), status:'Approved', stage:7, assignee:'U1',
  facts:{patient:'Amit Verma', gender:'Male', age:34, dob:'21-07-1992', phone:'98110 33421', memberId:'MEM-5519320', policy:'GHP-2026-0020451', corporate:'Northline Logistics', occupation:'Operations manager', address:'C-14, Saket, New Delhi 110017', hospital:'Max Super Speciality, Saket, Delhi', city:'Delhi', rohini:'8900080345678', hospReg:'DL/SKT/2006/03310', hospAddress:'1, Press Enclave Road, Saket, New Delhi 110017', gst:'07AAACM4321C1Z9', doctor:'Dr. R. Malhotra', doctorPhone:'98100 55210', pathologist:'Dr. P. Sethi', complaint:'High grade fever, body ache, rash', duration:'4 days', diagnosis:'Dengue fever', secondary:'', icd:'A90', treatmentLine:'Medical management', surgical:false, procedure:'', pcs:'', surgeryDate:'', admission:'14-09-2026', admissionISO:'2026-09-14', discharge:'18-09-2026', los:4, icuDays:0, roomType:'General ward', emergency:false, expectedCost:60000, history:'None', course:'Admitted with dengue fever, platelet nadir 42,000 on day 2; managed with IV fluids and monitoring; platelets recovered; discharged stable.', investigations:'NS1 positive; Platelets 42,000 → 1,10,000', treatment:'IV fluids, paracetamol, monitoring', billNo:'HB/2026/330122', gross:62200, discount:3000, gstAmt:0, billed:59200, pharmDiscount:900, pharmTotal:5100, kycType:'Aadhaar', kycMasked:'XXXX XXXX 9012', bank:'SBI, Saket', ifsc:'SBIN0001187', email:'amit.v@example.com', pan:'ABCPV5555L'},
  docs:[
    {name:'ClaimFormA.pdf', type:'Claim Form A', pages:2, size:'0.8 MB'},
    {name:'Discharge_Summary.pdf', type:'Discharge Summary', pages:1, size:'0.5 MB', detections:['stamp','signature']},
    {name:'Bill_Final.pdf', type:'Hospital Bill', pages:2, size:'0.7 MB', detections:['stamp','logo']},
    {name:'Pharmacy_Bills.zip', type:'Pharmacy Bill', pages:3, size:'2.2 MB', detections:['stamp']},
    {name:'Lab_NS1_CBC.pdf', type:'Investigation Report', pages:2, size:'0.4 MB'},
    {name:'Aadhaar.jpg', type:'KYC – Address Proof', pages:1, size:'1.3 MB'},
  ],
  diagnoses:[{text:'Dengue fever', icd:'A90', conf:0.97, primary:true}],
  procedures:[],
  icpSummary:'34M, dengue fever with thrombocytopenia (nadir 42k). Conservative management 4 days; recovered; no ICU.',
  lineItems:[
    LI('Hospital Bill','Registration','ADM-01',1,'per admission',600,{category:'Admin',medical:false,date:'14-09-2026'}),
    LI('Hospital Bill','Room rent – general ward','RR-GEN',4,'per day',3200,{category:'Room',date:'14-09-2026'}),
    LI('Hospital Bill','Doctor visits','DR-VIS',6,'per visit',1080,{category:'Consultation',date:'14-09-2026'}),
    LI('Hospital Bill','CBC (daily)','LAB-CBC',5,'per test',540,{category:'Laboratory',date:'14-09-2026'}),
    LI('Hospital Bill','Dengue NS1','LAB-NS1',1,'per test',1440,{category:'Laboratory',date:'14-09-2026'}),
    LI('Hospital Bill','LFT','LAB-LFT',1,'per test',1080,{category:'Laboratory',date:'15-09-2026'}),
    LI('Hospital Bill','IV sets & cannula','CONS-SYR',15,'unit',42,{category:'Consumables',date:'14-09-2026'}),
    LI('Hospital Bill','Patient diet','FOOD-01',4,'per day',480,{category:'Non-medical',medical:false,date:'14-09-2026'}),
    LI('Pharmacy Bill','IV NS 500ml','PH-NS',12,'bottle',45,{category:'Pharmacy',batch:'NS330/10-2027'}),
    LI('Pharmacy Bill','Tab Paracetamol 650','PH-PCM',16,'tab',4,{category:'Pharmacy',batch:'PC101/02-2028'}),
  ],
  audit:[{ts:hAgo(27),user:'system',entity:'Extraction',action:'Completed',detail:'All fields above threshold'},{ts:hAgo(26),user:'Rahul Patel',entity:'Variance',action:'Accepted',detail:'Room rent price variance accepted as deduction'},{ts:hAgo(25.5),user:'Amit Kulkarni',entity:'Claim',action:'Approved',detail:'Claim approved for update to Claim Core'}],
  claimCore:{status:'Not pushed',attempts:0,history:[],idempotencyKey:null},
}));

CLAIMS.push(makeClaim({
  id:'CLM-2026-01044', providerId:'PRV-004', source:'Email', receivedAt:hAgo(31), status:'Exception', stage:6, assignee:'U4',
  facts:{patient:'Sunita Devi', gender:'Female', age:66, dob:'09-01-1960', phone:'98180 20117', memberId:'MEM-4408122', policy:'IHP-2026-0110932', corporate:'—', occupation:'Retired', address:'H-22, Sushant Lok, Gurugram 122009', hospital:'Medanta – The Medicity, Gurugram', city:'Gurugram', rohini:'8900080456789', hospReg:'HR/GGN/2009/00871', hospAddress:'CH Baktawar Singh Rd, Sector 38, Gurugram 122001', gst:'06AABCM7788D1Z4', doctor:'Dr. N. Bhatia', doctorPhone:'98111 90021', pathologist:'Dr. S. Arora', complaint:'Right knee pain, restricted mobility', duration:'3 years', diagnosis:'Primary osteoarthritis right knee', secondary:'Hypertension', icd:'M17.11', treatmentLine:'Surgical management', surgical:true, procedure:'Total knee replacement (right)', pcs:'0SRC0J9', surgeryDate:'12-09-2026', admission:'11-09-2026', admissionISO:'2026-09-11', discharge:'17-09-2026', los:6, icuDays:1, roomType:'Deluxe single', emergency:false, expectedCost:320000, history:'Hypertension since 2010', course:'Planned admission for right TKR. Surgery on 12-09 under spinal anaesthesia; 1 day ICU; physiotherapy from POD1; discharged ambulating with walker.', investigations:'X-ray knee: grade 4 OA; Pre-op labs normal', treatment:'Right TKR with cemented implant; physiotherapy', billNo:'HB/2026/440877', gross:322000, discount:10000, gstAmt:0, billed:312000, pharmDiscount:1500, pharmTotal:14000, kycType:'Aadhaar', kycMasked:'XXXX XXXX 3310', bank:'Axis Bank, Gurugram', ifsc:'UTIB0000210', email:'sunita.d@example.com', pan:'ABCPD3210M'},
  docs:[
    {name:'Claim_Form_A_B.pdf', type:'Claim Form A', pages:4, size:'1.6 MB'},
    {name:'Discharge_Summary_TKR.pdf', type:'Discharge Summary', pages:2, size:'0.9 MB', detections:['stamp','signature']},
    {name:'Final_Bill.pdf', type:'Hospital Bill', pages:3, size:'1.1 MB', detections:['stamp','logo']},
    {name:'Implant_Invoice.pdf', type:'Implant Bill', pages:1, size:'0.3 MB', detections:['stamp']},
    {name:'XRay_Report.pdf', type:'Investigation Report', pages:1, size:'0.3 MB'},
    {name:'Hospital_Reg_Cert.pdf', type:'Hospital Registration Certificate', pages:1, size:'0.5 MB', detections:['stamp']},
  ],
  diagnoses:[{text:'Primary osteoarthritis, right knee', icd:'M17.11', conf:0.94, primary:true},{text:'Essential hypertension', icd:'I10', conf:0.95, primary:false}],
  procedures:[{text:'Total knee replacement, right (cemented)', pcs:'0SRC0J9', conf:0.92, primary:true}],
  icpSummary:'66F, grade 4 OA right knee. Elective right TKR 12-Sep, cemented implant. 1 ICU day; physio from POD1; discharged day 6 mobilising.',
  lineItems:[
    LI('Hospital Bill','Registration','ADM-01',1,'per admission',650,{category:'Admin',medical:false,date:'11-09-2026'}),
    LI('Hospital Bill','Room rent – deluxe','RR-DLX',5,'per day',7800,{category:'Room',date:'11-09-2026'}),
    LI('Hospital Bill','ICU','ICU-01',1,'per day',19500,{category:'ICU',date:'12-09-2026'}),
    LI('Hospital Bill','Doctor visits','DR-VIS',10,'per visit',1170,{category:'Consultation',date:'11-09-2026'}),
    LI('Hospital Bill','OT charges','OT-01',1,'per procedure',23400,{category:'Surgery',date:'12-09-2026'}),
    LI('Hospital Bill','Surgeon fee – TKR','SURG-TKR',1,'per procedure',110500,{category:'Surgery',date:'12-09-2026'}),
    LI('Hospital Bill','Anaesthesia','ANES-01',1,'per procedure',15600,{category:'Surgery',date:'12-09-2026'}),
    LI('Hospital Bill','Physiotherapy','PHY-01',6,'per session',910,{category:'Rehab',date:'12-09-2026'}),
    LI('Hospital Bill','X-ray knee (2 views)','RAD-XR',2,'per view',780,{category:'Radiology',date:'11-09-2026'}),
    LI('Hospital Bill','Patient diet','FOOD-01',6,'per day',520,{category:'Non-medical',medical:false,date:'11-09-2026'}),
    LI('Implant Bill','Cemented TKR implant (Attune)',null,1,'per unit',118000,{category:'Implant',batch:'TK-8817/2030',date:'12-09-2026',sticker:'AT-CR-55120',conf:91}),
    LI('Pharmacy Bill','Inj. Enoxaparin 40mg','PH-ENX',6,'syringe',420,{category:'Pharmacy',batch:'EN702/09-2027'}),
    LI('Pharmacy Bill','Tab. Etoricoxib 90','PH-ETX',10,'tab',18,{category:'Pharmacy',batch:'ET310/04-2028'}),
  ],
  escalations:[{id:'ESC-1', ts:hAgo(29), by:'Rahul Patel', to:'Network Manager', reason:'Knee implant not in Medanta FY26 schedule – needs network approval of case-to-case rate', status:'Open', ref:'Cemented TKR implant (Attune)'}],
  audit:[{ts:hAgo(30),user:'system',entity:'Variance',action:'Flagged',detail:'Uncontracted implant ₹1,18,000 (RULE-UC-001)'},{ts:hAgo(29),user:'Rahul Patel',entity:'Exception',action:'Escalated',detail:'Escalated to Network Manager: uncontracted implant'}],
}));

CLAIMS.push(makeClaim({
  id:'CLM-2026-01043', providerId:'PRV-001', source:'IHX', receivedAt:hAgo(52), status:'Updated in Claim Core', stage:8, assignee:'U2',
  facts:{patient:'Mohammed Farooq', gender:'Male', age:29, dob:'30-05-1997', phone:'98400 88190', memberId:'MEM-8810377', policy:'GHP-2026-0044817', corporate:'Infomatrix Solutions Pvt Ltd', occupation:'Analyst', address:'4/12 T Nagar, Chennai 600017', hospital:'Apollo Hospitals, Chennai', city:'Chennai', rohini:'8900080123456', hospReg:'TN/CHN/2011/04521', hospAddress:'21 Greams Lane, Off Greams Road, Chennai 600006', gst:'33AAACA1234A1Z5', doctor:'Dr. K. Sundar', doctorPhone:'98410 10022', pathologist:'Dr. M. Radhika', complaint:'Pain and deformity right hip after two-wheeler accident', duration:'1 day', diagnosis:'Fracture neck of femur, right', secondary:'', icd:'S72.001A', treatmentLine:'Surgical management', surgical:true, procedure:'ORIF right femur', pcs:'0QS604Z', surgeryDate:'10-09-2026', admission:'09-09-2026', admissionISO:'2026-09-09', discharge:'15-09-2026', los:6, icuDays:1, roomType:'General ward', emergency:true, expectedCost:180000, history:'None', course:'RTA on 09-09; FIR lodged. ORIF right femur 10-09. 1 day ICU. Physiotherapy; discharged non-weight bearing.', investigations:'X-ray: displaced fracture neck of femur; CT pelvis', treatment:'ORIF with cannulated screws; analgesics; LMWH', billNo:'HB/2026/117620', gross:176000, discount:4000, gstAmt:0, billed:172000, pharmDiscount:1000, pharmTotal:9800, kycType:'Aadhaar', kycMasked:'XXXX XXXX 2201', bank:'HDFC Bank, T Nagar', ifsc:'HDFC0000301', email:'farooq.m@example.com', pan:'ABCPF1122Q'},
  docs:[
    {name:'FormC.pdf', type:'Pre-Auth Form (Form C)', pages:3, handwritten:true, size:'2.8 MB', detections:['stamp','signature']},
    {name:'Discharge_Summary.pdf', type:'Discharge Summary', pages:2, size:'0.8 MB', detections:['stamp','signature']},
    {name:'Final_Bill.pdf', type:'Hospital Bill', pages:2, size:'0.9 MB', detections:['stamp','logo']},
    {name:'FIR_Copy.pdf', type:'FIR', pages:2, size:'1.0 MB', detections:['stamp']},
    {name:'XRay_CT_Reports.pdf', type:'Investigation Report', pages:2, size:'0.6 MB'},
  ],
  diagnoses:[{text:'Fracture of neck of right femur', icd:'S72.001A', conf:0.95, primary:true}],
  procedures:[{text:'ORIF right femur with cannulated screws', pcs:'0QS604Z', conf:0.9, primary:true}],
  icpSummary:'29M, RTA (FIR available). Displaced NOF fracture right; ORIF 10-Sep; 1 ICU day; discharged day 6.',
  lineItems:[
    LI('Hospital Bill','Registration','ADM-01',1,'per admission',540,{category:'Admin',medical:false,date:'09-09-2026'}),
    LI('Hospital Bill','Room rent – general ward','RR-GEN',5,'per day',2700,{category:'Room',date:'09-09-2026'}),
    LI('Hospital Bill','ICU','ICU-01',1,'per day',16200,{category:'ICU',date:'10-09-2026'}),
    LI('Hospital Bill','Doctor visits','DR-VIS',9,'per visit',972,{category:'Consultation',date:'09-09-2026'}),
    LI('Hospital Bill','OT charges','OT-01',1,'per procedure',19440,{category:'Surgery',date:'10-09-2026'}),
    LI('Hospital Bill','Surgeon fee – ORIF','SURG-ORIF',1,'per procedure',59400,{category:'Surgery',date:'10-09-2026'}),
    LI('Hospital Bill','Anaesthesia','ANES-01',1,'per procedure',12960,{category:'Surgery',date:'10-09-2026'}),
    LI('Hospital Bill','X-ray (4 views)','RAD-XR',4,'per view',648,{category:'Radiology',date:'09-09-2026'}),
    LI('Hospital Bill','CT pelvis','RAD-CT',1,'per scan',8100,{category:'Radiology',date:'09-09-2026'}),
    LI('Hospital Bill','Physiotherapy','PHY-01',5,'per session',756,{category:'Rehab',date:'11-09-2026'}),
    LI('Hospital Bill','Ambulance','AMB-01',1,'per trip',2700,{category:'Transport',medical:false,date:'09-09-2026'}),
    LI('Hospital Bill','Patient diet','FOOD-01',6,'per day',432,{category:'Non-medical',medical:false,date:'09-09-2026'}),
  ],
  audit:[{ts:hAgo(50),user:'system',entity:'Variance',action:'None',detail:'0 variances detected'},{ts:hAgo(48),user:'Amit Kulkarni',entity:'Claim',action:'Approved',detail:'Straight-through approval'},{ts:hAgo(47.9),user:'system',entity:'Claim Core',action:'Updated',detail:'POST /claims/CLM-2026-01043/digitized → 200 OK (attempt 1)'}],
  claimCore:{status:'Updated',attempts:1,idempotencyKey:'idem-01043-a91f',lastSync:hAgo(47.9),reconciled:true,history:[{ts:hAgo(47.9),attempt:1,code:200,msg:'OK – claim updated'}]},
}));

CLAIMS.push(makeClaim({
  id:'CLM-2026-01042', providerId:'PRV-005', source:'Email', receivedAt:hAgo(0.9), status:'Processing', stage:1, assignee:null,
  ocrFallback:{reason:'Third-party OCR timed out (504) on Lab_Report.tif', queued:true},
  facts:{patient:'Lakshmi Nair', gender:'Female', age:63, dob:'18-04-1963', phone:'94470 11209', memberId:'MEM-3301885', policy:'IHP-2026-0093321', corporate:'—', occupation:'Retired teacher', address:'Nair House, Pattom, Thiruvananthapuram 695004', hospital:'KIMSHEALTH, Thiruvananthapuram', city:'Thiruvananthapuram', rohini:'8900080567890', hospReg:'KL/TVM/2002/00412', hospAddress:'PB No.1, Anayara PO, Thiruvananthapuram 695029', gst:'32AABCK9901E1Z1', doctor:'Dr. L. Pillai', doctorPhone:'94470 99012', pathologist:'Dr. J. Thomas', complaint:'Gradual diminution of vision, right eye', duration:'8 months', diagnosis:'Nuclear cataract, right eye', secondary:'', icd:'H25.11', treatmentLine:'Surgical (day care)', surgical:true, procedure:'Phacoemulsification with foldable IOL', pcs:'08RJ3JZ', surgeryDate:'21-09-2026', admission:'21-09-2026', admissionISO:'2026-09-21', discharge:'21-09-2026', los:1, icuDays:0, roomType:'Day care', emergency:false, expectedCost:32000, history:'None', course:'Day care phaco RE with foldable IOL; uneventful.', investigations:'Biometry; RBS 118', treatment:'Phaco + IOL', billNo:'HB/2026/551040', gross:32500, discount:1200, gstAmt:0, billed:31300, pharmDiscount:200, pharmTotal:1800, kycType:'Aadhaar', kycMasked:'XXXX XXXX 6604', bank:'Federal Bank, Pattom', ifsc:'FDRL0001101', email:'lakshmi.n@example.com', pan:'ABCPN7712B'},
  docs:[
    {name:'Claim_Form_A.pdf', type:'Claim Form A', pages:2, size:'0.7 MB'},
    {name:'Discharge_Summary_ML.pdf', type:'Discharge Summary', pages:1, size:'0.5 MB', language:'Malayalam / English', detections:['stamp']},
    {name:'Bill.pdf', type:'Hospital Bill', pages:1, size:'0.4 MB', detections:['stamp','logo']},
    {name:'Lab_Report.tif', type:'Investigation Report', pages:1, size:'6.2 MB', ocrStatus:'Queued (fallback OCR)'},
  ],
  diagnoses:[{text:'Age-related nuclear cataract, right eye', icd:'H25.11', conf:0.93, primary:true}],
  procedures:[{text:'Phacoemulsification with foldable IOL, right eye', pcs:'08RJ3JZ', conf:0.91, primary:true}],
  icpSummary:'63F, day-care phacoemulsification RE with foldable IOL. Uneventful.',
  lineItems:[
    LI('Hospital Bill','Registration','ADM-01',1,'per admission',425,{category:'Admin',medical:false,date:'21-09-2026'}),
    LI('Hospital Bill','Day care charges','RR-GEN',1,'per day',2125,{category:'Room',date:'21-09-2026'}),
    LI('Hospital Bill','OT charges','OT-01',1,'per procedure',15300,{category:'Surgery',date:'21-09-2026'}),
    LI('Hospital Bill','Surgeon fee – phaco','SURG-CAT',1,'per procedure',15300,{category:'Surgery',date:'21-09-2026'}),
    LI('Hospital Bill','Foldable IOL','IMP-IOL',1,'per unit',7650,{category:'Implant',date:'21-09-2026'}),
  ],
}));

export const claimById = id => CLAIMS.find(c=>c.id===id);


export const INITIAL_NOTIFS: NotificationItem[] = [
  {id:uid('N'), ts:hAgo(0.3), kind:'warn', text:'SLA at risk: EXC on CLM-2026-01046 (Variance review) crosses 4h in 15 min', read:false, link:'#/queue'},
  {id:uid('N'), ts:hAgo(0.9), kind:'bad',  text:'Ingestion partial: Lab_Report.tif on CLM-2026-01042 — OCR timed out, queued for fallback OCR', read:false, link:'#/claims/CLM-2026-01042/documents'},
  {id:uid('N'), ts:hAgo(2.9), kind:'warn', text:'5 variances flagged on CLM-2026-01047 (₹27,760)', read:false, link:'#/claims/CLM-2026-01047/variances'},
  {id:uid('N'), ts:hAgo(3.2), kind:'ok',   text:'Ingestion success: 7 documents received for CLM-2026-01047 via IHX', read:true, link:'#/claims/CLM-2026-01047/documents'},
  {id:uid('N'), ts:hAgo(29),  kind:'bad',  text:'Escalation: CLM-2026-01044 uncontracted implant sent to Network Manager', read:true, link:'#/queue'},
];
export const INITIAL_LOGS: SystemLogItem[] = [
  {ts:hAgo(0.05), level:'INFO', corr:'c-9f1a', msg:'GET /api/v1/queue?assignee=U1 200 (42 ms)'},
  {ts:hAgo(0.2),  level:'INFO', corr:'c-9e77', msg:'User login rahul.patel@acme.com (SSO) from 10.12.4.18'},
  {ts:hAgo(0.9),  level:'ERROR',corr:'c-8c10', msg:'OCR upstream timeout 504 for DOC Lab_Report.tif; retry 3/3 failed; queued to fallback OCR'},
  {ts:hAgo(0.9),  level:'WARN', corr:'c-8c10', msg:'Circuit breaker HALF-OPEN for ocr-service after 3 failures'},
  {ts:hAgo(2.9),  level:'INFO', corr:'c-71b2', msg:'Variance engine: CLM-2026-01047 → 5 flags in 118 ms'},
  {ts:hAgo(3.0),  level:'INFO', corr:'c-71b2', msg:'Tariff match: CLM-2026-01047 version TV-APL-2026 (22 lines, 20 code, 1 fuzzy, 1 none)'},
  {ts:hAgo(3.2),  level:'INFO', corr:'c-71b2', msg:'Ingestion: 7 files from IHX (12.3 MB) validated; classification 0.8 s'},
  {ts:hAgo(47.9), level:'INFO', corr:'c-4410', msg:'Claim Core POST /claims/CLM-2026-01043/digitized 200 idem=idem-01043-a91f'},
];



export const STAGES = ['Received','Extract','Classify','Structure','Tariff match','Variance','Exceptions','Approve','Claim update'];
export const SAMPLE_NAMES = [
  ['Anjali Menon','Female',37,'12-06-1989'],
  ['Suresh Iyer','Male',52,'03-02-1974'],
  ['Fatima Begum','Female',45,'22-09-1981'],
  ['Karan Mehta','Male',31,'14-11-1994']
];
