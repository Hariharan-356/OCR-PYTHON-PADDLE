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

export const USERS: User[] = [
  { id: 'U1', name: 'Rahul Patel', email: 'rahul.patel@acme.com', role: 'Claims Processor', status: 'Active', lastLogin: hAgo(0.2) },
  { id: 'U2', name: 'Priya Menon', email: 'priya.menon@acme.com', role: 'Claims Processor', status: 'Active', lastLogin: hAgo(1.5) },
  { id: 'U3', name: 'Amit Kulkarni', email: 'amit.kulkarni@acme.com', role: 'Team Lead', status: 'Active', lastLogin: hAgo(4) },
  { id: 'U4', name: 'Sunita Rao', email: 'sunita.rao@acme.com', role: 'Network Manager', status: 'Active', lastLogin: hAgo(26) },
  { id: 'U5', name: 'Vikram Shah', email: 'vikram.shah@acme.com', role: 'Compliance', status: 'Inactive', lastLogin: dAgo(12) },
  { id: 'U6', name: 'Neha Iyer', email: 'neha.iyer@acme.com', role: 'Admin', status: 'Active', lastLogin: hAgo(0.5) },
];
export const ROLES = ['Claims Processor', 'Team Lead', 'Network Manager', 'Compliance', 'Admin'];
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
export const PROVIDERS: Provider[] = [];
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

export const claimById = id => CLAIMS.find(c=>c.id===id);


export const INITIAL_NOTIFS: NotificationItem[] = [];
export const INITIAL_LOGS: SystemLogItem[] = [];



export const STAGES = ['Received','Extract','Classify','Structure','Tariff match','Variance','Exceptions','Approve','Claim update'];
export const SAMPLE_NAMES = [
  ['Anjali Menon','Female',37,'12-06-1989'],
  ['Suresh Iyer','Male',52,'03-02-1974'],
  ['Fatima Begum','Female',45,'22-09-1981'],
  ['Karan Mehta','Male',31,'14-11-1994']
];
