const APP_VERSION='13.0';
const APP_BUILD='2026-11-13';
const KEY='raseed_mobile_v2';

const monthNamesAr=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const monthNamesEn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayNamesAr=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const dayNamesEn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let state;
try{state=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){state=null}
if(!state||!Array.isArray(state.transactions))state={transactions:[],paid:0,savings:0,debtTotal:0};
state.salaryConfig=state.salaryConfig||{};
state.salaryMonths=state.salaryMonths||{};
state.cards=state.cards||[];
state.cardOps=state.cardOps||[];
state.cardPayments=state.cardPayments||[];
state.commitments=state.commitments||[];
state.commitmentPayments=state.commitmentPayments||[];
state.accounts=state.accounts||[];
state.ledger=state.ledger||[];
state.importBatches=state.importBatches||[];
state.reportDefaults=state.reportDefaults||{};
state.categories=Array.isArray(state.categories)?state.categories:[];
state.incomeCategories=Array.isArray(state.incomeCategories)?state.incomeCategories:[];
state.categoryTree=state.categoryTree||{expense:{}, income:{}};
state.prefs=state.prefs||{lang:'ar',fontSize:'1',theme:'mint',bgMode:'dark',userName:'',defaultAccount:'',privacy:false,homeDecimals:false};

function syncCategoryTrees(){
  state.categoryTree = state.categoryTree || {expense:{}, income:{}};
  state.categoryTree.expense = state.categoryTree.expense || {};
  state.categoryTree.income = state.categoryTree.income || {};
  const expSubsSet = new Set(Object.values(state.categoryTree.expense).flat());
  const incSubsSet = new Set(Object.values(state.categoryTree.income).flat());
  for(const c of (state.categories||[])){
    if(c && !state.categoryTree.expense[c] && !expSubsSet.has(c)){
      state.categoryTree.expense[c] = [];
    }
  }
  for(const c of (state.incomeCategories||[])){
    if(c && !state.categoryTree.income[c] && !incSubsSet.has(c)){
      state.categoryTree.income[c] = [];
    }
  }
  for(const tx of (state.transactions||[])){
    if(tx.type !== 'expense' && tx.type !== 'income') continue;
    const tree = tx.type === 'income' ? state.categoryTree.income : state.categoryTree.expense;
    const catList = tx.type === 'income' ? state.incomeCategories : state.categories;
    const mc = String(tx.category||'').trim();
    const sc = String(tx.subCategory||'').trim();
    if(mc){
      if(!tree[mc]) tree[mc] = [];
      if(!catList.includes(mc)) catList.push(mc);
      if(sc && !tree[mc].includes(sc)) tree[mc].push(sc);
    }
  }
}
syncCategoryTrees();

let activeYear = new Date().getFullYear();
let activeMonth = new Date().getMonth() + 1;
let forecastYear = activeYear;

const fmt=n=>(Math.round((Number(n)||0)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtInt=n=>Math.round(Number(n)||0).toLocaleString('en-US');
const fmtNum=n=>(state.prefs?.homeDecimals ? fmt(n) : fmtInt(n));
const egp=n=>fmt(n)+' EGP';
const egpSmart=n=>fmtNum(n)+' EGP';
const maskable=str=>state.prefs?.privacy ? '••••' : str;
const today=()=>new Date().toISOString().slice(0,10);
const monthKey=d=>String(d||'').slice(0,7);
const selected=()=>String(activeYear)+'-'+String(activeMonth).padStart(2,'0');
const num=id=>Number(document.getElementById(id)?.value)||0;
const val=id=>document.getElementById(id)?.value||'';
const setv=(id,v)=>{let e=document.getElementById(id);if(e)e.value=v??''};
const round2=x=>Math.round((Number(x)||0)*100)/100;
const ceilTo=(x,step)=>Math.ceil(x/step)*step;

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(s){let x=document.getElementById('toast');if(!x)return;x.textContent=s;x.style.display='block';setTimeout(()=>x.style.display='none',2300)}

function formatYMArabic(ym){
  if(!ym || !ym.includes('-')) return 'مفتوح';
  const [y,m]=ym.split('-');
  const isEn = state.prefs?.lang === 'en';
  return `${(isEn ? monthNamesEn : monthNamesAr)[Number(m)-1]||m} ${y}`;
}
function addMonthsYM(ym, add){
  if(!ym || !ym.includes('-')) return selected();
  let [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, (m - 1) + add, 1);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}

/* IndexedDB Dual-Storage Engine */
const IDB_NAME = 'XWalletSafeDB';
const IDB_STORE = 'state_store';

function openSafeIDB(){
  return new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)) return reject(new Error('No IDB'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(req.error);
  });
}

function saveToIndexedDB(dataObj){
  openSafeIDB().then(db=>{
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(JSON.parse(JSON.stringify(dataObj)), KEY);
  }).catch(()=>{});
}

function recoverFromIndexedDBIfNeeded(){
  openSafeIDB().then(db=>{
    const tx = db.transaction(IDB_STORE, 'readonly');
    const getReq = tx.objectStore(IDB_STORE).get(KEY);
    getReq.onsuccess = () => {
      const idbState = getReq.result;
      const localEmpty = (!state.transactions || !state.transactions.length) && (!state.accounts || !state.accounts.length);
      if(idbState && Array.isArray(idbState.transactions) && localEmpty && (idbState.transactions.length || (idbState.accounts||[]).length)){
        state = idbState;
        syncCategoryTrees();
        applyPreferences();
        try{localStorage.setItem(KEY, JSON.stringify(state));}catch(_){}
        renderAll();
        toast('تمت استعادة بياناتك تلقائياً من الخزنة الآمنة IndexedDB ✓');
      } else {
        saveToIndexedDB(state);
      }
    };
  }).catch(()=>{});
  if(navigator.storage && navigator.storage.persist){
    navigator.storage.persist().catch(()=>{});
  }
}

function updateBackupStatusUI(){
  const lbl = document.getElementById('lastBackupLabel');
  if(!lbl) return;
  const last = state.prefs?.lastBackupDate;
  lbl.textContent = last ? ('آخر نسخة: ' + last) : 'لم يتم التصدير بعد';
}

function persist(){
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){toast('تم الحفظ في IndexedDB')}
  saveToIndexedDB(state);
  updateBackupStatusUI();
  renderAll();
}

/* Custom Unified Dialog System */
let _appDialogState = null;
function closeAppDialog(){
  const m = document.getElementById('appDialogModal');
  if(m) m.classList.remove('show');
  const actBar = document.getElementById('appDialogActionsBar');
  if(actBar) actBar.style.display = 'flex';
  _appDialogState = null;
}
function showAppConfirm(title, msg, onConfirm, isDanger){
  _appDialogState = { mode:'confirm', onConfirm };
  document.getElementById('appDialogTitle').textContent = title || 'تأكيد';
  const msgEl = document.getElementById('appDialogMsg');
  msgEl.textContent = msg || '';
  msgEl.style.display = 'block';
  document.getElementById('appDialogInputWrap').style.display = 'none';
  document.getElementById('appDialogCustomBody').style.display = 'none';
  document.getElementById('appDialogActionsBar').style.display = 'flex';
  const okBtn = document.getElementById('appDialogOkBtn');
  okBtn.textContent = 'تأكيد';
  okBtn.style.background = isDanger ? 'var(--red)' : 'var(--mint)';
  okBtn.style.color = isDanger ? '#fff' : '#06221e';
  document.getElementById('appDialogModal').classList.add('show');
}
function showAppPrompt(title, placeholder, initialValue, onSubmit, multiline){
  _appDialogState = { mode: multiline ? 'textarea' : 'prompt', onSubmit };
  document.getElementById('appDialogTitle').textContent = title || 'إدخال';
  document.getElementById('appDialogMsg').style.display = 'none';
  document.getElementById('appDialogCustomBody').style.display = 'none';
  document.getElementById('appDialogActionsBar').style.display = 'flex';
  const wrap = document.getElementById('appDialogInputWrap');
  wrap.style.display = 'block';
  const inp = document.getElementById('appDialogInput');
  const txt = document.getElementById('appDialogTextarea');
  if(multiline){
    inp.style.display = 'none';
    txt.style.display = 'block';
    txt.placeholder = placeholder || '';
    txt.value = initialValue || '';
    setTimeout(()=>txt.focus(), 60);
  } else {
    txt.style.display = 'none';
    inp.style.display = 'block';
    inp.placeholder = placeholder || '';
    inp.value = initialValue || '';
    setTimeout(()=>inp.focus(), 60);
  }
  const okBtn = document.getElementById('appDialogOkBtn');
  okBtn.textContent = 'حفظ';
  okBtn.style.background = 'var(--mint)';
  okBtn.style.color = '#06221e';
  document.getElementById('appDialogModal').classList.add('show');
}
function showAppCustomForm(title, bodyHtml, onSubmit, hideDefaultActions){
  _appDialogState = { mode:'custom', onSubmit };
  document.getElementById('appDialogTitle').textContent = title || 'تعديل';
  document.getElementById('appDialogMsg').style.display = 'none';
  document.getElementById('appDialogInputWrap').style.display = 'none';
  const cb = document.getElementById('appDialogCustomBody');
  cb.innerHTML = bodyHtml;
  cb.style.display = 'block';
  document.getElementById('appDialogActionsBar').style.display = hideDefaultActions ? 'none' : 'flex';
  const okBtn = document.getElementById('appDialogOkBtn');
  okBtn.textContent = 'حفظ التعديل';
  okBtn.style.background = 'var(--mint)';
  okBtn.style.color = '#06221e';
  document.getElementById('appDialogModal').classList.add('show');
  syncCustomSelectTriggers();
}
function submitAppDialog(){
  if(!_appDialogState) return;
  const st = _appDialogState;
  if(st.mode === 'confirm'){
    closeAppDialog();
    if(st.onConfirm) st.onConfirm();
  } else if(st.mode === 'prompt'){
    const v = document.getElementById('appDialogInput')?.value || '';
    closeAppDialog();
    if(st.onSubmit) st.onSubmit(v);
  } else if(st.mode === 'textarea'){
    const v = document.getElementById('appDialogTextarea')?.value || '';
    closeAppDialog();
    if(st.onSubmit) st.onSubmit(v);
  } else if(st.mode === 'custom'){
    if(st.onSubmit && st.onSubmit() !== false){
      closeAppDialog();
    }
  }
}

/* Exit Confirmation & Back-Button Handling */
let _allowExit = false;
function armBackGuard(){
  try{
    history.replaceState({xwGuard:1}, '');
    history.pushState({xwGuard:2}, '');
  }catch(_){}
}
function cancelExitApp(){
  const m = document.getElementById('exitConfirmModal');
  if(m) m.classList.remove('show');
  try{ history.pushState({xwGuard:2}, ''); }catch(_){}
}
function confirmExitApp(){
  _allowExit = true;
  const m = document.getElementById('exitConfirmModal');
  if(m) m.classList.remove('show');
  try{ window.close(); }catch(_){}
  try{ history.go(-2); }catch(_){}
}
armBackGuard();
document.addEventListener('pointerdown', function _onceArm(){
  armBackGuard();
  document.removeEventListener('pointerdown', _onceArm);
}, {passive:true});
window.addEventListener('popstate', function(){
  if(_allowExit) return;
  const cd = document.getElementById('catDetailModal');
  if(cd && cd.classList.contains('show')){ closeCatDetailModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const qm = document.getElementById('quickModal');
  if(qm && qm.classList.contains('show')){ closeQuickModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const am = document.getElementById('accountModal');
  if(am && am.classList.contains('show')){ closeAccountModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const ym = document.getElementById('ymModal');
  if(ym && ym.classList.contains('show')){ ym.classList.remove('show'); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const cs = document.getElementById('customSelectModal');
  if(cs && cs.classList.contains('show')){ closeCustomSelectModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const ad = document.getElementById('appDialogModal');
  if(ad && ad.classList.contains('show')){ closeAppDialog(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const activePage = document.querySelector('.screen.active')?.id;
  if(activePage && activePage !== 'trans'){
    go('trans', document.querySelector('.nav[data-page="trans"]'));
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }
  const em = document.getElementById('exitConfirmModal');
  if(em && !em.classList.contains('show')){
    em.classList.add('show');
  }
});

/* Auto-Collapse Accordions */
document.addEventListener('toggle', function(e){
  const target = e.target;
  if(target && target.tagName === 'DETAILS' && target.classList.contains('fold') && target.open){
    const scope = target.closest('.screen') || document;
    scope.querySelectorAll('details.fold[open]').forEach(other=>{
      if(other !== target && !other.contains(target) && !target.contains(other)){
        other.removeAttribute('open');
      }
    });
  }
}, true);

/* 8 Theme Colors + 4 Background Modes */
const THEMES = {
  mint:   {mint:'#43d6b2', mint2:'#1a9c94', h1:'#1b8f83', h2:'#145e68', h3:'#174b63'},
  blue:   {mint:'#569aff', mint2:'#2d68c4', h1:'#2563eb', h2:'#1e40af', h3:'#1e3a8a'},
  gold:   {mint:'#f5b041', mint2:'#b9770e', h1:'#b7791f', h2:'#744210', h3:'#5f370e'},
  purple: {mint:'#a582ff', mint2:'#6b46c1', h1:'#6b46c1', h2:'#44337a', h3:'#322659'},
  rose:   {mint:'#fb7185', mint2:'#be123c', h1:'#e11d48', h2:'#9f1239', h3:'#881337'},
  cyan:   {mint:'#22d3ee', mint2:'#0891b2', h1:'#06b6d4', h2:'#0e7490', h3:'#155e75'},
  orange: {mint:'#fb923c', mint2:'#c2410c', h1:'#ea580c', h2:'#9a3412', h3:'#7c2d12'},
  lime:   {mint:'#a3e635', mint2:'#4d7c0f', h1:'#65a30d', h2:'#3f6212', h3:'#365314'}
};

let _pendingTheme = null;
let _pendingBgMode = null;

function previewBgMode(mode){
  _pendingBgMode = mode;
  document.documentElement.setAttribute('data-bg', mode || 'dark');
}
function selectTempTheme(thName){
  _pendingTheme = thName;
  document.querySelectorAll('.theme-dot').forEach(btn=>btn.classList.toggle('active', btn.dataset.theme===thName));
  const th = THEMES[thName] || THEMES.mint;
  document.documentElement.style.setProperty('--mint', th.mint);
  document.documentElement.style.setProperty('--mint2', th.mint2);
  document.documentElement.style.setProperty('--hero1', th.h1);
  document.documentElement.style.setProperty('--hero2', th.h2);
  document.documentElement.style.setProperty('--hero3', th.h3);
}
function applyPreferences(){
  const p = state.prefs || {};
  document.documentElement.style.setProperty('--scale', p.fontSize || '1');
  const bg = p.bgMode || 'dark';
  document.documentElement.setAttribute('data-bg', bg);
  setv('prefBgMode', bg);

  const th = THEMES[p.theme] || THEMES.mint;
  document.documentElement.style.setProperty('--mint', th.mint);
  document.documentElement.style.setProperty('--mint2', th.mint2);
  document.documentElement.style.setProperty('--hero1', th.h1);
  document.documentElement.style.setProperty('--hero2', th.h2);
  document.documentElement.style.setProperty('--hero3', th.h3);
  document.querySelectorAll('.theme-dot').forEach(btn=>btn.classList.toggle('active', btn.dataset.theme===(p.theme||'mint')));

  const lang = p.lang || 'ar';
  setv('prefLang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = 'ltr';
  setv('prefFontSize', p.fontSize || '1');

  document.querySelectorAll('.dec-toggle-btn').forEach(b=>{
    b.classList.toggle('active', !!p.homeDecimals);
    if(b.classList.contains('mm-tool-btn')) b.textContent = '.00';
    else b.textContent = lang === 'en' ? '.00 Decimals' : '.00 الكسور';
  });
  document.querySelectorAll('.privacy-toggle-btn').forEach(b=>{
    b.classList.toggle('active', !!p.privacy);
    if(b.classList.contains('mm-tool-btn')) b.textContent = p.privacy ? '🙈' : '👁';
    else b.textContent = p.privacy ? (lang === 'en' ? '🙈 Hidden' : '🙈 مخفي') : (lang === 'en' ? '👁 Privacy' : '👁 الإخفاء');
  });
  applyLanguageTranslations(lang);

  const defAccSel = document.getElementById('prefDefaultAcc');
  if(defAccSel){
    defAccSel.innerHTML = `<option value="">${lang==='en'?'None':'بدون افتراضي'}</option>` + state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    defAccSel.value = p.defaultAccount || '';
  }
}
function saveGeneralSettings(){
  state.prefs = state.prefs || {};
  state.prefs.lang = document.getElementById('prefLang')?.value || 'ar';
  state.prefs.fontSize = document.getElementById('prefFontSize')?.value || '1';
  state.prefs.defaultAccount = document.getElementById('prefDefaultAcc')?.value || '';
  state.prefs.bgMode = _pendingBgMode || document.getElementById('prefBgMode')?.value || 'dark';
  if(_pendingTheme) state.prefs.theme = _pendingTheme;
  _pendingTheme = null;
  _pendingBgMode = null;
  applyPreferences();
  syncCustomSelectTriggers();
  persist();
  toast('تم حفظ الإعدادات ✓');
}
function toggleDecimalsMode(){
  state.prefs.homeDecimals = !state.prefs?.homeDecimals;
  applyPreferences();
  persist();
}
function togglePrivacyMode(){
  state.prefs.privacy = !state.prefs?.privacy;
  applyPreferences();
  persist();
}

/* Navigation & Page Title Card (10.1) */
const TAB_TITLES = {
  ar: { trans:'المعاملات', reports:'تحليل المعاملات', wallet:'الحسابات والبطاقات', plan:'الالتزامات', settings:'المزيد' },
  en: { trans:'Transactions', reports:'Transactions Analysis', wallet:'Accounts & Cards', plan:'Commitments', settings:'More' }
};

function updateTopTabTitle(pageId){
  const el = document.getElementById('topActiveTabTitle');
  if(!el) return;
  const curId = pageId || document.querySelector('.screen.active')?.id || 'trans';
  const lang = state.prefs?.lang || 'ar';
  el.textContent = (TAB_TITLES[lang] || TAB_TITLES.ar)[curId] || '';
}

function go(id, btn){
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  const t = document.getElementById(id);
  if(t) t.classList.add('active');
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active', x.dataset.page===id));
  if(btn) btn.classList.add('active');
  if(id === 'settings'){
    document.querySelectorAll('#settings details.fold[open]').forEach(f=>f.removeAttribute('open'));
  }
  updateTopTabTitle(id);
  window.scrollTo(0,0);
}
function switchWalletTab(which){
  document.getElementById('walletViewAcc').style.display = which==='acc' ? 'block' : 'none';
  document.getElementById('walletViewCard').style.display = which==='card' ? 'block' : 'none';
  document.getElementById('tabBtnAcc').classList.toggle('active', which==='acc');
  document.getElementById('tabBtnCard').classList.toggle('active', which==='card');
}
function switchPlanTab(which){
  document.getElementById('planViewCom').style.display = which==='com' ? 'block' : 'none';
  document.getElementById('planViewYr').style.display = which==='yr' ? 'block' : 'none';
  document.getElementById('tabBtnCom').classList.toggle('active', which==='com');
  document.getElementById('tabBtnYr').classList.toggle('active', which==='yr');
  if(which === 'yr') renderYearlyExcelReport();
}
function switchSalarySubView(which){
  document.getElementById('salSubViewMonth').style.display = which==='month' ? 'block' : 'none';
  document.getElementById('salSubViewYear').style.display = which==='year' ? 'block' : 'none';
  document.getElementById('salSubTabMonth').classList.toggle('active', which==='month');
  document.getElementById('salSubTabYear').classList.toggle('active', which==='year');
}
function shiftActiveMonth(delta){
  let m = activeMonth + delta, y = activeYear;
  if(m < 1){ m = 12; y -= 1; }
  else if(m > 12){ m = 1; y += 1; }
  activeMonth = m; activeYear = y;
  forecastYear = y;
  renderAll();
}
function shiftForecastYear(delta){
  forecastYear += delta;
  renderYearlyExcelReport();
}

let activeReportCategoryFilter = null;

function toggleSearchBar(){
  const box = document.getElementById('mmSearchBox');
  const btn = document.getElementById('btnToggleSearch');
  const open = box.style.display === 'none';
  box.style.display = open ? 'block' : 'none';
  btn.classList.toggle('active', open);
  if(open){
    document.getElementById('actSearch').focus();
  } else {
    clearTransactionsSearch();
  }
}
function onTransactionsSearchInput(){
  const inp = document.getElementById('actSearch');
  const qVal = (inp?.value || '').trim();
  if(activeReportCategoryFilter && qVal !== activeReportCategoryFilter.category){
    activeReportCategoryFilter = null;
  }
  state.prefs = state.prefs || {};
  state.prefs.savedSearch = qVal;
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){}
  const clrBtn = document.getElementById('btnClearSearch');
  if(clrBtn) clrBtn.style.display = qVal ? 'block' : 'none';
  renderTransactionsScreen();
}
function clearTransactionsSearch(){
  activeReportCategoryFilter = null;
  const inp = document.getElementById('actSearch');
  if(inp) inp.value = '';
  state.prefs = state.prefs || {};
  state.prefs.savedSearch = '';
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){}
  const clrBtn = document.getElementById('btnClearSearch');
  if(clrBtn) clrBtn.style.display = 'none';
  renderTransactionsScreen();
}

function toggleItemActions(el, ev){
  if(ev && ev.target.closest('button')) return;
  const was = el.classList.contains('expanded');
  document.querySelectorAll('.tx-wrap.expanded, .listitem.expanded').forEach(x=>x.classList.remove('expanded'));
  if(!was) el.classList.add('expanded');
}

/* Accounting Core */
function isCardPurchaseTx(t){
  return t.type==='card_purchase' || String(t.source||'').startsWith('card-purchase:');
}
function monthTx(m){return state.transactions.filter(t=>monthKey(t.date)===m)}
function isActualExpenseTx(t){
  if(t.type !== 'expense') return false;
  if(isCardPurchaseTx(t)) return false;
  if(t.source === 'card-payment') return false;
  return true;
}
function totals(m){
  let a=monthTx(m),
      inc=round2(a.filter(t=>t.type==='income').reduce((s,t)=>s+(Number(t.amount)||0),0)),
      exp=round2(a.filter(t=>isActualExpenseTx(t)).reduce((s,t)=>s+(Number(t.amount)||0),0));
  return{a,inc,exp,net:round2(inc-exp)};
}
function accountBalance(a){
  let n=Number(a.opening)||0;
  for(const t of state.transactions){
    if(t.accountId===a.id){
      if(t.type==='income'||t.type==='fund')n+=Number(t.amount)||0;
      else if(t.type==='expense'||t.type==='credit_payment')n-=Number(t.amount)||0;
    }
  }
  for(const l of state.ledger){
    if(l.type==='adjust'){if(l.from===a.id)n+=Number(l.delta??l.amount)||0;continue;}
    if(l.from===a.id)n-=(Number(l.amount)||0)+(Number(l.fee)||0);
    if(l.to===a.id)n+=Number(l.amount)||0;
  }
  return round2(n);
}
function allAccountsAvailable(){
  return round2((state.accounts||[]).filter(a=>a.type!=='credit').reduce((s,a)=>s+accountBalance(a),0));
}
function opOutstanding(op){
  return op.type==='installment'
    ? (op.schedules||[]).reduce((s,x)=>s+Math.max(0,(Number(x.amount)||0)-(Number(x.paid)||0)),0)+Math.max(0,(Number(op.feeDue)||0)-(Number(op.feePaid)||0))
    : Math.max(0,(Number(op.amount)||0)-(Number(op.paid)||0));
}
function cardOpsOutstandingFor(cardId){
  return (state.cardOps||[]).filter(o=>o.cardId===cardId).reduce((s,o)=>s+opOutstanding(o),0);
}
function cardTotalOutstanding(card){
  return round2(Math.max(0,Number(card.balance)||0) + cardOpsOutstandingFor(card.id));
}
function cardCurrentAvailable(card){
  const lim=Number(card.limit)||0;
  if(lim<=0) return 0;
  return round2(Math.max(0, lim - cardTotalOutstanding(card)));
}
function allCardsOutstanding(){
  return round2((state.cards||[]).reduce((s,c)=>s+cardTotalOutstanding(c),0));
}
function commitmentDue(c,month){
  const st = String(c.start||'0000-01');
  const en = String(c.end||'');
  return month >= st && (!en || month <= en);
}

/* 7.5 Bank Installment Start Rule:
   - Suez Canal Bank (بنك قناة السويس): Month after purchase is for admin fee; first installment starts 2 months after purchase.
   - Regular Banks: First installment starts 1 month after purchase (along with admin fee). */
function isSuezCanalBankCard(card){
  const nm = String(card?.name||'').toLowerCase();
  return nm.includes('قناة السويس') || nm.includes('قناه السويس') || nm.includes('suez');
}
function buildInstallmentSchedulesForCard(card, purchaseYM, months, baseInstallment, fee){
  const isSuez = isSuezCanalBankCard(card);
  const feeYM = addMonthsYM(purchaseYM, 1);
  const firstInstOffset = isSuez ? 2 : 1;
  let [py, pm] = purchaseYM.split('-').map(Number);
  const schedules = Array.from({length: months}, (_, i) => {
    const dt = new Date(py, (pm - 1) + firstInstOffset + i, 1);
    const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    return { month: mk, amount: baseInstallment, principalAndInterest: baseInstallment, fee: 0, paid: 0 };
  });
  return { feeYM, firstInstYM: schedules[0]?.month || feeYM, schedules };
}

/* =========================================================
   SECTION 1 & 2 & 3: TRANSACTIONS SCREEN (DAILY & MONTHLY)
   ========================================================= */
let activeTransSubTab = 'daily';

function switchTransSubTab(mode){
  activeTransSubTab = (mode === 'monthly') ? 'monthly' : 'daily';
  document.getElementById('transTabDaily')?.classList.toggle('active', activeTransSubTab === 'daily');
  document.getElementById('transTabMonthly')?.classList.toggle('active', activeTransSubTab === 'monthly');
  renderTransactionsScreen();
}

function shiftTransPeriod(delta){
  if(activeTransSubTab === 'monthly'){
    activeYear += delta;
    forecastYear = activeYear;
    renderAll();
  } else {
    shiftActiveMonth(delta);
  }
}

function openTransPeriodPicker(){
  openHomePeriodPicker();
}

function selectMonthFromMonthlyTab(yr, mn){
  activeYear = yr;
  activeMonth = mn;
  forecastYear = yr;
  switchTransSubTab('daily');
  renderAll();
}

/* Helper to extract timestamp/order so newest transaction is always on top (2.5.8) */
function getItemTimestampOrder(it, idx){
  if(it.createdAt) return Number(it.createdAt)||0;
  const m = String(it.id||'').match(/(\d{10,15})/);
  if(m) return Number(m[1]);
  return idx;
}

function resolveAccountDisplayLabel(it, isEn){
  if(it._kind === 'ledger'){
    return it.accountLabel || '';
  }
  const accObj = state.accounts.find(a=>a.id === it.accountId);
  if(accObj && accObj.name) return accObj.name;
  if(it.accountLabel) return it.accountLabel;
  if(isCardPurchaseTx(it)){
    const opId = String(it.source||'').replace('card-purchase:','');
    const op = state.cardOps.find(o=>o.id===opId);
    const card = op ? state.cards.find(c=>c.id===op.cardId) : null;
    return card ? card.name : (isEn ? 'Credit Card' : 'بطاقة ائتمان');
  }
  if(it.accountId && String(it.accountId).toLowerCase().includes('cash')){
    return isEn ? 'Cash' : 'كاش';
  }
  const cashAcc = state.accounts.find(a=>a.type==='cash');
  if(cashAcc) return cashAcc.name;
  return isEn ? 'Cash' : 'كاش';
}

function renderTransactionsScreen(){
  const lang = state.prefs?.lang || 'ar';
  const isEn = lang === 'en';
  const m = selected();

  document.getElementById('transTabDaily')?.classList.toggle('active', activeTransSubTab === 'daily');
  document.getElementById('transTabMonthly')?.classList.toggle('active', activeTransSubTab === 'monthly');

  const af = document.getElementById('actAccountFilter');
  if(af){
    const cur = af.value;
    af.innerHTML = `<option value="">${isEn ? 'All Accounts' : 'كل الحسابات'}</option>` + state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    if([...af.options].some(o=>o.value===cur)) af.value = cur;
  }

  const searchInputEl = document.getElementById('actSearch');
  if(searchInputEl && !searchInputEl.value && state.prefs?.savedSearch){
    searchInputEl.value = state.prefs.savedSearch;
    const box = document.getElementById('mmSearchBox');
    const btn = document.getElementById('btnToggleSearch');
    if(box) box.style.display = 'block';
    if(btn) btn.classList.add('active');
  }
  const rawQ = (searchInputEl?.value||'').trim();
  const q = rawQ.toLowerCase();
  const clrBtn = document.getElementById('btnClearSearch');
  if(clrBtn) clrBtn.style.display = rawQ ? 'block' : 'none';
  const accFilter = af?.value || '';

  const feed = document.getElementById('dailyTransactionsFeed');

  // === SECTION 3: MONTHLY SUMMARY TAB (4 Columns: الشهر | الدخل | المصروفات | الصافي, with Header Row & No Day Range) ===
  if(activeTransSubTab === 'monthly'){
    document.getElementById('homePeriodLabel').textContent = String(activeYear);
    let yrInc = 0, yrExp = 0;
    const monthRows = [];
    for(let mn = 12; mn >= 1; mn--){
      const ym = String(activeYear) + '-' + String(mn).padStart(2, '0');
      const mt = totals(ym);
      yrInc = round2(yrInc + mt.inc);
      yrExp = round2(yrExp + mt.exp);
      const mLabel = isEn ? monthNamesEn[mn-1] : monthNamesAr[mn-1];
      monthRows.push({ mn, ym, mLabel, inc: mt.inc, exp: mt.exp, net: mt.net });
    }
    const yrNet = round2(yrInc - yrExp);
    document.getElementById('incomeHero').textContent = maskable(fmtNum(yrInc));
    document.getElementById('expenseHero').textContent = maskable(fmtNum(yrExp));
    const remEl = document.getElementById('remaining');
    remEl.textContent = maskable(fmtNum(yrNet));
    remEl.className = yrNet >= 0 ? 'mint' : 'red';

    const headHtml = `
      <div class="mm-monthly-head">
        <div>${isEn ? 'Month' : 'الشهر'}</div>
        <div class="num">${isEn ? 'Income' : 'الدخل'}</div>
        <div class="num">${isEn ? 'Expenses' : 'المصروفات'}</div>
        <div class="num">${isEn ? 'Net' : 'الصافي'}</div>
      </div>
    `;

    feed.innerHTML = `<div class="day-group">` + headHtml + monthRows.map(r => `
      <div class="mm-month-row ${r.mn === activeMonth ? 'cur-month' : ''}" onclick="selectMonthFromMonthlyTab(${activeYear}, ${r.mn})">
        <div><b>${esc(r.mLabel)}</b></div>
        <div class="num blue">${maskable(fmtNum(r.inc))}</div>
        <div class="num red">${maskable(fmtNum(r.exp))}</div>
        <div class="num ${r.net >= 0 ? 'mint' : 'red'}">${maskable(fmtNum(r.net))}</div>
      </div>
    `).join('') + `</div>`;
    return;
  }

  // === SECTION 2: DAILY TRANSACTIONS TAB ===
  const t = totals(m);
  document.getElementById('homePeriodLabel').textContent = isEn ? `${monthNamesEn[activeMonth-1]} ${activeYear}` : formatYMArabic(m);
  document.getElementById('incomeHero').textContent = maskable(fmtNum(t.inc));
  document.getElementById('expenseHero').textContent = maskable(fmtNum(t.exp));
  const remEl = document.getElementById('remaining');
  remEl.textContent = maskable(fmtNum(t.net));
  remEl.className = t.net >= 0 ? 'mint' : 'red';

  const txList = monthTx(m).map((x, idx)=>({...x, _kind:'tx', _order: getItemTimestampOrder(x, idx)}));
  const ledList = (state.ledger||[]).filter(l=>monthKey(l.date)===m).map((l, idx)=>{
    const fromA = state.accounts.find(a=>a.id===l.from)?.name || (isEn?'Cash':'كاش');
    const toA = state.accounts.find(a=>a.id===l.to)?.name || (isEn?'Cash':'كاش');
    const feeTxt = (Number(l.fee)||0) > 0 ? ` (${isEn?'Fee':'رسوم'}: ${fmt(l.fee)})` : '';
    return {
      id: l.id,
      type: l.type,
      category: l.type==='transfer' ? (isEn?'Transfer':'تحويل') : (isEn?'Adjustment':'تسوية'),
      subCategory: '',
      title: (l.note && l.note !== 'تحويل بين الحسابات') ? (l.note + feeTxt) : feeTxt.trim(),
      note: l.note || '',
      accountLabel: l.type==='transfer' ? `${fromA} → ${toA}` : fromA,
      accountId: l.from,
      toAccountId: l.to,
      amount: l.type==='transfer' ? Number(l.amount)||0 : Number(l.delta??l.amount)||0,
      fee: Number(l.fee)||0,
      date: l.date,
      _kind: 'ledger',
      _order: getItemTimestampOrder(l, 100000 + idx)
    };
  });

  // 2.1.1 Search includes notes, title, category, subCategory, account name, and amount
  let combined = [...txList, ...ledList].filter(it=>{
    if(accFilter && it.accountId !== accFilter && it.toAccountId !== accFilter) return false;
    if(q){
      const accDisp = resolveAccountDisplayLabel(it, isEn).toLowerCase();
      const hay = [
        it.title,
        it.note,
        it.category,
        it.subCategory,
        accDisp,
        String(it.amount||'')
      ].map(s=>String(s||'').toLowerCase()).join(' ');
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=>{
    const dc = String(b.date||'').localeCompare(String(a.date||''));
    if(dc !== 0) return dc;
    return (b._order || 0) - (a._order || 0);
  });

  if(!combined.length){
    feed.innerHTML = `<div class="panel"><div class="empty">${isEn ? 'No transactions in this period.<br>Tap <b>＋</b> to add one.' : `لا توجد معاملات مسجلة في ${formatYMArabic(m)}.<br>اضغط على زر <b>＋</b> لإضافة معاملة جديدة.`}</div></div>`;
    return;
  }

  const byDay = {};
  for(const it of combined){
    const dStr = String(it.date||'').slice(0,10);
    if(!byDay[dStr]) byDay[dStr] = [];
    byDay[dStr].push(it);
  }

  let html = '';
  for(const [dStr, items] of Object.entries(byDay)){
    const dtObj = new Date(dStr + 'T12:00:00');
    const dayNum = dStr.slice(8,10);
    const monNum = dStr.slice(5,7);
    const yrNum = dStr.slice(0,4);
    const dayName = !isNaN(dtObj) ? (isEn ? dayNamesEn[dtObj.getDay()] : dayNamesAr[dtObj.getDay()]) : '';
    // 2.2.4 Date format: 23-10-2026 | السبت (Left-to-Right: DD-MM-YYYY | DayName)
    const formattedDayHeader = `${dayNum}-${monNum}-${yrNum} &nbsp;|&nbsp; ${dayName}`;

    let dayInc = 0, dayExp = 0;
    for(const it of items){
      if(it.type === 'income') dayInc += Number(it.amount)||0;
      else if(isActualExpenseTx(it)) dayExp += Number(it.amount)||0;
    }

    const rowsHtml = items.map(it=>{
      const accName = resolveAccountDisplayLabel(it, isEn);
      let amtClass = it.type==='income' ? 'blue' : (it.type==='transfer' ? 'mint' : (isCardPurchaseTx(it) ? 'orange' : 'red'));
      let amtPrefix = it.type==='income' ? '+' : (it.type==='transfer' ? '⇄ ' : '−');

      // 2.2.3 Prevent duplicate text in the middle column
      let rawTitle = String(it.title || it.note || '').trim();
      rawTitle = rawTitle.replace(/^شراء بالبطاقة\s*-\s*/,'');
      const catClean = String(it.category||'').trim();
      const subClean = String(it.subCategory||'').trim();
      const isDupTitle = !rawTitle ||
                         rawTitle.toLowerCase() === catClean.toLowerCase() ||
                         rawTitle.toLowerCase() === subClean.toLowerCase() ||
                         rawTitle.toLowerCase() === accName.toLowerCase();
      const memoLine = isDupTitle ? '' : rawTitle;

      // 2.3.5 & 2.3.6 All transactions show 3 equal-width buttons: نسخ (Left) | تعديل (Middle) | حذف (Right)
      const itemKind = it._kind;
      const actions = `
        <div class="tap-actions">
          <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="duplicateItemToday('${esc(it.id)}','${itemKind}')">${isEn?'Copy':'نسخ'}</button>
          <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditAnyItem('${esc(it.id)}','${itemKind}')">${isEn?'Edit':'تعديل'}</button>
          <button type="button" class="smallbtn danger" onclick="deleteAnyItem('${esc(it.id)}','${itemKind}')">${isEn?'Delete':'حذف'}</button>
        </div>`;

      return `
        <div class="tx-wrap" onclick="toggleItemActions(this, event)">
          <div class="tx-row">
            <div class="tx-cat-col">
              <b>${esc(it.category||'أخرى')}</b>
              ${it.subCategory ? `<small>${esc(it.subCategory)}</small>` : ''}
            </div>
            <div class="tx-acc-col">
              ${memoLine ? `<span>${esc(memoLine)}</span>` : ''}
              <small>${esc(accName)}</small>
            </div>
            <div class="tx-amt-col ${amtClass}">${maskable(amtPrefix + fmt(Math.abs(Number(it.amount)||0)))} EGP</div>
          </div>
          ${actions}
        </div>
      `;
    }).join('');

    html += `
      <div class="day-group">
        <div class="day-head">
          <div class="day-head-right">
            <span dir="ltr" style="font-size:.8rem;color:var(--text)">${formattedDayHeader}</span>
          </div>
          <div class="day-totals">
            <span class="blue">${maskable(fmt(dayInc))} EGP</span>
            <span class="red">${maskable(fmt(dayExp))} EGP</span>
          </div>
        </div>
        ${rowsHtml}
      </div>
    `;
  }
  feed.innerHTML = html;
}

/* 2.3.5, 2.3.6 & 6.6.1 Copy / Edit / Delete for ALL Transactions (including Card Purchases & Transfers) */
function duplicateItemToday(id, kind){
  const nowTs = Date.now();
  if(kind === 'ledger'){
    const origL = state.ledger.find(x=>String(x.id)===String(id));
    if(!origL) return;
    state.ledger.push({
      ...origL,
      id: 'ledger-' + nowTs,
      date: today(),
      createdAt: nowTs
    });
    persist();
    toast('تم نسخ التحويل بتاريخ اليوم ✓');
    return;
  }
  const orig = state.transactions.find(x=>String(x.id)===String(id));
  if(!orig) return;

  // 6.6.1 If duplicating a card-linked transaction, also duplicate its cardOp in state.cardOps so it appears in "كل عمليات البطاقة"
  if(isCardPurchaseTx(orig)){
    const oldOpId = String(orig.source||'').replace('card-purchase:','');
    const origOp = state.cardOps.find(o=>o.id===oldOpId);
    const newOpId = 'op-' + nowTs;
    const dToday = today();
    if(origOp){
      const card = state.cards.find(c=>c.id===origOp.cardId);
      const newOp = JSON.parse(JSON.stringify(origOp));
      newOp.id = newOpId;
      newOp.date = dToday;
      newOp.paid = 0;
      newOp.dueDate = card ? dueDateFor(card, dToday) : dToday;
      if(newOp.type === 'installment'){
        const pYM = dToday.slice(0,7);
        const months = Number(newOp.months)||12;
        const built = buildInstallmentSchedulesForCard(card, pYM, months, newOp.installment, newOp.feeDue||0);
        newOp.purchaseMonth = pYM;
        newOp.feeMonth = built.feeYM;
        newOp.feePaid = 0;
        newOp.schedules = built.schedules;
      }
      state.cardOps.push(newOp);
      if(newOp.type === 'installment') syncCardInstallmentsToCommitments();
    } else if(state.cards.length){
      const fallbackCard = state.cards[0];
      state.cardOps.push({
        id: newOpId,
        cardId: fallbackCard.id,
        type: 'swipe',
        title: String(orig.title||'').replace(/^شراء بالبطاقة\s*-\s*/,'') || orig.category || 'شراء بالبطاقة',
        amount: Number(orig.amount)||0,
        date: dToday,
        paid: 0,
        dueDate: dueDateFor(fallbackCard, dToday)
      });
    }
    state.transactions.push({
      ...orig,
      id: 'card-purchase-' + newOpId,
      date: dToday,
      source: 'card-purchase:' + newOpId,
      createdAt: nowTs
    });
    persist();
    toast('تم نسخ عملية البطاقة بتاريخ اليوم ✓');
    return;
  }

  state.transactions.push({
    ...orig,
    id: 'tx-' + nowTs,
    date: today(),
    createdAt: nowTs
  });
  persist();
  toast('تم نسخ الحركة بتاريخ اليوم ✓');
}

function openEditAnyItem(id, kind){
  if(kind === 'ledger'){
    const l = state.ledger.find(x=>String(x.id)===String(id));
    if(!l) return;
    openEditLedgerModal(l);
    return;
  }
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(!t) return;
  openEditQuickTx(t.id);
}

function deleteAnyItem(id, kind){
  if(kind === 'ledger'){
    showAppConfirm('حذف التحويل', 'هل تريد حذف عملية التحويل هذه؟', ()=>{
      state.ledger = state.ledger.filter(x=>String(x.id)!==String(id));
      persist(); toast('تم الحذف ✓');
    }, true);
    return;
  }
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(t && isCardPurchaseTx(t)){
    const opId = String(t.source||'').replace('card-purchase:','');
    showAppConfirm('حذف عملية البطاقة', 'هل تريد حذف هذه المعاملة وإلغاء عمليتها المرتبطة بالبطاقة؟', ()=>{
      state.transactions = state.transactions.filter(x=>String(x.id)!==String(id));
      if(opId) state.cardOps = state.cardOps.filter(o=>o.id!==opId);
      syncCardInstallmentsToCommitments();
      persist(); toast('تم الحذف ✓');
    }, true);
    return;
  }
  deleteTransaction(id);
}

function openEditLedgerModal(l){
  qmState = {
    type: 'transfer',
    accountId: l.from || '',
    toAccountId: l.to || '',
    category: '',
    subCategory: '',
    isCard: false,
    cardMode: 'swipe',
    editId: l.id,
    editKind: 'ledger',
    dock: 'none'
  };
  document.getElementById('qmHeaderTitle').textContent = 'تعديل تحويل';
  setv('qmDate', l.date || today());
  setv('qmAmount', l.amount || '');
  setv('qmFee', l.fee || '');
  setv('qmNote', l.note || '');
  setQuickTxType('transfer');
  const feeRow = document.getElementById('qmFeeRow');
  const feeBtn = document.getElementById('qmFeeToggleBtn');
  if((Number(l.fee)||0) > 0){
    if(feeRow) feeRow.style.display = 'flex';
    if(feeBtn) feeBtn.classList.add('active');
  }
  renderQuickPickers();
  setQmDockMode('none');
  document.getElementById('quickModal').classList.add('show');
}


/* =========================================================
   SECTION 4: REPORTS ("تحليل المعاملات")
   - 2 Sub-tabs only: الدخل (left) | المصروفات (right)
   - Period Selector: شهري | سنوي | الكل | فترة محددة
   - Category Drill-Down Page (#catDetailModal) with 3 sections:
     1) Subcategory Breakdown descending
     2) Monthly Trend Bar Chart
     3) Daily Detailed Transactions List
   ========================================================= */
let activeReportTab = 'exp'; // 'inc' | 'exp'
let reportPeriodMode = 'monthly'; // 'monthly' | 'yearly' | 'all' | 'custom'
let reportYear = activeYear;
const CHART_COLORS = ['#ff6b6b','#ff9f43','#feca57','#1dd1a1','#48dbfb','#54a0ff','#5f27cd','#ff9ff3','#00d2d3','#c8d6e5','#ee5253','#10ac84'];

function switchReportTab(tab){
  activeReportTab = (tab === 'inc') ? 'inc' : 'exp';
  document.getElementById('repTabInc')?.classList.toggle('active', activeReportTab==='inc');
  document.getElementById('repTabExp')?.classList.toggle('active', activeReportTab==='exp');
  renderReportsScreen();
}

function onReportPeriodModeChange(mode){
  reportPeriodMode = mode || 'monthly';
  const stepBox = document.getElementById('repStepperBox');
  const customRow = document.getElementById('repCustomDatesRow');
  if(stepBox) stepBox.style.display = (reportPeriodMode === 'monthly' || reportPeriodMode === 'yearly') ? 'inline-flex' : 'none';
  if(customRow){
    customRow.style.display = (reportPeriodMode === 'custom') ? 'grid' : 'none';
    if(reportPeriodMode === 'custom'){
      if(!val('repCustomFrom')) setv('repCustomFrom', selected() + '-01');
      if(!val('repCustomTo')) setv('repCustomTo', today());
    }
  }
  renderReportsScreen();
}

function shiftReportPeriod(delta){
  if(reportPeriodMode === 'yearly'){
    reportYear += delta;
    renderReportsScreen();
  } else {
    shiftActiveMonth(delta);
  }
}

function openReportPeriodPicker(){
  if(reportPeriodMode === 'yearly') return;
  openHomePeriodPicker();
}

function getReportFilteredTransactions(isInc){
  const allMatchingType = (state.transactions||[]).filter(t => isInc ? t.type==='income' : isActualExpenseTx(t));
  if(reportPeriodMode === 'monthly'){
    const curYM = selected();
    return {
      periodLabel: formatYMArabic(curYM),
      yearForChart: activeYear,
      list: allMatchingType.filter(t => monthKey(t.date) === curYM)
    };
  }
  if(reportPeriodMode === 'yearly'){
    const yStr = String(reportYear);
    return {
      periodLabel: `سنة ${yStr}`,
      yearForChart: reportYear,
      list: allMatchingType.filter(t => String(t.date||'').startsWith(yStr))
    };
  }
  if(reportPeriodMode === 'custom'){
    const dFrom = val('repCustomFrom') || '0000-01-01';
    const dTo = val('repCustomTo') || '9999-12-31';
    return {
      periodLabel: `${dFrom} ← ${dTo}`,
      yearForChart: Number(dTo.slice(0,4)) || activeYear,
      list: allMatchingType.filter(t => {
        const d = String(t.date||'').slice(0,10);
        return d >= dFrom && d <= dTo;
      })
    };
  }
  // 'all'
  return {
    periodLabel: 'كل الفترات',
    yearForChart: activeYear,
    list: allMatchingType
  };
}

function renderReportsScreen(){
  const isInc = (activeReportTab === 'inc');
  document.getElementById('repTabInc')?.classList.toggle('active', isInc);
  document.getElementById('repTabExp')?.classList.toggle('active', !isInc);

  const { periodLabel, list } = getReportFilteredTransactions(isInc);
  const repLblEl = document.getElementById('repPeriodLabel');
  if(repLblEl) repLblEl.textContent = (reportPeriodMode === 'yearly') ? String(reportYear) : formatYMArabic(selected());

  const byMain = {};
  let grandTotal = 0;
  for(const t of list){
    const amt = Number(t.amount)||0;
    if(amt <= 0) continue;
    const cat = String(t.category||'أخرى').trim() || 'أخرى';
    byMain[cat] = round2((byMain[cat]||0) + amt);
    grandTotal = round2(grandTotal + amt);
  }

  const lblEl = document.getElementById('repMonthlyTotalLabel');
  const valEl = document.getElementById('repMonthlyTotalVal');
  lblEl.textContent = isInc ? 'إجمالي الدخل' : 'إجمالي المصروفات';
  valEl.textContent = maskable(egp(grandTotal));
  valEl.className = isInc ? 'blue' : 'red';

  const entries = Object.entries(byMain).sort((a,b)=>b[1]-a[1]);
  const donutWrap = document.getElementById('repDonutWrap');
  const chipsWrap = document.getElementById('repLegendChips');
  const listEl = document.getElementById('repCatBreakdownList');

  if(!entries.length || grandTotal <= 0){
    donutWrap.innerHTML = '<div class="empty">لا توجد بيانات</div>';
    chipsWrap.innerHTML = '';
    listEl.innerHTML = `<div class="empty">لا توجد ${isInc?'إيرادات':'مصروفات'} مسجلة في (${esc(periodLabel)}).</div>`;
    return;
  }

  let accPct = 0;
  const stops = [];
  entries.forEach(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = (amt / grandTotal) * 100;
    stops.push(`${color} ${accPct.toFixed(2)}% ${(accPct + pct).toFixed(2)}%`);
    accPct += pct;
  });
  donutWrap.innerHTML = `
    <div style="width:162px;height:162px;border-radius:50%;background:conic-gradient(${stops.join(',')});display:grid;place-items:center;box-shadow:0 6px 20px #0004">
      <div style="width:96px;height:96px;border-radius:50%;background:var(--panel);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4px">
        <small style="font-size:.6rem;color:var(--muted)">${isInc?'الدخل':'المصروفات'}</small>
        <b style="font-size:.76rem;direction:ltr">${maskable(fmtInt(grandTotal))}</b>
      </div>
    </div>
  `;

  const repTypeStr = isInc ? 'income' : 'expense';
  chipsWrap.innerHTML = entries.slice(0, 6).map(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = Math.round((amt / grandTotal) * 100);
    return `<span class="tag" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer" onclick="openCategoryDrillDown(${JSON.stringify(cat).replace(/"/g,'&quot;')}, '${repTypeStr}')"><i style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></i>${esc(cat)} ${pct}%</span>`;
  }).join('');

  listEl.innerHTML = entries.map(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = Math.max(1, Math.round((amt / grandTotal) * 100));
    return `
      <div class="listitem" style="cursor:pointer;align-items:center;padding:11px 6px" onclick="openCategoryDrillDown(${JSON.stringify(cat).replace(/"/g,'&quot;')}, '${repTypeStr}')" title="اضغط لتحليل تفاصيل البند">
        <span style="background:${color};color:#08121e;font-weight:400;font-size:.72rem;padding:3px 8px;border-radius:8px;min-width:44px;text-align:center">${pct}%</span>
        <div class="info" style="padding:0 6px">
          <b>${esc(cat)}</b>
        </div>
        <strong style="direction:ltr;font-size:.86rem">${maskable(egp(amt))} ›</strong>
      </div>
    `;
  }).join('');
}

/* 4.3 Dedicated Category Drill-Down Analysis Page (#catDetailModal) */
function openCategoryDrillDown(catName, txType){
  const isInc = (txType === 'income');
  const { periodLabel, yearForChart, list } = getReportFilteredTransactions(isInc);
  const catTxs = list.filter(t => (String(t.category||'أخرى').trim() || 'أخرى') === catName);
  const totalCatAmt = round2(catTxs.reduce((s,t)=>s+(Number(t.amount)||0), 0));

  document.getElementById('catDetailTitle').textContent = catName;
  document.getElementById('catDetailPeriodBadge').textContent = periodLabel;

  // 1) أولًا: ملخص توزيع البند إلى البنود الفرعية تنازلياً من الأكبر للأصغر
  const bySub = {};
  for(const t of catTxs){
    const sub = String(t.subCategory||'').trim() || 'عام (بدون فرعي)';
    bySub[sub] = round2((bySub[sub]||0) + (Number(t.amount)||0));
  }
  const subEntries = Object.entries(bySub).sort((a,b)=>b[1]-a[1]);
  const subBreakdownHtml = subEntries.length ? subEntries.map(([sub, amt], idx)=>{
    const pct = totalCatAmt > 0 ? Math.round((amt / totalCatAmt) * 100) : 0;
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    return `
      <div style="padding:9px 4px;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:.8rem;margin-bottom:5px">
          <b>${esc(sub)} <span class="tag" style="margin-left:6px">${pct}%</span></b>
          <strong class="${isInc?'blue':'red'}" style="direction:ltr">${maskable(egp(amt))}</strong>
        </div>
        <div style="width:100%;height:6px;background:var(--surface);border-radius:4px;overflow:hidden">
          <div style="width:${Math.max(3, pct)}%;height:100%;background:${color};border-radius:4px"></div>
        </div>
      </div>
    `;
  }).join('') : '<div class="empty">لا توجد بنود فرعية مسجلة.</div>';

  // 2) ثانيًا: الرسم البياني لتطور قيمة البند خلال شهور السنة
  const allYearMatching = (state.transactions||[]).filter(t => {
    if(isInc ? t.type!=='income' : !isActualExpenseTx(t)) return false;
    if((String(t.category||'أخرى').trim()||'أخرى') !== catName) return false;
    return String(t.date||'').startsWith(String(yearForChart));
  });
  const monthTotals = Array(12).fill(0);
  for(const t of allYearMatching){
    const mn = Number(String(t.date||'').slice(5,7));
    if(mn >= 1 && mn <= 12) monthTotals[mn-1] = round2(monthTotals[mn-1] + (Number(t.amount)||0));
  }
  const maxMonthVal = Math.max(...monthTotals, 1);
  const barsHtml = monthTotals.map((val, idx)=>{
    const hPct = Math.round((val / maxMonthVal) * 100);
    return `
      <div class="cat-bar-col">
        <span class="cat-bar-val">${val > 0 ? fmtInt(val) : ''}</span>
        <div class="cat-bar-fill" style="height:${val > 0 ? Math.max(8, hPct) : 3}%;background:${val > 0 ? (isInc?'var(--blue)':'var(--mint)') : 'var(--line)'}"></div>
        <span class="cat-bar-lbl">${idx+1}</span>
      </div>
    `;
  }).join('');

  // 3) ثالثًا: التقرير اليومي التفصيلي (جميع معاملات البند مرتبة من الأحدث للأقدم)
  const sortedTxs = [...catTxs].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const dailyListHtml = sortedTxs.length ? sortedTxs.map(t=>{
    const dStr = String(t.date||'').slice(0,10);
    const dtObj = new Date(dStr + 'T12:00:00');
    const dayName = !isNaN(dtObj) ? dayNamesAr[dtObj.getDay()] : '';
    const dateDisp = `${dStr.slice(8,10)}-${dStr.slice(5,7)}-${dStr.slice(0,4)} | ${dayName}`;
    const subOrTitle = [t.subCategory, t.title].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' – ') || catName;
    const accName = resolveAccountDisplayLabel(t, false);
    return `
      <div class="listitem" style="padding:10px 4px">
        <div class="info">
          <b>${esc(subOrTitle)}</b>
          <small>${esc(dateDisp)} · ${esc(accName)}</small>
        </div>
        <strong class="${isInc?'blue':'red'}" style="direction:ltr">${maskable(egp(t.amount))}</strong>
      </div>
    `;
  }).join('') : '<div class="empty">لا توجد معاملات مسجلة لهذا البند.</div>';

  document.getElementById('catDetailBody').innerHTML = `
    <div class="hero" style="margin-bottom:12px">
      <label>إجمالي بند «${esc(catName)}» (${esc(periodLabel)})</label>
      <div class="amount">${maskable(egp(totalCatAmt))}</div>
    </div>

    <div class="section-head" style="margin-top:8px"><h2>1. ملخص توزيع البنود الفرعية</h2><span>مرتبة تنازلياً</span></div>
    <div class="panel">${subBreakdownHtml}</div>

    <div class="section-head"><h2>2. تطور البند خلال شهور ${yearForChart}</h2><span>رسم بياني شهري</span></div>
    <div class="panel">
      <div class="cat-trend-bars">${barsHtml}</div>
    </div>

    <div class="section-head"><h2>3. التقرير اليومي التفصيلي (${sortedTxs.length})</h2><span>جميع المعاملات</span></div>
    <div class="panel">${dailyListHtml}</div>
  `;
  document.getElementById('catDetailModal').classList.add('show');
}

function closeCatDetailModal(){
  document.getElementById('catDetailModal')?.classList.remove('show');
}


/* =========================================================
   SECTION 1: QUICK TRANSACTION ENTRY MODAL (#quickModal)
   - Order: دخل – مصروف – تحويل
   - No (:), no "اختيار", no "EGP"
   - Transfer Fee toggle button & fee row + Swap accounts button (⇅)
   ========================================================= */
let qmState = { type:'expense', accountId:'', toAccountId:'', category:'', subCategory:'', isCard:false, cardMode:'swipe', editId:null, editKind:'tx', dock:'acc' };

function getActiveCatTree(){
  syncCategoryTrees();
  return qmState.type === 'income' ? state.categoryTree.income : state.categoryTree.expense;
}

function setQmDockMode(mode){
  qmState.dock = mode;
  const dockBox = document.getElementById('qmBottomDock');
  const dAcc = document.getElementById('qmDockAcc');
  const dToAcc = document.getElementById('qmDockToAcc');
  const dCat = document.getElementById('qmDockCat');
  const tAcc = document.getElementById('qmAccTrigger');
  const tToAcc = document.getElementById('qmToAccTrigger');
  const tCat = document.getElementById('qmCatTrigger');

  [tAcc, tToAcc, tCat].forEach(el=>{ if(el) el.classList.remove('focused-field'); });

  if(mode === 'none'){
    dockBox.style.display = 'none';
    return;
  }
  dockBox.style.display = 'flex';
  dAcc.style.display = mode === 'acc' ? 'flex' : 'none';
  dToAcc.style.display = mode === 'toAcc' ? 'flex' : 'none';
  dCat.style.display = mode === 'cat' ? 'flex' : 'none';

  if(mode === 'acc' && tAcc) tAcc.classList.add('focused-field');
  if(mode === 'toAcc' && tToAcc) tToAcc.classList.add('focused-field');
  if(mode === 'cat' && tCat) tCat.classList.add('focused-field');
}

function toggleQuickTransferFeeRow(){
  const row = document.getElementById('qmFeeRow');
  const btn = document.getElementById('qmFeeToggleBtn');
  if(!row) return;
  const show = row.style.display === 'none';
  row.style.display = show ? 'flex' : 'none';
  if(btn) btn.classList.toggle('active', show);
  if(show) document.getElementById('qmFee')?.focus();
  else setv('qmFee', '');
}

function swapQuickTransferAccounts(){
  if(!qmState.accountId && !qmState.toAccountId) return;
  const tmp = qmState.accountId;
  qmState.accountId = qmState.toAccountId;
  qmState.toAccountId = tmp;
  renderQuickPickers();
  toast('تم عكس اتجاه التحويل ⇅');
}

function openQuickAddModal(defaultType){
  const tree = defaultType === 'income' ? state.categoryTree.income : state.categoryTree.expense;
  const firstMain = Object.keys(tree)[0] || 'أخرى';
  qmState = {
    type: defaultType || 'expense',
    accountId: state.prefs?.defaultAccount || (state.accounts[0]?.id || ''),
    toAccountId: state.accounts[1]?.id || (state.accounts[0]?.id || ''),
    category: firstMain,
    subCategory: '',
    isCard: false,
    cardMode: 'swipe',
    editId: null,
    editKind: 'tx',
    dock: 'acc'
  };
  document.getElementById('qmHeaderTitle').textContent = 'تسجيل حركة جديدة';
  setv('qmDate', today());
  setv('qmAmount', '');
  setv('qmFee', '');
  setv('qmNote', '');
  document.getElementById('qmFeeRow').style.display = 'none';
  document.getElementById('qmFeeToggleBtn')?.classList.remove('active');
  setQuickTxType(qmState.type);
  renderQuickPickers();
  setQmDockMode('acc');
  document.getElementById('quickModal').classList.add('show');
}

function openEditQuickTx(id){
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(!t) return;
  const isCardTx = isCardPurchaseTx(t);
  let cardId = '';
  let cardMode = 'swipe';
  if(isCardTx){
    const opId = String(t.source||'').replace('card-purchase:','');
    const op = state.cardOps.find(o=>o.id===opId);
    if(op){
      cardId = op.cardId;
      cardMode = op.type || 'swipe';
      if(op.months) setv('qmCardMonths', op.months);
    }
  }
  qmState = {
    type: t.type === 'income' ? 'income' : 'expense',
    accountId: isCardTx ? (cardId || state.cards[0]?.id || '') : (t.accountId || ''),
    toAccountId: '',
    category: t.category || 'أخرى',
    subCategory: t.subCategory || '',
    isCard: isCardTx,
    cardMode: cardMode,
    editId: t.id,
    editKind: 'tx',
    dock: 'cat'
  };
  document.getElementById('qmHeaderTitle').textContent = 'تعديل حركة';
  setv('qmDate', t.date || today());
  setv('qmAmount', t.amount || '');
  setv('qmFee', '');
  setv('qmNote', String(t.title||'').replace(/^شراء بالبطاقة\s*-\s*/,''));
  document.getElementById('qmFeeRow').style.display = 'none';
  setQuickTxType(qmState.type);
  renderQuickPickers();
  setQmDockMode('cat');
  document.getElementById('quickModal').classList.add('show');
}

function closeQuickModal(){
  document.getElementById('quickModal').classList.remove('show');
}

function setQuickTxType(t){
  qmState.type = t;
  document.getElementById('qmTabInc').classList.toggle('active', t==='income');
  document.getElementById('qmTabExp').classList.toggle('active', t==='expense');
  document.getElementById('qmTabTrn').classList.toggle('active', t==='transfer');

  const isTrn = (t === 'transfer');
  document.getElementById('qmToAccRow').style.display = isTrn ? 'flex' : 'none';
  document.getElementById('qmSwapAccRow').style.display = isTrn ? 'flex' : 'none';
  document.getElementById('qmCatRow').style.display = isTrn ? 'none' : 'flex';
  document.getElementById('qmAccLabelTitle').textContent = isTrn ? 'من حساب' : 'الحساب';

  const feeBtn = document.getElementById('qmFeeToggleBtn');
  const feeRow = document.getElementById('qmFeeRow');
  if(feeBtn) feeBtn.style.display = isTrn ? 'inline-block' : 'none';
  if(!isTrn && feeRow) feeRow.style.display = 'none';

  if(t !== 'expense'){
    qmState.isCard = false;
    document.getElementById('qmCardModeRow').style.display = 'none';
    document.getElementById('qmCardMonthsRow').style.display = 'none';
  }
  if(!isTrn){
    const tree = getActiveCatTree();
    if(!tree[qmState.category]){
      qmState.category = Object.keys(tree)[0] || 'أخرى';
      qmState.subCategory = '';
    }
  }
  renderQuickPickers();
  setQmDockMode('acc');
}

function setQmCardMode(mode){
  qmState.cardMode = mode;
  document.getElementById('qmCardSwipeBtn').classList.toggle('active', mode==='swipe');
  document.getElementById('qmCardInstBtn').classList.toggle('active', mode==='installment');
  document.getElementById('qmCardMonthsRow').style.display = mode==='installment' ? 'flex' : 'none';
}

function updateQmCatLabel(){
  const label = qmState.subCategory ? `${qmState.category} / ${qmState.subCategory}` : (qmState.category || 'اختر القسم');
  document.getElementById('qmCatSelectedText').textContent = label;
}

function renderQuickPickers(){
  let accItems = state.accounts.map(a=>({id:a.id, name:a.name, isCard:false}));
  if(qmState.type === 'expense'){
    state.cards.forEach(c=>accItems.push({id:c.id, name:'💳 ' + c.name, isCard:true}));
  }
  const selAcc = accItems.find(x=>x.id===qmState.accountId) || accItems[0];
  if(selAcc){
    qmState.accountId = selAcc.id;
    qmState.isCard = selAcc.isCard;
    document.getElementById('qmAccSelectedText').textContent = selAcc.name;
    document.getElementById('qmCardModeRow').style.display = selAcc.isCard ? 'flex' : 'none';
    document.getElementById('qmCardMonthsRow').style.display = (selAcc.isCard && qmState.cardMode==='installment') ? 'flex' : 'none';
  } else {
    document.getElementById('qmAccSelectedText').textContent = 'كاش';
  }
  document.getElementById('qmAccGrid').innerHTML = accItems.map(a=>`
    <button type="button" class="qg-item ${a.id===qmState.accountId?'selected':''}" onclick="selectQuickAcc('${a.id}', ${a.isCard})">${esc(a.name)}</button>
  `).join('');

  const toAcc = state.accounts.find(a=>a.id===qmState.toAccountId) || state.accounts.find(a=>a.id!==qmState.accountId) || state.accounts[0];
  if(toAcc){
    qmState.toAccountId = toAcc.id;
    document.getElementById('qmToAccSelectedText').textContent = toAcc.name;
  }
  document.getElementById('qmToAccGrid').innerHTML = state.accounts.map(a=>`
    <button type="button" class="qg-item ${a.id===qmState.toAccountId?'selected':''}" onclick="selectQuickToAcc('${a.id}')">${esc(a.name)}</button>
  `).join('');

  const tree = getActiveCatTree();
  const mainCats = Object.keys(tree);
  if(!mainCats.length){
    qmState.category = '';
    qmState.subCategory = '';
    document.getElementById('qmCatSelectedText').textContent = 'لا توجد أقسام';
  } else {
    if(!qmState.category || !tree[qmState.category]){
      qmState.category = mainCats[0];
      qmState.subCategory = '';
    }
    updateQmCatLabel();
  }

  const mainColEl = document.getElementById('qmMainCatList');
  const subColEl = document.getElementById('qmSubCatList');
  if(mainColEl && subColEl){
    if(!mainCats.length){
      mainColEl.innerHTML = '<div class="empty" style="padding:14px 4px;font-size:.68rem">اضغط «＋ رئيسي» للإضافة</div>';
      subColEl.innerHTML = '<div class="empty" style="padding:14px 4px;font-size:.68rem">—</div>';
    } else {
      mainColEl.innerHTML = mainCats.map(mc=>{
        const subsCount = (tree[mc]||[]).length;
        return `<button type="button" class="mm-cat-item ${mc===qmState.category?'active':''}" onclick="selectQuickMainCat('${esc(mc)}')">
          <span>${esc(mc)}</span>
          ${subsCount ? `<small style="opacity:.7">›</small>` : ''}
        </button>`;
      }).join('');

      const subs = tree[qmState.category] || [];
      let subHtml = `<button type="button" class="mm-cat-item ${!qmState.subCategory?'active':''}" onclick="selectQuickSubCat('')"><span>عام (بدون فرعي)</span></button>`;
      subHtml += subs.map(sc=>`
        <button type="button" class="mm-cat-item ${sc===qmState.subCategory?'active':''}" onclick="selectQuickSubCat('${esc(sc)}')"><span>${esc(sc)}</span></button>
      `).join('');
      subColEl.innerHTML = subHtml;
    }
  }
}

function selectQuickAcc(id, isCard){
  qmState.accountId = id;
  qmState.isCard = !!isCard;
  renderQuickPickers();
  if(qmState.type === 'transfer'){
    setQmDockMode('toAcc');
  } else {
    setQmDockMode('cat');
  }
}
function selectQuickToAcc(id){
  qmState.toAccountId = id;
  renderQuickPickers();
  setQmDockMode('none');
  document.getElementById('qmAmount')?.focus();
}
function selectQuickMainCat(mc){
  qmState.category = mc;
  qmState.subCategory = '';
  renderQuickPickers();
  const subs = getActiveCatTree()[mc] || [];
  if(!subs.length){
    setQmDockMode('none');
    document.getElementById('qmAmount')?.focus();
  }
}
function selectQuickSubCat(sc){
  qmState.subCategory = sc;
  renderQuickPickers();
  setQmDockMode('none');
  document.getElementById('qmAmount')?.focus();
}
function openAddQuickCatPrompt(isSub){
  const label = isSub ? `إضافة قسم فرعي داخل «${qmState.category}»` : 'إضافة قسم رئيسي جديد';
  showAppPrompt(label, 'اكتب الاسم هنا...', '', (name)=>{
    if(!name || !name.trim()) return;
    const clean = name.trim();
    const isInc = qmState.type === 'income';
    const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
    if(isSub){
      const parent = qmState.category || Object.keys(tree)[0] || 'أخرى';
      tree[parent] = [...new Set([...(tree[parent]||[]), clean])];
      qmState.subCategory = clean;
    } else {
      if(!tree[clean]) tree[clean] = [];
      if(isInc) state.incomeCategories = [...new Set([...(state.incomeCategories||[]), clean])];
      else state.categories = [...new Set([...(state.categories||[]), clean])];
      qmState.category = clean;
      qmState.subCategory = '';
    }
    persist();
    renderQuickPickers();
    toast('تمت الإضافة ✓');
  });
}

function saveQuickModal(){
  const amount = num('qmAmount');
  const fee = num('qmFee');
  const date = val('qmDate') || today();
  const note = val('qmNote').trim();
  const nowTs = Date.now();
  if(amount <= 0) return toast('أدخل المبلغ بشكل صحيح');

  // Transfer Save / Edit (with optional Transfer Fee)
  if(qmState.type === 'transfer'){
    if(!qmState.accountId || !qmState.toAccountId || qmState.accountId === qmState.toAccountId){
      return toast('اختر حسابين مختلفين للتحويل');
    }
    if(qmState.editId && qmState.editKind === 'ledger'){
      const l = state.ledger.find(x=>String(x.id)===String(qmState.editId));
      if(l){
        l.from = qmState.accountId;
        l.to = qmState.toAccountId;
        l.amount = amount;
        l.fee = Math.max(0, fee);
        l.note = note || 'تحويل بين الحسابات';
        l.date = date;
      }
      persist(); closeQuickModal(); toast('تم تعديل التحويل ✓');
      return;
    }
    state.ledger.push({
      id: 'ledger-' + nowTs,
      type: 'transfer',
      from: qmState.accountId,
      to: qmState.toAccountId,
      amount,
      fee: Math.max(0, fee),
      note: note || 'تحويل بين الحسابات',
      date,
      createdAt: nowTs
    });
    persist(); closeQuickModal(); toast('تم تسجيل التحويل ✓');
    return;
  }

  // Editing an existing Transaction (including card-linked transactions)
  if(qmState.editId){
    const t = state.transactions.find(x=>String(x.id)===String(qmState.editId));
    if(t){
      if(isCardPurchaseTx(t)){
        const opId = String(t.source||'').replace('card-purchase:','');
        const op = state.cardOps.find(o=>o.id===opId);
        const title = note || qmState.subCategory || qmState.category || 'شراء بالبطاقة';
        t.category = qmState.category || 'مشتريات بطاقة';
        t.subCategory = qmState.subCategory || '';
        t.title = 'شراء بالبطاقة - ' + title;
        t.amount = amount;
        t.date = date;
        if(op){
          op.title = title;
          op.amount = amount;
          op.date = date;
          const card = state.cards.find(c=>c.id===op.cardId);
          if(op.type === 'installment' && card){
            const months = Number(op.months)||12;
            const trm = (card.terms||{})[months] || {monthlyRate:0, adminRate:0};
            const interest = round2(amount * trm.monthlyRate * months);
            const adminFee = round2(amount * trm.adminRate);
            const base = round2((amount + interest) / months);
            const built = buildInstallmentSchedulesForCard(card, date.slice(0,7), months, base, adminFee);
            op.interest = interest;
            op.adminFee = adminFee;
            op.installment = base;
            op.total = round2(amount + interest + adminFee);
            op.feeMonth = built.feeYM;
            op.feeDue = adminFee;
            op.schedules = built.schedules;
            syncCardInstallmentsToCommitments();
          }
        }
      } else {
        t.type = qmState.type;
        t.category = qmState.category;
        t.subCategory = qmState.subCategory || '';
        t.title = note;
        t.amount = amount;
        t.date = date;
        t.accountId = qmState.accountId || null;
      }
    }
    persist(); closeQuickModal(); toast('تم تعديل الحركة ✓');
    return;
  }

  // New Card Purchase / Installment from Quick Entry
  if(qmState.isCard && qmState.type === 'expense'){
    const card = state.cards.find(c=>c.id===qmState.accountId);
    if(!card) return toast('اختر البطاقة');
    const title = note || qmState.subCategory || qmState.category || 'شراء بالبطاقة';
    const opType = qmState.cardMode;
    let op = {id:'op-'+nowTs, cardId:card.id, type:opType, title, amount, date, paid:0, dueDate:dueDateFor(card,date), createdAt:nowTs};
    if(opType === 'installment'){
      const months = num('qmCardMonths') || 12;
      const t = (card.terms||{})[months] || {monthlyRate:0, adminRate:0};
      const interest = round2(amount * t.monthlyRate * months);
      const feeVal = round2(amount * t.adminRate);
      const base = round2((amount + interest) / months);
      const purchaseYM = date.slice(0,7);
      const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, base, feeVal);
      op.purchaseMonth = purchaseYM; op.months = months; op.interest = interest;
      op.adminFee = feeVal; op.installment = base; op.total = round2(amount + interest + feeVal);
      op.feeMonth = built.feeYM; op.feeDue = feeVal; op.feePaid = 0;
      op.schedules = built.schedules;
    }
    state.cardOps.push(op);
    state.transactions.push({id:'card-purchase-'+op.id, type:'card_purchase', title:'شراء بالبطاقة - '+title, category:qmState.category||'مشتريات بطاقة', subCategory:qmState.subCategory||'', amount, date, accountId:null, source:'card-purchase:'+op.id, createdAt:nowTs});
    if(opType === 'installment') syncCardInstallmentsToCommitments();
    persist(); closeQuickModal(); toast(opType==='installment'?'تم تسجيل التقسيط وإضافة أقساطه ✓':'تم تسجيل الشراء على البطاقة ✓');
    return;
  }

  state.transactions.push({
    id: 'tx-' + nowTs,
    type: qmState.type,
    category: qmState.category,
    subCategory: qmState.subCategory || '',
    title: note,
    amount,
    date,
    accountId: qmState.accountId || null,
    createdAt: nowTs
  });
  persist(); closeQuickModal(); toast('تم الحفظ ✓');
}

function deleteTransaction(id){
  showAppConfirm('حذف الحركة', 'هل تريد حذف هذه الحركة نهائياً؟', ()=>{
    state.transactions = state.transactions.filter(x=>String(x.id)!==String(id));
    persist(); toast('تم الحذف');
  }, true);
}


/* =========================================================
   SECTION 9: MONEY MANAGER (.mmbak) IMPORTER WITH USD & CNY EXCHANGE RATES
   ========================================================= */
let mmPending = null;
function mmDefaultType(name, currency){
  if(/credit/i.test(String(name||''))) return 'skip';
  if(/cash/i.test(String(name||''))) return 'cash';
  if(/vodafone|wallet|wechat|alipay/i.test(String(name||''))) return 'wallet';
  return 'bank';
}
function mmTypeSelect(i, selected){
  const opts=[['cash','كاش'],['bank','بنك / Debit'],['wallet','محفظة إلكترونية'],['prepaid','بطاقة مسبقة'],['skip','استبعاد']];
  return `<select class="mmtype" data-index="${i}" style="width:100%;background:var(--surface);color:var(--text);border:1px solid var(--line2);border-radius:9px;padding:6px;margin-top:4px">${opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('')}</select>`;
}

function detectCurrencyCodeAndRate(rawCurUid, currencyMap){
  const key = String(rawCurUid||'').trim();
  if(!key) return { code:'EGP', rate:1, supported:true };
  if(currencyMap[key]){
    return currencyMap[key];
  }
  const up = key.toUpperCase();
  if(up.includes('EGP')) return { code:'EGP', rate:1, supported:true };
  if(up.includes('USD')){
    return currencyMap['__ISO_USD__'] || { code:'USD', rate:1, supported:true };
  }
  if(up.includes('CNY') || up.includes('RMB')){
    return currencyMap['__ISO_CNY__'] || { code:'CNY', rate:1, supported:true };
  }
  return { code:up, rate:1, supported:false };
}

function readMmbak(ev){
  let file = ev.target.files && ev.target.files[0]; if(!file) return;
  let out = document.getElementById('mmbakPreview'); out.textContent = 'جارٍ قراءة النسخة والعملات والأقسام…';
  if(!window.initSqlJs){ out.textContent = 'مكتبة SQL غير متاحة.'; return; }
  let reader = new FileReader();
  reader.onload = async e => {
    try{
      let SQL = await initSqlJs({locateFile:f=>'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/'+f});
      let db = new SQL.Database(new Uint8Array(e.target.result));

      // 9.1 Extract Exchange Rates from CURRENCY table inside Money Manager DB
      let currencyMap = {};
      let fxSummary = [];
      try{
        const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(x=>String(x[0]));
        const curTable = tables.find(tn=>/^CURRENCY$/i.test(tn)) || tables.find(tn=>/currency/i.test(tn));
        if(curTable){
          const pragma = db.exec(`PRAGMA table_info("${curTable}")`)[0]?.values || [];
          const cols = pragma.map(x=>String(x[1]));
          const uidCol = cols.find(c=>/^uid$/i.test(c)) || cols.find(c=>/id/i.test(c)) || cols[0];
          const isoCol = cols.find(c=>/^(ISO|CODE|SYMBOL|NAME)$/i.test(c)) || cols.find(c=>/iso|code|name/i.test(c)) || uidCol;
          const nameCol = cols.find(c=>/^NAME$/i.test(c)) || isoCol;
          const rateCol = cols.find(c=>/^RATE$/i.test(c)) || cols.find(c=>/rate|exch/i.test(c));

          const qCur = `SELECT "${uidCol}", "${isoCol}", "${nameCol}", ${rateCol?`"${rateCol}"`:'1'} FROM "${curTable}"`;
          const cRows = db.exec(qCur)[0]?.values || [];
          for(const r of cRows){
            const u = String(r[0]??'').trim();
            const iso = String(r[1]??'').trim().toUpperCase();
            const nm = String(r[2]??'').trim().toUpperCase();
            let rt = Number(r[3]);
            if(!Number.isFinite(rt) || rt <= 0) rt = 1;
            const combinedStr = `${u} ${iso} ${nm}`.toUpperCase();
            let code = 'OTHER';
            let supported = false;
            if(combinedStr.includes('EGP')){ code = 'EGP'; rt = 1; supported = true; }
            else if(combinedStr.includes('USD')){ code = 'USD'; supported = true; }
            else if(combinedStr.includes('CNY') || combinedStr.includes('RMB') || combinedStr.includes('YUAN')){ code = 'CNY'; supported = true; }

            const info = { code, rate: rt, supported };
            if(u) currencyMap[u] = info;
            if(iso) currencyMap[iso] = info;
            if(supported && (code === 'USD' || code === 'CNY')){
              currencyMap['__ISO_' + code + '__'] = info;
              fxSummary.push(`${code} = ${fmt(rt)} EGP`);
            }
          }
        }
      }catch(err){ console.warn('MM CURRENCY parse:', err); }

      let assets = [];
      try{
        assets = db.exec("SELECT uid,NIC_NAME,currencyUid,IFNULL(BALANCE,IFNULL(ZMONEY,IFNULL(AMOUNT,0))) FROM ASSETS")[0]?.values || [];
      }catch(_){
        assets = (db.exec("SELECT uid,NIC_NAME,currencyUid FROM ASSETS")[0]?.values||[]).map(r=>[r[0],r[1],r[2],0]);
      }

      // Filter or mark supported currencies (EGP, USD, CNY)
      let catInfoMap = {};
      let expTree = {};
      let incTree = {};
      try{
        const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(x=>String(x[0]));
        const catTable = tables.find(tn=>/^ZCATEGORY$/i.test(tn)) || tables.find(tn=>/^(CATEGORY|CTG)$/i.test(tn));
        if(catTable){
          const pragma = db.exec(`PRAGMA table_info("${catTable}")`)[0]?.values || [];
          const cols = pragma.map(x=>String(x[1]));
          const idCol = cols.find(c=>/^ID$/i.test(c)) || cols.find(c=>/id/i.test(c));
          const uidCol = cols.find(c=>/^uid$/i.test(c)) || idCol;
          const nameCol = cols.find(c=>/^NAME$/i.test(c)) || cols.find(c=>/name/i.test(c));
          const typeCol = cols.find(c=>/^TYPE$/i.test(c)) || cols.find(c=>/type/i.test(c));
          const pUidCol = cols.find(c=>/^pUid$/i.test(c)) || cols.find(c=>/p_?uid|parent/i.test(c));
          const delCol = cols.find(c=>/^C_IS_DEL$/i.test(c)) || cols.find(c=>/is_del/i.test(c));
          const statusCol = cols.find(c=>/^STATUS$/i.test(c));
          const ordCol = cols.find(c=>/^ORDERSEQ$/i.test(c)) || cols.find(c=>/order|seq/i.test(c));

          const qSql = `SELECT ${idCol?`"${idCol}"`:'0'}, "${uidCol}", "${nameCol}", ${typeCol?`"${typeCol}"`:'1'}, ${pUidCol?`"${pUidCol}"`:"'0'"}, ${delCol?`COALESCE("${delCol}",0)`:'0'}, ${statusCol?`COALESCE("${statusCol}",0)`:'0'} FROM "${catTable}" ORDER BY ${ordCol?`COALESCE("${ordCol}",0) ASC, `:''}${idCol?`"${idCol}"`:'1'} ASC`;
          const rows = db.exec(qSql)[0]?.values || [];
          const byKey = {};
          const allObjs = [];
          for(const r of rows){
            const rawId = String(r[0]??'').trim();
            const rawUid = String(r[1]??'').trim();
            const nm = String(r[2]??'').trim();
            const tp = Number(r[3]);
            const rawP = String(r[4]??'').trim();
            const pu = (!rawP || rawP === '0' || rawP === '-1' || /^null$/i.test(rawP)) ? '' : rawP;
            const isDel = Number(r[5]) === 1;
            const st = Number(r[6]) || 0;
            if(!nm) continue;
            const obj = {id:rawId, uid:rawUid||rawId, name:nm, type:tp, pUid:pu, isDel, status:st};
            allObjs.push(obj);
            if(rawUid) byKey[rawUid] = obj;
            if(rawId && !byKey[rawId]) byKey[rawId] = obj;
          }
          for(const obj of allObjs){
            let parent = (obj.pUid && obj.pUid !== obj.uid && obj.pUid !== obj.id) ? byKey[obj.pUid] : null;
            if(parent && parent.pUid && parent.pUid !== parent.uid && parent.pUid !== parent.id && byKey[parent.pUid]){
              parent = byKey[parent.pUid];
            }
            const effType = parent ? parent.type : obj.type;
            const info = {
              name: obj.name,
              parentName: parent ? parent.name : '',
              doType: String(effType)
            };
            if(obj.uid) catInfoMap[obj.uid] = info;
            if(obj.id && !catInfoMap[obj.id]) catInfoMap[obj.id] = info;

            if(!obj.isDel){
              const tTree = effType === 0 ? incTree : expTree;
              if(parent){
                if(!parent.isDel){
                  tTree[parent.name] = tTree[parent.name] || [];
                  if(!tTree[parent.name].includes(obj.name)) tTree[parent.name].push(obj.name);
                }
              } else {
                tTree[obj.name] = tTree[obj.name] || [];
              }
            }
          }
        }
      }catch(err){ console.warn('MM ZCATEGORY parse:', err); }

      const ioCols = (db.exec(`PRAGMA table_info("INOUTCOME")`)[0]?.values||[]).map(x=>String(x[1]));
      const subCol = ioCols.find(c=>/^(sub_?ctg|sub_?cat|zsub|subctg)/i.test(c));
      const catNameCol = ioCols.find(c=>/^(ctg_?name|cat_?name|category_?name)/i.test(c));
      const extraSel = [subCol ? `"${subCol}"` : "''", catNameCol ? `"${catNameCol}"` : "''"].join(',');

      let tx = db.exec(`SELECT uid,assetUid,toAssetUid,ZDATE,DO_TYPE,ZMONEY,ZCONTENT,ctgUid,currencyUid,WDATE,txUidTrans,${extraSel} FROM INOUTCOME WHERE COALESCE(IS_DEL,0)=0 ORDER BY CASE WHEN DO_TYPE='3' THEN 0 ELSE 1 END`)[0]?.values || [];
      mmPending = {assets, tx, catInfoMap, expTree, incTree, currencyMap};

      const totalCats = Object.keys(expTree).length + Object.keys(incTree).length;
      const totalSubs = Object.values(expTree).reduce((s,a)=>s+a.length,0) + Object.values(incTree).reduce((s,a)=>s+a.length,0);
      const fxNote = fxSummary.length ? `<div class="hint" style="color:var(--blue)">أسعار الصرف المستخرجة من قاعدة البيانات: <b>${esc(fxSummary.join(' | '))}</b></div>` : '';

      out.innerHTML = `<p class="hint">تم العثور على <b>${assets.length}</b> حساب، <b>${tx.length}</b> حركة، <b>${totalCats}</b> قسم رئيسي، و<b>${totalSubs}</b> قسم فرعي:</p>` +
        fxNote +
        `<label style="display:flex;align-items:center;gap:8px;font-size:.74rem;color:var(--mint);margin:6px 0 8px;cursor:pointer"><input type="checkbox" id="mmReplaceCatsChk" checked> مطابقة واستبدال الأقسام بأقسام Money Manager وتحديث المعاملات</label>` +
        assets.map((a,i)=>{
          const cInfo = detectCurrencyCodeAndRate(a[2], currencyMap);
          return `<div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" class="mmasset" value="${i}" ${cInfo.supported?'checked':''}><div><b style="font-size:.78rem">${esc(a[1]||'حساب')}</b><small style="display:block;color:var(--muted);font-size:.66rem">${esc(cInfo.code)} ${cInfo.rate!==1?`(سعر الصرف: ${fmt(cInfo.rate)})`:''} · رصيد: ${esc(String(a[3]??0))}</small>${mmTypeSelect(i, cInfo.supported ? mmDefaultType(a[1],a[2]) : 'skip')}</div></div>`;
        }).join('') +
        `<button class="primary" style="margin-top:10px" onclick="commitMmbakDirect()">استيراد الحسابات والأقسام والحركات (EGP / USD / CNY)</button>`;
    }catch(err){ out.textContent = 'تعذر قراءة الملف: ' + err.message; }
  };
  reader.readAsArrayBuffer(file);
}

function commitMmbakDirect(){
  if(!mmPending) return;
  const chosen = [...document.querySelectorAll('.mmasset:checked')].map(x=>Number(x.value));
  if(!chosen.length) return toast('اختر حسابًا واحدًا على الأقل');

  const replaceCats = document.getElementById('mmReplaceCatsChk')?.checked;
  if(replaceCats && (Object.keys(mmPending.expTree||{}).length || Object.keys(mmPending.incTree||{}).length)){
    state.categoryTree = {
      expense: JSON.parse(JSON.stringify(mmPending.expTree||{})),
      income: JSON.parse(JSON.stringify(mmPending.incTree||{}))
    };
    state.categories = Object.keys(state.categoryTree.expense);
    state.incomeCategories = Object.keys(state.categoryTree.income);
  } else {
    syncCategoryTrees();
    for(const [main, subs] of Object.entries(mmPending.expTree||{})){
      state.categoryTree.expense[main] = [...new Set([...(state.categoryTree.expense[main]||[]), ...subs])];
      if(!state.categories.includes(main)) state.categories.push(main);
    }
    for(const [main, subs] of Object.entries(mmPending.incTree||{})){
      state.categoryTree.income[main] = [...new Set([...(state.categoryTree.income[main]||[]), ...subs])];
      if(!state.incomeCategories.includes(main)) state.incomeCategories.push(main);
    }
  }

  const map = new Map(), assetCurMap = new Map(), newAccounts = [];
  for(const i of chosen){
    const a = mmPending.assets[i], name = String(a[1]||'حساب').trim(), currency = String(a[2]||'EGP_EGP');
    const cInfo = detectCurrencyCodeAndRate(currency, mmPending.currencyMap||{});
    if(!cInfo.supported) continue;
    const type = document.querySelector(`.mmtype[data-index="${i}"]`)?.value || mmDefaultType(name,currency);
    if(type === 'skip') continue;
    const existing = state.accounts.find(x=>x.name.trim().toLowerCase()===name.toLowerCase());
    const openingEgp = round2((Number(a[3])||0) * (cInfo.rate || 1));
    const dest = existing || {id:'mm-'+String(a[0]), name, type, opening:openingEgp};
    if(!existing) newAccounts.push(dest);
    map.set(a[0], dest.id);
    assetCurMap.set(a[0], cInfo);
  }

  const txs = [], seenTransferKeys = new Set();
  const existingTxById = new Map(state.transactions.map(x=>[String(x.id), x]));
  const seen = new Set([...state.transactions, ...state.ledger].map(x=>String(x.id)));
  let fxConvertedCount = 0;

  for(const r of mmPending.tx){
    const [uid,asset,to,date,kind,money,content,cat,currency,wdate,txUidTrans,subCtgRaw,catNameRaw] = r;
    if(!map.has(asset)) continue;
    const rawMoney = Math.abs(Number(money)||0);
    if(!rawMoney) continue;

    // 9.1 Check transaction currency (EGP, USD, CNY) and convert using DB rate
    const txCurInfo = detectCurrencyCodeAndRate(currency, mmPending.currencyMap||{});
    const assetCurInfo = assetCurMap.get(asset) || {code:'EGP', rate:1, supported:true};
    const effCur = txCurInfo.supported ? txCurInfo : assetCurInfo;
    if(!effCur.supported) continue;
    const n = round2(rawMoney * (effCur.rate || 1));
    if(effCur.code === 'USD' || effCur.code === 'CNY') fxConvertedCount++;

    let ds = String(wdate||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(ds)){
      const raw=Number(date);
      ds=Number.isFinite(raw)&&raw>100000000000?new Date(raw).toISOString().slice(0,10):String(date).slice(0,10);
    }
    const from = val('mmFrom')||'0000-01-01', dateTo = val('mmTo')||'9999-12-31';
    if(ds < from || ds > dateTo) continue;

    const t = String(kind)==='1'?'expense':String(kind)==='0'?'income':(String(kind)==='3'||String(kind)==='4')?'transfer':null;
    if(!t) continue;

    const transferKey = t==='transfer' ? String(txUidTrans||uid) : '';
    if(t==='transfer' && seenTransferKeys.has(transferKey)) continue;
    if(t==='transfer') seenTransferKeys.add(transferKey);
    if(t==='transfer' && !map.has(to)) continue;

    const rawCatKey = String(cat??'').trim();
    const rawSubKey = String(subCtgRaw??'').trim();
    const rawCatName = String(catNameRaw??'').trim();
    const catObj = rawCatKey ? mmPending.catInfoMap[rawCatKey] : null;
    const subObj = rawSubKey ? mmPending.catInfoMap[rawSubKey] : null;
    const nameObj = rawCatName ? mmPending.catInfoMap[rawCatName] : null;

    const cleanMemo = String(content??'').trim();
    const isMemoUuid = /^[0-9a-f-]{16,}$/i.test(cleanMemo);
    let usableMemo = (cleanMemo && !isMemoUuid) ? cleanMemo : '';
    if(effCur.code === 'USD' || effCur.code === 'CNY'){
      const fxTag = `[${fmt(rawMoney)} ${effCur.code}]`;
      usableMemo = usableMemo ? `${usableMemo} ${fxTag}` : fxTag;
    }

    let mainCat = '';
    let subCat = '';
    if(subObj){
      mainCat = subObj.parentName || (catObj ? (catObj.parentName || catObj.name) : subObj.name);
      subCat = (subObj.name && subObj.name !== mainCat) ? subObj.name : '';
    } else if(catObj){
      mainCat = catObj.parentName || catObj.name;
      subCat = catObj.parentName ? catObj.name : '';
    } else if(nameObj){
      mainCat = nameObj.parentName || nameObj.name;
      subCat = nameObj.parentName ? nameObj.name : '';
    } else if(rawCatName && !/^\d+$/.test(rawCatName) && !/^[0-9a-f-]{16,}$/i.test(rawCatName)){
      mainCat = rawCatName;
    } else if(rawCatKey && !/^\d+$/.test(rawCatKey) && !/^[0-9a-f-]{16,}$/i.test(rawCatKey)){
      mainCat = rawCatKey;
    } else {
      mainCat = 'أخرى';
    }
    const titleText = usableMemo;

    if(t === 'expense' || t === 'income'){
      const targetTree = t === 'income' ? state.categoryTree.income : state.categoryTree.expense;
      const targetList = t === 'income' ? state.incomeCategories : state.categories;
      if(mainCat){
        if(!targetTree[mainCat]) targetTree[mainCat] = [];
        if(!targetList.includes(mainCat)) targetList.push(mainCat);
        if(subCat && !targetTree[mainCat].includes(subCat)){
          targetTree[mainCat].push(subCat);
        }
      }
    }

    const id = t==='transfer' ? 'mm-xfer-'+transferKey : 'mm-'+uid;
    if(seen.has(id)){
      const prev = existingTxById.get(id);
      if(prev && t !== 'transfer'){
        prev.category = mainCat;
        prev.subCategory = subCat;
        prev.amount = n;
        prev.title = titleText;
      }
      continue;
    }
    seen.add(id);

    txs.push({
      id,
      type: t,
      title: titleText,
      category: mainCat,
      subCategory: subCat,
      amount: n,
      date: ds,
      accountId: map.get(asset),
      toAccountId: t==='transfer' ? map.get(to) : null,
      importSource: 'mmbak'
    });
  }

  const netByAcc = {};
  for(const t of txs){
    const n = Number(t.amount)||0;
    if(t.type==='transfer'){
      netByAcc[t.accountId] = (netByAcc[t.accountId]||0) - n;
      netByAcc[t.toAccountId] = (netByAcc[t.toAccountId]||0) + n;
    } else if(t.type==='income'){
      netByAcc[t.accountId] = (netByAcc[t.accountId]||0) + n;
    } else if(t.type==='expense'){
      netByAcc[t.accountId] = (netByAcc[t.accountId]||0) - n;
    }
  }
  for(const a of newAccounts){
    a.opening = round2((Number(a.opening)||0) - (netByAcc[a.id]||0));
  }

  state.accounts.push(...newAccounts);
  state.transactions.push(...txs.filter(x=>x.type!=='transfer'));
  state.ledger.push(...txs.filter(x=>x.type==='transfer').map(x=>({id:x.id,type:'transfer',from:x.accountId,to:x.toAccountId,amount:x.amount,fee:0,date:x.date,note:x.title})));

  mmPending = null;
  persist();
  document.getElementById('mmbakPreview').innerHTML = `<div class="hint" style="color:var(--mint)">✓ تم استيراد <b>${newAccounts.length}</b> حساب و<b>${txs.length}</b> حركة (منها <b>${fxConvertedCount}</b> حركة محولة من USD/CNY إلى EGP)!</div>`;
  toast('تم الاستيراد بنجاح ✓');
}


/* =========================================================
   SECTION 5 & 6: ACCOUNTS TAB & CREDIT CARDS TAB
   - 5.3 Spacious 3-button row on accounts: كشف حساب | تعديل | حذف
   - 6.2 & 6.3 Credit Cards: Green hero card, Add Card button, Registered Cards (hide details until tapped; show Limit/Available/Due row + Statement/Edit/Delete row)
   - 6.3.5 Card Statement (كشف حساب البطاقة)
   - 6.4 & 6.6.2 Edit Card & Card Op Installment System with prompt:
     (المعاملات الجديدة فقط vs المعاملات الجديدة والحالية)
   ========================================================= */
function addAccount(){
  let name = val('accName').trim(), opening = num('accOpening');
  if(!name) return toast('اكتب اسم الحساب');
  state.accounts.push({id:'acc-'+Date.now(), name, type:val('accType'), opening});
  persist(); setv('accName',''); setv('accOpening','');
  document.getElementById('addAccountFold')?.removeAttribute('open');
  toast('تمت إضافة الحساب ✓');
}
function deleteAccount(id){
  showAppConfirm('حذف الحساب', 'هل تريد حذف هذا الحساب؟', ()=>{
    state.accounts = state.accounts.filter(a=>a.id!==id);
    persist(); toast('تم حذف الحساب');
  }, true);
}
function closeAccountModal(){
  document.getElementById('accountModal').classList.remove('show');
}
function openAccountStatement(id, filterYM){
  const acc = state.accounts.find(a=>a.id===id);
  if(!acc) return;
  const ym = filterYM || '';
  document.getElementById('accModalTitle').textContent = 'كشف حساب: ' + acc.name;
  const rows = [];
  if(Number(acc.opening) && !ym){
    rows.push({date:'', title:'الرصيد الافتتاحي', cat:'', delta:Number(acc.opening)});
  }
  state.transactions.filter(t=>t.accountId===id && (!ym || monthKey(t.date)===ym)).forEach(t=>{
    const d = (t.type==='income'||t.type==='fund') ? (Number(t.amount)||0) : -(Number(t.amount)||0);
    const cLbl = t.subCategory ? `${t.category} / ${t.subCategory}` : (t.category||'');
    rows.push({date:t.date, title:t.title||cLbl, cat:cLbl, delta:d});
  });
  state.ledger.forEach(l=>{
    if(ym && monthKey(l.date)!==ym) return;
    if(l.type==='adjust' && l.from===id){
      rows.push({date:l.date, title:l.note||'تسوية رصيد', cat:'تسوية', delta:Number(l.delta??l.amount)||0});
    } else if(l.from===id){
      const toN = state.accounts.find(x=>x.id===l.to)?.name || 'حساب';
      const totOut = (Number(l.amount)||0) + (Number(l.fee)||0);
      rows.push({date:l.date, title:'تحويل إلى ' + toN + ((Number(l.fee)||0)>0 ? ` (شامل رسوم ${fmt(l.fee)})` : ''), cat:'تحويل', delta:-totOut});
    } else if(l.to===id){
      const fromN = state.accounts.find(x=>x.id===l.from)?.name || 'حساب';
      rows.push({date:l.date, title:'تحويل من ' + fromN, cat:'تحويل', delta:Number(l.amount)||0});
    }
  });
  rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const bal = accountBalance(acc);

  const allMonths = [...new Set([
    ...state.transactions.filter(t=>t.accountId===id).map(t=>monthKey(t.date)),
    ...state.ledger.filter(l=>l.from===id||l.to===id).map(l=>monthKey(l.date))
  ].filter(Boolean))].sort().reverse();

  const filterOpts = `<option value="">كل الحركات (${rows.length})</option>` + allMonths.map(m=>`<option value="${m}" ${ym===m?'selected':''}>${formatYMArabic(m)}</option>`).join('');

  const listHtml = rows.length ? rows.map(r=>`
    <div class="rowline" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="min-width:0;flex:1">
        <b style="display:block;font-size:.76rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</b>
        <small style="color:var(--muted)">${esc(r.date||'افتتاحي')}${r.cat?' · '+esc(r.cat):''}</small>
      </div>
      <strong class="${r.delta>=0?'blue':'red'}" style="direction:ltr;margin-left:8px">${r.delta>=0?'+':''}${fmt(r.delta)}</strong>
    </div>
  `).join('') : '<div class="empty">لا توجد حركات مسجلة في هذه الفترة.</div>';

  document.getElementById('accModalBody').innerHTML = `
    <div class="hero" style="padding:13px;margin-bottom:10px;min-height:74px">
      <label>الرصيد الحالي الكلي</label>
      <div class="amount" style="font-size:1.4rem">${egp(bal)}</div>
    </div>
    <div class="c-row" style="margin-bottom:8px;min-height:40px">
      <label>فلترة الفترة</label>
      <select onchange="openAccountStatement('${acc.id}', this.value)">${filterOpts}</select>
    </div>
    <div style="max-height:330px;overflow-y:auto;padding-left:2px">${listHtml}</div>
    <div class="actions"><button type="button" class="secondary" onclick="closeAccountModal()">إغلاق</button></div>
  `;
  document.getElementById('accountModal').classList.add('show');
}

/* 6.3.5 Card Statement Modal (كشف حساب البطاقة) */
function openCardStatement(cardId, filterYM){
  const card = state.cards.find(c=>c.id===cardId);
  if(!card) return;
  const ym = filterYM || '';
  document.getElementById('accModalTitle').textContent = 'كشف حساب بطاقة: ' + card.name;

  const ops = (state.cardOps||[]).filter(o=>o.cardId===cardId && (!ym || monthKey(o.date)===ym || o.purchaseMonth===ym));
  const pays = (state.cardPayments||[]).filter(p=>p.cardId===cardId && (!ym || monthKey(p.date)===ym));

  const rows = [
    ...ops.map(o=>({
      date: o.date || (o.purchaseMonth ? o.purchaseMonth+'-01' : ''),
      title: o.title,
      cat: o.type==='installment' ? `تقسيط ${o.months} شهر (القسط: ${fmt(o.installment)})` : 'شراء بالبطاقة',
      delta: -(Number(o.total||o.amount)||0)
    })),
    ...pays.map(p=>({
      date: p.date || '',
      title: 'سداد بطاقة',
      cat: 'سداد',
      delta: +(Number(p.amount)||0)
    }))
  ].sort((a,b)=>String(b.date).localeCompare(String(a.date)));

  const usedDebt = cardTotalOutstanding(card);
  const avail = cardCurrentAvailable(card);

  const allMonths = [...new Set([
    ...(state.cardOps||[]).filter(o=>o.cardId===cardId).map(o=>monthKey(o.date)||o.purchaseMonth),
    ...(state.cardPayments||[]).filter(p=>p.cardId===cardId).map(p=>monthKey(p.date))
  ].filter(Boolean))].sort().reverse();

  const filterOpts = `<option value="">كل العمليات (${rows.length})</option>` + allMonths.map(m=>`<option value="${m}" ${ym===m?'selected':''}>${formatYMArabic(m)}</option>`).join('');

  const listHtml = rows.length ? rows.map(r=>`
    <div class="rowline" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="min-width:0;flex:1">
        <b style="display:block;font-size:.76rem;color:var(--text)">${esc(r.title)}</b>
        <small style="color:var(--muted)">${esc(r.date)} · ${esc(r.cat)}</small>
      </div>
      <strong class="${r.delta>=0?'mint':'orange'}" style="direction:ltr;margin-left:8px">${r.delta>=0?'+':''}${fmt(r.delta)} EGP</strong>
    </div>
  `).join('') : '<div class="empty">لا توجد عمليات مسجلة على هذه البطاقة.</div>';

  document.getElementById('accModalBody').innerHTML = `
    <div class="hero" style="padding:13px;margin-bottom:10px;min-height:74px">
      <label>المستخدم حالياً: ${egp(usedDebt)} | المتاح: ${egp(avail)}</label>
      <div class="amount" style="font-size:1.3rem">الحد الائتماني: ${egp(card.limit||0)}</div>
    </div>
    <div class="c-row" style="margin-bottom:8px;min-height:40px">
      <label>فلترة الفترة</label>
      <select onchange="openCardStatement('${card.id}', this.value)">${filterOpts}</select>
    </div>
    <div style="max-height:330px;overflow-y:auto;padding-left:2px">${listHtml}</div>
    <div class="actions"><button type="button" class="secondary" onclick="closeAccountModal()">إغلاق</button></div>
  `;
  document.getElementById('accountModal').classList.add('show');
}

function openEditAccountModal(id){
  const acc = state.accounts.find(a=>a.id===id);
  if(!acc) return;
  const curBal = accountBalance(acc);
  document.getElementById('accModalTitle').textContent = 'تعديل الحساب: ' + acc.name;
  document.getElementById('accModalBody').innerHTML = `
    <div class="c-list">
      <div class="c-row"><label>اسم الحساب</label><input id="editAccName" value="${esc(acc.name)}"></div>
      <div class="c-row"><label>النوع</label>
        <select id="editAccType">
          <option value="cash" ${acc.type==='cash'?'selected':''}>كاش</option>
          <option value="bank" ${acc.type==='bank'?'selected':''}>حساب بنكي</option>
          <option value="wallet" ${acc.type==='wallet'?'selected':''}>محفظة إلكترونية</option>
          <option value="prepaid" ${acc.type==='prepaid'?'selected':''}>بطاقة مسبقة الدفع</option>
        </select>
      </div>
      <div class="c-row"><label>الرصيد الحالي</label><input id="editAccCurBal" type="number" step="0.01" value="${curBal}"></div>
    </div>
    <p class="hint">عند تغيير الرصيد الحالي سيتم إضافة حركة تسوية تلقائية لضبط الرصيد.</p>
    <div class="actions">
      <button type="button" class="primary" onclick="saveEditedAccount('${acc.id}')">حفظ التعديل</button>
      <button type="button" class="secondary" onclick="closeAccountModal()">إلغاء</button>
    </div>
  `;
  document.getElementById('accountModal').classList.add('show');
}
function saveEditedAccount(id){
  const acc = state.accounts.find(a=>a.id===id);
  if(!acc) return;
  const newName = val('editAccName').trim();
  if(!newName) return toast('اكتب اسم الحساب');
  const oldBal = accountBalance(acc);
  const newBal = num('editAccCurBal');
  const diff = round2(newBal - oldBal);
  acc.name = newName;
  acc.type = val('editAccType') || acc.type;
  if(Math.abs(diff) >= 0.01){
    state.ledger.push({
      id: 'adj-' + Date.now(),
      type: 'adjust',
      from: acc.id,
      delta: diff,
      amount: Math.abs(diff),
      note: 'تسوية رصيد الحساب',
      date: today()
    });
  }
  persist();
  closeAccountModal();
  toast('تم تعديل الحساب ✓');
}

function renderAccountsAndCards(){
  const total = allAccountsAvailable();
  document.getElementById('accountsTotal').textContent = maskable(egpSmart(total));
  document.getElementById('accountsList').innerHTML = state.accounts.length ? state.accounts.map(a=>`
    <div class="listitem" onclick="toggleItemActions(this,event)">
      <div class="info">
        <b>${esc(a.name)}</b>
        <small>${({cash:'كاش',bank:'حساب بنكي',wallet:'محفظة إلكترونية',prepaid:'بطاقة مسبقة الدفع'})[a.type]||a.type}</small>
      </div>
      <strong>${maskable(egpSmart(accountBalance(a)))}</strong>
      <div class="tap-actions">
        <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="openAccountStatement('${a.id}')">كشف حساب</button>
        <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditAccountModal('${a.id}')">تعديل</button>
        <button type="button" class="smallbtn danger" onclick="deleteAccount('${a.id}')">حذف</button>
      </div>
    </div>
  `).join('') : '<div class="empty">لا توجد حسابات مسجلة.</div>';

  // 6.2 & 6.3 Credit Cards Tab
  const debt = allCardsOutstanding();
  document.getElementById('cardDebtTotal').textContent = maskable(egpSmart(debt));

  const cardOpts = state.cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('') || '<option value="">لا توجد بطاقة</option>';
  const opCardEl = document.getElementById('opCard');
  if(opCardEl) opCardEl.innerHTML = cardOpts;

  // 6.3.1 Hide Limit, Available, and Due Amount from primary collapsed view; show on tap in .card-detail-strip + .tap-actions
  document.getElementById('cardsList').innerHTML = state.cards.length ? state.cards.map(c=>{
    const d = cardTotalOutstanding(c);
    const av = cardCurrentAvailable(c);
    const lim = Number(c.limit)||0;
    const bankRuleLabel = isSuezCanalBankCard(c) ? 'نظام قناة السويس' : 'نظام عادي';
    return `<div class="listitem" onclick="toggleItemActions(this,event)">
      <div class="info">
        <b>${esc(c.name)}</b>
        <small>يوم السداد: يوم ${c.payDay||3} · ${bankRuleLabel}</small>
      </div>
      <span class="tag" style="margin-left:auto">اضغط للتفاصيل ▾</span>
      <div class="card-detail-strip">
        <div><small>الحد الائتماني</small><b class="blue">${maskable(egp(lim))}</b></div>
        <div><small>المتاح</small><b class="mint">${maskable(egp(av))}</b></div>
        <div><small>المبلغ المستحق للسداد</small><b class="orange">${maskable(egp(d))}</b></div>
      </div>
      <div class="tap-actions">
        <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="openCardStatement('${c.id}')">كشف حساب</button>
        <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditCardModal('${c.id}')">تعديل</button>
        <button type="button" class="smallbtn danger" onclick="deleteCard('${c.id}')">حذف</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty">لا توجد بطاقات مسجلة.</div>';

  // 6.6 All Card Operations (Original & Copied)
  const sortedOps = [...(state.cardOps||[])].sort((a,b)=>String(b.date||b.purchaseMonth||'').localeCompare(String(a.date||a.purchaseMonth||'')));
  document.getElementById('cardOpsList').innerHTML = sortedOps.length ? sortedOps.map(o=>{
    const cName = state.cards.find(x=>x.id===o.cardId)?.name || 'بطاقة';
    const rem = opOutstanding(o);
    const firstM = o.schedules?.[0]?.month || '';
    return `<div class="listitem" onclick="toggleItemActions(this,event)">
      <div class="info">
        <b>${esc(o.title)} <span class="tag">${esc(cName)} · ${o.type==='installment'?'تقسيط '+o.months+'ش':'شراء'}</span></b>
        <small>الشراء: ${esc(o.purchaseMonth||monthKey(o.date))} ${firstM?`· أول قسط: ${formatYMArabic(firstM)}`:''} · الإجمالي: ${egp(o.total||o.amount||0)}</small>
      </div>
      <strong class="${rem>0?'orange':'mint'}">${maskable(egp(rem))}</strong>
      <div class="tap-actions" style="grid-template-columns:1fr 1fr">
        <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditCardOpModal('${o.id}')">تعديل</button>
        <button type="button" class="smallbtn danger" onclick="deleteCardOp('${o.id}')">حذف</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty">لا توجد عمليات مسجلة للبطاقات.</div>';
}

function recalculateInstallmentOpWithTerms(op, card, monthlyRateDecimal, adminRateDecimal){
  if(op.type !== 'installment') return;
  const amount = Number(op.amount)||0;
  const months = Number(op.months)||12;
  const interest = round2(amount * monthlyRateDecimal * months);
  const fee = round2(amount * adminRateDecimal);
  const base = round2((amount + interest) / months);
  const purchaseYM = op.purchaseMonth || String(op.date||today()).slice(0,7);
  const oldPaidByMonth = {};
  (op.schedules||[]).forEach(sc=>{ oldPaidByMonth[sc.month] = Number(sc.paid)||0; });
  const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, base, fee);
  op.purchaseMonth = purchaseYM;
  op.interest = interest;
  op.adminFee = fee;
  op.installment = base;
  op.total = round2(amount + interest + fee);
  op.feeMonth = built.feeYM;
  op.feeDue = fee;
  op.schedules = built.schedules.map(sc=>({
    ...sc,
    paid: Math.min(sc.amount, oldPaidByMonth[sc.month]||0)
  }));
}

/* 6.4 Edit Card + Installment System with Prompt: الجديدة فقط vs الجديدة والحالية */
function openEditCardModal(cardId){
  const card = state.cards.find(c=>c.id===cardId);
  if(!card) return;
  const curAvail = cardCurrentAvailable(card);
  const terms = card.terms || {};
  const termMonths = [3,6,9,12,18,24];
  const termsRowsHtml = termMonths.map(m=>{
    const t = terms[m] || {monthlyRate:0, adminRate:0};
    const irPct = round2((Number(t.monthlyRate)||0) * 100);
    const feePct = round2((Number(t.adminRate)||0) * 100);
    return `<div class="c-row" style="min-height:38px;padding:4px 8px">
      <label>${m} شهر (فائدة / رسوم %)</label>
      <div style="display:flex;gap:5px;width:60%">
        <input id="edIr${m}" type="number" step="0.01" value="${irPct}" style="width:50%">
        <input id="edFee${m}" type="number" step="0.01" value="${feePct}" style="width:50%">
      </div>
    </div>`;
  }).join('');

  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>اسم البطاقة</label><input id="edCardName" value="${esc(card.name)}"></div>
      <div class="c-row"><label>الحد الائتماني</label><input id="edCardLimit" type="number" step="0.01" value="${Number(card.limit)||0}"></div>
      <div class="c-row"><label>الرصيد المتاح</label><input id="edCardAvail" type="number" step="0.01" value="${curAvail}"></div>
      <div class="c-row"><label>يوم السداد</label><input id="edCardPayDay" type="number" min="1" max="28" value="${card.payDay||3}"></div>
    </div>
    <details class="fold" style="margin-top:8px" open>
      <summary><span>تعديل نظام التقسيط للبطاقة (%)</span><span>▼</span></summary>
      <div class="fold-body"><div class="c-list">${termsRowsHtml}</div></div>
    </details>
  `;

  showAppCustomForm('تعديل البطاقة: ' + card.name, formHtml, ()=>{
    const nm = val('edCardName').trim();
    const lim = num('edCardLimit');
    const av = num('edCardAvail');
    if(!nm || lim <= 0){ toast('أكمل اسم البطاقة والحد الائتماني'); return false; }

    const newTerms = {...(card.terms||{})};
    let termsChanged = false;
    termMonths.forEach(m=>{
      const oldT = (card.terms||{})[m] || {monthlyRate:0, adminRate:0};
      const newIr = round2(num('edIr'+m)/100);
      const newFee = round2(num('edFee'+m)/100);
      if(Math.abs(newIr - (oldT.monthlyRate||0)) > 0.00001 || Math.abs(newFee - (oldT.adminRate||0)) > 0.00001){
        termsChanged = true;
      }
      newTerms[m] = { monthlyRate: newIr, adminRate: newFee };
    });

    const hasExistingInstOps = state.cardOps.some(o=>o.cardId===card.id && o.type==='installment');
    card.name = nm;
    card.limit = lim;
    card.payDay = num('edCardPayDay') || 3;
    const opsOut = cardOpsOutstandingFor(card.id);
    card.balance = round2(Math.max(0, lim - av - opsOut));
    card.terms = newTerms;

    if(termsChanged && hasExistingInstOps){
      setTimeout(()=>{
        const askHtml = `
          <p class="hint" style="margin:0 0 12px;font-size:.8rem;color:var(--text)">تم تغيير نظام التقسيط للبطاقة. هل تريد تطبيق التعديل على:</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="primary" onclick="applyCardTermsScope('${card.id}', 'new_only')">المعاملات الجديدة فقط</button>
            <button type="button" class="secondary" style="border-color:var(--mint);color:var(--mint)" onclick="applyCardTermsScope('${card.id}', 'all')">المعاملات الجديدة والحالية (إعادة احتساب الأقساط)</button>
          </div>
        `;
        showAppCustomForm('نطاق تطبيق نظام التقسيط', askHtml, null, true);
      }, 80);
      return true;
    }

    syncCardInstallmentsToCommitments();
    persist();
    toast('تم تعديل البطاقة ✓');
    return true;
  });
}

function applyCardTermsScope(cardId, scope){
  const card = state.cards.find(c=>c.id===cardId);
  if(card && scope === 'all'){
    state.cardOps.filter(o=>o.cardId===cardId && o.type==='installment').forEach(op=>{
      const m = Number(op.months)||12;
      const trm = (card.terms||{})[m] || {monthlyRate:0, adminRate:0};
      recalculateInstallmentOpWithTerms(op, card, trm.monthlyRate||0, trm.adminRate||0);
    });
  }
  syncCardInstallmentsToCommitments();
  closeAppDialog();
  persist();
  toast(scope === 'all' ? 'تم تطبيق نظام التقسيط على المعاملات الجديدة والحالية ✓' : 'تم حفظ النظام للمعاملات الجديدة فقط ✓');
}

function deleteCard(cardId){
  showAppConfirm('حذف البطاقة', 'هل تريد حذف هذه البطاقة وجميع عملياتها المسجلة؟', ()=>{
    const opIds = new Set(state.cardOps.filter(o=>o.cardId===cardId).map(o=>o.id));
    state.cards = state.cards.filter(c=>c.id!==cardId);
    state.cardOps = state.cardOps.filter(o=>o.cardId!==cardId);
    state.transactions = state.transactions.filter(t=>!t.source || ![...opIds].some(id=>t.source==='card-purchase:'+id));
    syncCardInstallmentsToCommitments();
    persist();
    toast('تم حذف البطاقة ✓');
  }, true);
}

/* 6.6.2 Edit Card Operation + Option to Edit Installment System (New Only vs New & Current) */
function openEditCardOpModal(opId){
  const op = state.cardOps.find(o=>o.id===opId);
  if(!op) return;
  const card = state.cards.find(c=>c.id===op.cardId);
  const isInst = op.type === 'installment';
  const curMonths = Number(op.months)||12;
  const curTerm = (card?.terms||{})[curMonths] || {monthlyRate:0, adminRate:0};
  const curIrPct = op.amount && curMonths ? round2(((Number(op.interest)||0) / (Number(op.amount) * curMonths)) * 100) : round2((curTerm.monthlyRate||0)*100);
  const curFeePct = op.amount ? round2(((Number(op.adminFee)||0) / Number(op.amount)) * 100) : round2((curTerm.adminRate||0)*100);

  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>وصف العملية</label><input id="edOpTitle" value="${esc(op.title)}"></div>
      <div class="c-row"><label>المبلغ الأصلي</label><input id="edOpAmount" type="number" step="0.01" value="${Number(op.amount)||0}"></div>
      <div class="c-row"><label>شهر الشراء</label><input id="edOpPurchaseYM" type="month" value="${esc(op.purchaseMonth || monthKey(op.date) || selected())}"></div>
      ${isInst ? `
        <div class="c-row"><label>مدة التقسيط</label>
          <select id="edOpMonths">
            ${[3,6,9,12,15,18,24,36].map(m=>`<option value="${m}" ${curMonths===m?'selected':''}>${m} شهر</option>`).join('')}
          </select>
        </div>
        <div class="c-row"><label>الفائدة الشهرية %</label><input id="edOpIrPct" type="number" step="0.01" value="${curIrPct}"></div>
        <div class="c-row"><label>الرسوم الإدارية %</label><input id="edOpFeePct" type="number" step="0.01" value="${curFeePct}"></div>
        <div class="c-row"><label>تطبيق نظام التقسيط</label>
          <select id="edOpTermScope">
            <option value="current_and_new">المعاملات الجديدة والحالية</option>
            <option value="new_only">المعاملات الجديدة فقط (مع بقاء هذه العملية كما هي)</option>
          </select>
        </div>
      ` : ''}
    </div>
  `;
  showAppCustomForm('تعديل عملية البطاقة', formHtml, ()=>{
    const title = val('edOpTitle').trim();
    const amount = num('edOpAmount');
    const pYM = val('edOpPurchaseYM') || op.purchaseMonth || selected();
    if(!title || amount <= 0){ toast('أدخل الوصف والمبلغ بشكل صحيح'); return false; }

    op.title = title;
    op.amount = amount;
    op.purchaseMonth = pYM;
    op.date = pYM + '-' + (String(op.date||'01').slice(8,10) || '01');
    op.dueDate = card ? dueDateFor(card, op.date) : op.dueDate;

    if(isInst){
      const months = num('edOpMonths') || 12;
      const irDec = round2(num('edOpIrPct') / 100);
      const feeDec = round2(num('edOpFeePct') / 100);
      const scope = val('edOpTermScope') || 'current_and_new';
      op.months = months;

      if(card){
        card.terms = card.terms || {};
        card.terms[months] = { monthlyRate: irDec, adminRate: feeDec };
      }

      if(scope === 'current_and_new'){
        recalculateInstallmentOpWithTerms(op, card, irDec, feeDec);
        // Also update any other active operations on the same card with the same months duration if user selected New & Current
        if(card){
          state.cardOps.filter(o=>o.cardId===card.id && o.id!==op.id && o.type==='installment' && Number(o.months)===months).forEach(otherOp=>{
            recalculateInstallmentOpWithTerms(otherOp, card, irDec, feeDec);
          });
        }
      } else {
        // 'new_only': only update if amount/purchaseMonth changed using old rate
        const oldRate = curIrPct / 100;
        const oldFee = curFeePct / 100;
        recalculateInstallmentOpWithTerms(op, card, oldRate, oldFee);
      }
    }

    const linkedTx = state.transactions.find(tx=>tx.source==='card-purchase:'+op.id);
    if(linkedTx){
      linkedTx.title = 'شراء بالبطاقة - ' + title;
      linkedTx.amount = amount;
      linkedTx.date = op.date;
    }
    syncCardInstallmentsToCommitments();
    persist();
    toast('تم حفظ التعديلات وإعادة الحساب ✓');
    return true;
  });
}

function deleteCardOp(opId){
  showAppConfirm('حذف عملية البطاقة', 'هل تريد حذف هذه العملية وإلغاء أقساطها المرتبطة؟', ()=>{
    state.cardOps = state.cardOps.filter(o=>o.id!==opId);
    state.transactions = state.transactions.filter(t=>t.source!=='card-purchase:'+opId);
    syncCardInstallmentsToCommitments();
    persist();
    toast('تم حذف العملية ✓');
  }, true);
}

function applyKnownBankTerms(){
  let n = val('cardName').trim().toLowerCase();
  if(n.includes('qnb')){ [3,6,12].forEach(m=>setv('ir'+m,2.18)); [18,24].forEach(m=>setv('ir'+m,1.98)); }
}
function addCard(){
  let name = val('cardName').trim(); if(!name) return toast('اكتب اسم البطاقة');
  const limit = num('cardLimit'), available = num('cardAvailable');
  if(limit<=0) return toast('أدخل الحد الائتماني');
  let terms={}; [3,6,9,12,15,18,24,36].forEach(n=>terms[n]={monthlyRate:round2(num('ir'+n)/100), adminRate:round2(num('fee'+n)/100)});
  state.cards.push({id:'card-'+Date.now(), name, payDay:num('cardPayDay')||3, limit, balance:round2(Math.max(0,limit-available)), terms});
  persist(); setv('cardName',''); setv('cardLimit',''); setv('cardAvailable','');
  document.getElementById('addCardFold')?.removeAttribute('open');
  toast('تم حفظ البطاقة ✓');
}
function dueDateFor(card,date){
  let d=new Date(date+'T12:00:00'), y=d.getFullYear(), m=d.getMonth()+1, day=card.payDay||3;
  let due=new Date(y,m,day);
  return due.getFullYear()+'-'+String(due.getMonth()+1).padStart(2,'0')+'-'+String(due.getDate()).padStart(2,'0');
}


/* =========================================================
   SECTION 7: COMMITMENTS PAGE (الالتزامات)
   - 3 Types of Commitments:
     1) مستحقات مؤجلة (deferred / once)
     2) التزامات شهرية (monthly with auto-calculated End Month)
     3) معاملات بالبطاقة (card_op with purchaseMonth only & Suez Canal Bank vs Regular Bank rule)
   - Unified Monthly Dues section (مستحقات الشهر)
   - Single-indicator Green Hero Card (إجمالي التزامات الشهر)
   ========================================================= */
function setCommitmentAddKind(kind){
  setv('comAddKind', kind);
  document.getElementById('comKindTabDef')?.classList.toggle('active', kind==='deferred');
  document.getElementById('comKindTabMon')?.classList.toggle('active', kind==='monthly');
  document.getElementById('comKindTabCard')?.classList.toggle('active', kind==='card');

  document.getElementById('comFormDeferred').style.display = kind==='deferred' ? 'flex' : 'none';
  document.getElementById('comFormMonthly').style.display = kind==='monthly' ? 'flex' : 'none';
  document.getElementById('comFormCard').style.display = kind==='card' ? 'flex' : 'none';

  if(kind === 'monthly') recalcMonthlyCommitmentEnd();
  if(kind === 'card') showCreditQuote();
}

function recalcMonthlyCommitmentEnd(){
  const startYM = val('comStartVal') || selected();
  const dur = Math.max(1, Math.round(num('monDuration') || 12));
  const endYM = addMonthsYM(startYM, dur - 1);
  setv('comEndVal', endYM);
  setv('comEndAutoLabel', `${formatYMArabic(endYM)} (${dur} شهر)`);
}

function setCardOpType(t){
  setv('opType', t);
  document.getElementById('segOpSwipe')?.classList.toggle('active', t==='swipe');
  document.getElementById('segOpInst')?.classList.toggle('active', t==='installment');
  document.querySelectorAll('.installment-only').forEach(e=>e.style.display = t==='installment' ? 'flex' : 'none');
  showCreditQuote();
}

function openCardOpPurchasePicker(){
  openCompactYMPicker('opPurchase', false, ()=>{
    showCreditQuote();
  });
}

function showCreditQuote(){
  const el = document.getElementById('creditQuote'); if(!el) return;
  const card = state.cards.find(c=>c.id===val('opCard')), amount = num('opAmount'), months = num('opMonths')||12;
  if(!card || !amount || val('opType')!=='installment'){
    el.innerHTML='<div class="empty">أدخل المبلغ لعرض القسط وتاريخ البدء حسب البنك.</div>';
    return;
  }
  const t = (card.terms||{})[months] || {monthlyRate:0, adminRate:0};
  const interest = round2(amount * t.monthlyRate * months), fee = round2(amount * t.adminRate), base = round2((amount + interest)/months);
  const purchaseYM = val('opPurchaseVal') || selected();
  const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, base, fee);
  const isSuez = isSuezCanalBankCard(card);
  el.innerHTML = `
    <div class="rowline"><span>نظام البنك (${esc(card.name)})</span><b class="mint">${isSuez ? 'قناة السويس (رسوم ثم قسط)' : 'بنك عادي (الشهر التالي لشهر الشراء)'}</b></div>
    <div class="rowline"><span>القسط الشهري (يبدأ ${formatYMArabic(built.firstInstYM)})</span><b>${fmt(base)} EGP</b></div>
    ${fee > 0 || isSuez ? `<div class="rowline"><span>الرسوم الإدارية (${formatYMArabic(built.feeYM)})</span><b>${fmt(fee)} EGP</b></div>` : ''}
  `;
}

function addCardOperation(){
  let card=state.cards.find(c=>c.id===val('opCard')), type=val('opType')||'installment', amount=num('opAmount'), title=val('opTitle').trim();
  const purchaseYM = val('opPurchaseVal') || selected();
  const date = purchaseYM + '-01';
  if(!card||!amount||!title) return toast('أكمل بيانات البطاقة والوصف والمبلغ');
  const nowTs = Date.now();
  let op={id:'op-'+nowTs, cardId:card.id, type, title, amount, date, purchaseMonth:purchaseYM, paid:0, dueDate:dueDateFor(card,date), createdAt:nowTs};
  if(type==='installment'){
    const months = num('opMonths')||12, t = (card.terms||{})[months]||{monthlyRate:0,adminRate:0};
    const interest = round2(amount*t.monthlyRate*months), fee = round2(amount*t.adminRate), base = round2((amount+interest)/months);
    const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, base, fee);
    op.months=months; op.interest=interest; op.adminFee=fee; op.installment=base; op.total=round2(amount+interest+fee);
    op.feeMonth=built.feeYM; op.feeDue=fee; op.feePaid=0;
    op.schedules=built.schedules;
  }
  state.cardOps.push(op);
  state.transactions.push({id:'card-purchase-'+op.id, type:'card_purchase', title:'شراء بالبطاقة - '+title, category:'مشتريات بطاقة', amount, date, accountId:null, source:'card-purchase:'+op.id, createdAt:nowTs});
  if(type==='installment') syncCardInstallmentsToCommitments();
  persist(); setv('opTitle',''); setv('opAmount','');
  document.getElementById('addCommitmentFold')?.removeAttribute('open');
  toast('تم تسجيل عملية البطاقة وإدراجها في مستحقات الشهر ✓');
}

function saveNewCommitmentItem(){
  const kind = val('comAddKind') || 'deferred';
  if(kind === 'deferred'){
    const title = val('defTitle').trim();
    const amount = num('defAmount');
    const dueDate = val('defDueDate') || today();
    const note = val('defNote').trim();
    if(!title || amount <= 0) return toast('أدخل اسم العملية والمبلغ');
    state.commitments.push({
      id: 'com-' + Date.now(),
      title,
      type: 'مستحقات مؤجلة',
      freq: 'once',
      amount,
      start: dueDate.slice(0,7),
      end: dueDate.slice(0,7),
      dueDate,
      note
    });
    setv('defTitle',''); setv('defAmount',''); setv('defNote','');
    document.getElementById('addCommitmentFold')?.removeAttribute('open');
    persist(); toast('تم حفظ المستحق المؤجل ✓');
    return;
  }
  if(kind === 'monthly'){
    const title = val('monTitle').trim();
    const amount = num('monAmount');
    const dur = Math.max(1, Math.round(num('monDuration') || 12));
    const startYM = val('comStartVal') || selected();
    const endYM = addMonthsYM(startYM, dur - 1);
    const note = val('monNote').trim();
    if(!title || amount <= 0) return toast('أدخل اسم الالتزام والمبلغ الشهري');
    state.commitments.push({
      id: 'com-' + Date.now(),
      title,
      type: 'التزامات شهرية',
      freq: 'monthly',
      durationMonths: dur,
      amount,
      start: startYM,
      end: endYM,
      day: 1,
      note
    });
    setv('monTitle',''); setv('monAmount',''); setv('monNote','');
    document.getElementById('addCommitmentFold')?.removeAttribute('open');
    persist(); toast('تم حفظ الالتزام الشهري ✓');
  }
}

function syncCardInstallmentsToCommitments(){
  const validOpIds = new Set((state.cardOps||[]).filter(o=>o.type==='installment').map(o=>o.id));
  state.commitments = (state.commitments||[]).filter(c => !c.cardOpId || validOpIds.has(c.cardOpId));
  for(const op of (state.cardOps||[])){
    if(op.type !== 'installment') continue;
    const cName = state.cards.find(c=>c.id===op.cardId)?.name || 'بطاقة';
    const comId = 'com-cardop-' + op.id;
    const firstM = op.schedules?.[0]?.month || op.feeMonth || String(op.date||'').slice(0,7);
    const lastM = op.schedules?.[op.schedules.length-1]?.month || firstM;
    const existing = state.commitments.find(c=>c.id===comId);
    if(!existing){
      state.commitments.push({id:comId, cardOpId:op.id, title:`${op.title} (${cName})`, type:'معاملات بالبطاقة', freq:'monthly', amount:round2(Number(op.installment)||0), start:firstM, end:lastM, day:3});
    } else {
      existing.title = `${op.title} (${cName})`;
      existing.type = 'معاملات بالبطاقة';
      existing.amount = round2(Number(op.installment)||0);
      existing.start = firstM;
      existing.end = lastM;
    }
  }
}

/* 7.6 Unified Monthly Dues Gatherer (مستحقات مؤجلة + التزامات شهرية + أقساط ورسوم ومشتريات البطاقات) */
function getUnifiedMonthlyDues(m){
  syncCardInstallmentsToCommitments();
  const items = [];
  let totalDue = 0;

  // 1) Deferred Dues (مستحقات مؤجلة) due in month m
  const deferredList = (state.commitments||[]).filter(c => c.freq === 'once' && ((c.dueDate && String(c.dueDate).slice(0,7) === m) || (!c.dueDate && c.start === m)));
  for(const c of deferredList){
    const amt = round2(Number(c.amount)||0);
    const paid = round2((state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0));
    const rem = round2(Math.max(0, amt - paid));
    totalDue = round2(totalDue + amt);
    items.push({
      uid: c.id,
      kind: 'commitment',
      categoryType: 'مستحقات مؤجلة',
      title: c.title,
      sub: c.dueDate ? `تاريخ الاستحقاق: ${c.dueDate}${c.note?' · '+c.note:''}` : (c.note||'مستحق مؤجل'),
      amount: amt,
      paid,
      remaining: rem
    });
  }

  // 2) Monthly Commitments (التزامات شهرية - excluding auto-synced cardOp commitments which we pull directly with full detail below)
  const monthlyList = (state.commitments||[]).filter(c => (c.freq||'monthly') === 'monthly' && !c.cardOpId && commitmentDue(c, m));
  for(const c of monthlyList){
    const amt = round2(Number(c.amount)||0);
    const paid = round2((state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id && p.month===m).reduce((s,p)=>s+(Number(p.amount)||0),0));
    const rem = round2(Math.max(0, amt - paid));
    totalDue = round2(totalDue + amt);
    items.push({
      uid: c.id,
      kind: 'commitment',
      categoryType: 'التزامات شهرية',
      title: c.title,
      sub: `من ${formatYMArabic(c.start)} إلى ${formatYMArabic(c.end)}${c.note?' · '+c.note:''}`,
      amount: amt,
      paid,
      remaining: rem
    });
  }

  // 3) Card Operations Dues (أقساط البطاقات + الرسوم الإدارية + المشتريات المستحقة في الشهر m)
  for(const op of (state.cardOps||[])){
    const card = state.cards.find(x=>x.id===op.cardId);
    const cName = card?.name || 'بطاقة';
    if(op.type === 'swipe'){
      const dueYM = op.dueDate ? op.dueDate.slice(0,7) : addMonthsYM(op.purchaseMonth || monthKey(op.date), 1);
      if(dueYM === m){
        const amt = round2(Number(op.amount)||0);
        const paid = round2(Number(op.paid)||0);
        const rem = round2(Math.max(0, amt - paid));
        totalDue = round2(totalDue + amt);
        items.push({
          uid: op.id,
          kind: 'card_swipe',
          opId: op.id,
          categoryType: 'معاملات بالبطاقة',
          title: `${op.title} (${cName})`,
          sub: `شراء بطاقة مستحق بالكامل`,
          amount: amt,
          paid,
          remaining: rem
        });
      }
    } else if(op.type === 'installment'){
      if(op.feeMonth === m && (Number(op.feeDue)||0) > 0){
        const amt = round2(Number(op.feeDue)||0);
        const paid = round2(Number(op.feePaid)||0);
        const rem = round2(Math.max(0, amt - paid));
        totalDue = round2(totalDue + amt);
        items.push({
          uid: op.id + ':fee',
          kind: 'card_fee',
          opId: op.id,
          categoryType: 'معاملات بالبطاقة',
          title: `رسوم إدارية: ${op.title} (${cName})`,
          sub: `رسوم تقسيط ${op.months} شهر`,
          amount: amt,
          paid,
          remaining: rem
        });
      }
      (op.schedules||[]).forEach((sc, idx)=>{
        if(sc.month === m){
          const amt = round2(Number(sc.amount)||0);
          const paid = round2(Number(sc.paid)||0);
          const rem = round2(Math.max(0, amt - paid));
          totalDue = round2(totalDue + amt);
          items.push({
            uid: `${op.id}:inst:${m}`,
            kind: 'card_inst',
            opId: op.id,
            month: m,
            categoryType: 'معاملات بالبطاقة',
            title: `${op.title} (${cName})`,
            sub: `قسط (${idx+1} من ${op.months})`,
            amount: amt,
            paid,
            remaining: rem
          });
        }
      });
    }
  }

  return { items, totalDue: round2(totalDue) };
}

function payUnifiedDueItem(kind, uid, opId, month){
  const m = month || selected();
  const accId = state.prefs?.defaultAccount || state.accounts[0]?.id || null;
  if(kind === 'commitment'){
    markCommitmentPaid(uid);
    return;
  }
  const op = state.cardOps.find(o=>o.id===opId);
  if(!op) return;
  const card = state.cards.find(c=>c.id===op.cardId);
  const cName = card?.name || 'بطاقة';
  let payAmt = 0;
  let payTitle = '';
  if(kind === 'card_swipe'){
    payAmt = round2(Math.max(0, (Number(op.amount)||0) - (Number(op.paid)||0)));
    if(payAmt <= 0) return toast('مسدد بالكامل ✓');
    op.paid = round2((Number(op.paid)||0) + payAmt);
    payTitle = `سداد بطاقة (${cName}) - ${op.title}`;
  } else if(kind === 'card_fee'){
    payAmt = round2(Math.max(0, (Number(op.feeDue)||0) - (Number(op.feePaid)||0)));
    if(payAmt <= 0) return toast('مسدد بالكامل ✓');
    op.feePaid = round2((Number(op.feePaid)||0) + payAmt);
    payTitle = `سداد رسوم بطاقة (${cName}) - ${op.title}`;
  } else if(kind === 'card_inst'){
    const sc = (op.schedules||[]).find(s=>s.month===m);
    if(!sc) return;
    payAmt = round2(Math.max(0, (Number(sc.amount)||0) - (Number(sc.paid)||0)));
    if(payAmt <= 0) return toast('مسدد بالكامل ✓');
    sc.paid = round2((Number(sc.paid)||0) + payAmt);
    payTitle = `سداد قسط بطاقة (${cName}) - ${op.title}`;
  }
  if(payAmt > 0){
    state.cardPayments.push({id:'cp-'+Date.now(), cardId:op.cardId, amount:payAmt, date:today(), accountId:accId});
    state.transactions.push({id:'cardpay-'+Date.now(), type:'credit_payment', title:payTitle, category:'سداد بطاقة', amount:payAmt, date:today(), accountId:accId, source:'card-payment', createdAt:Date.now()});
    persist();
    toast('تم تسجيل السداد ✓');
  }
}

function markCommitmentPaid(id){
  const c = state.commitments.find(x=>x.id===id), m = selected(); if(!c) return;
  const isOnce = c.freq==='once';
  const paid = isOnce ? state.commitmentPayments.filter(p=>p.commitmentId===id).reduce((s,p)=>s+(Number(p.amount)||0),0) : state.commitmentPayments.filter(p=>p.commitmentId===id&&p.month===m).reduce((s,p)=>s+(Number(p.amount)||0),0);
  const rem = Math.max(0,(Number(c.amount)||0)-paid);
  if(!rem) return toast('مسدد بالكامل ✓');
  const accId = state.prefs?.defaultAccount || state.accounts[0]?.id || null;
  state.commitmentPayments.push({id:'cmp-'+Date.now(), commitmentId:id, month:m, amount:rem, date:today(), accountId:accId});
  state.transactions.push({id:'com-pay-'+Date.now(), type:'expense', title:'سداد '+c.title, category:c.type||'التزام', amount:rem, date:today(), accountId:accId, source:'commitment-payment', createdAt:Date.now()});
  persist(); toast('تم تسجيل السداد ✓');
}

function openEditCommitmentModal(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  if(c.cardOpId){
    openEditCardOpModal(c.cardOpId);
    return;
  }
  const isOnce = c.freq === 'once';
  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>اسم العملية</label><input id="edComTitle" value="${esc(c.title)}"></div>
      <div class="c-row"><label>المبلغ</label><input id="edComAmount" type="number" step="0.01" value="${Number(c.amount)||0}"></div>
      ${isOnce
        ? `<div class="c-row"><label>تاريخ الاستحقاق</label><input id="edComDueDate" type="date" value="${esc(c.dueDate||today())}"></div>`
        : `<div class="c-row"><label>تاريخ البدء</label><input id="edComStartYM" type="month" value="${esc(c.start||selected())}"></div>
           <div class="c-row"><label>الفترة بالأشهر</label><input id="edComDur" type="number" min="1" max="360" value="${Number(c.durationMonths)||12}"></div>`
      }
      <div class="c-row"><label>ملاحظة</label><input id="edComNote" value="${esc(c.note||'')}"></div>
    </div>
  `;
  showAppCustomForm('تعديل: ' + c.title, formHtml, ()=>{
    const title = val('edComTitle').trim();
    const amount = num('edComAmount');
    if(!title || amount <= 0){ toast('أدخل الاسم والمبلغ بشكل صحيح'); return false; }
    c.title = title;
    c.amount = amount;
    if(isOnce){
      const dd = val('edComDueDate') || today();
      c.dueDate = dd;
      c.start = dd.slice(0,7);
      c.end = dd.slice(0,7);
    } else {
      const st = val('edComStartYM') || c.start || selected();
      const dur = Math.max(1, Math.round(num('edComDur')||12));
      c.start = st;
      c.durationMonths = dur;
      c.end = addMonthsYM(st, dur - 1);
    }
    c.note = val('edComNote').trim();
    persist();
    toast('تم تعديل الالتزام ✓');
    return true;
  });
}

function deleteCommitment(id){
  showAppConfirm('حذف الالتزام', 'هل تريد حذف هذا الالتزام نهائياً؟', ()=>{
    state.commitments = state.commitments.filter(x=>x.id!==id);
    persist(); toast('تم الحذف');
  }, true);
}

function renderPlanScreen(){
  const m = selected();
  const { items, totalDue } = getUnifiedMonthlyDues(m);
  document.getElementById('comHeroMonthLabel').textContent = formatYMArabic(m);
  document.getElementById('comHeroTotal').textContent = maskable(egpSmart(totalDue));
  document.getElementById('comMonthLabel').textContent = formatYMArabic(m);

  document.getElementById('commitmentsList').innerHTML = items.length ? items.map(it=>{
    const left = it.remaining;
    const isCardItem = it.kind !== 'commitment';
    const editFn = isCardItem ? `openEditCardOpModal('${esc(it.opId)}')` : `openEditCommitmentModal('${esc(it.uid)}')`;
    const delFn = isCardItem ? `deleteCardOp('${esc(it.opId)}')` : `deleteCommitment('${esc(it.uid)}')`;
    const payFn = `payUnifiedDueItem('${it.kind}','${esc(it.uid)}','${esc(it.opId||'')}','${m}')`;
    return `
      <div class="listitem" onclick="toggleItemActions(this,event)">
        <div class="info">
          <b>${esc(it.title)} <span class="tag">${esc(it.categoryType)}</span></b>
          <small>${esc(it.sub)} ${it.paid>0 ? `· المسدد: ${egp(it.paid)}` : ''}</small>
        </div>
        <strong class="${left>0?'orange':'mint'}">${maskable(egp(left>0 ? left : it.amount))}</strong>
        <div class="tap-actions">
          <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="${payFn}">${left>0?'تسجيل سداد':'مسدد ✓'}</button>
          <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="${editFn}">تعديل</button>
          <button type="button" class="smallbtn danger" onclick="${delFn}">حذف</button>
        </div>
      </div>
    `;
  }).join('') : '<div class="empty">لا توجد مبالغ مستحقة في هذا الشهر.</div>';

  renderYearlyExcelReport();
}


/* =========================================================
   SECTION 8: EXCEL-LIKE YEARLY FINANCIAL REPORT (التقرير المالي السنوي)
   - Horizontal Scroll + Sticky Month Column
   - 1) Income Breakdown Columns (المرتب، الأرباح، الجمعيات، وأي بنود دخل أخرى)
   - 2) Commitments Breakdown Columns (مستحقات مؤجلة، التزامات شهرية، أقساط البطاقات، + تفصيل الالتزامات)
   - 3) Financial Summary Columns (إجمالي الدخل | إجمالي الالتزامات | صافي المتبقي)
   ========================================================= */
function renderYearlyExcelReport(){
  const headEl = document.getElementById('yearlyExcelHead');
  const bodyEl = document.getElementById('yearlyBreakdownBody');
  if(!headEl || !bodyEl) return;

  const curYM = selected();
  const y = String(forecastYear);
  document.getElementById('forecastYearLabel').textContent = y;

  const defs = (state.reportDefaults||{})[y] || {salary:0, profit:0};
  const sInp = document.getElementById('repDefSalary');
  const pInp = document.getElementById('repDefProfit');
  if(sInp && document.activeElement !== sInp) sInp.value = defs.salary || '';
  if(pInp && document.activeElement !== pInp) pInp.value = defs.profit || '';

  // Discover all distinct Income categories active in year y (or configured in incomeCategories)
  const baseIncCats = ['راتب', 'أرباح', 'جمعيات'];
  const recordedIncCats = new Set(baseIncCats);
  (state.incomeCategories||[]).forEach(c=>{ if(c) recordedIncCats.add(c.trim()); });
  (state.transactions||[]).filter(t=>t.type==='income' && String(t.date||'').startsWith(y)).forEach(t=>{
    const c = String(t.category||'أخرى').trim() || 'أخرى';
    recordedIncCats.add(c);
  });
  const incCols = [...recordedIncCats];

  // Build 12 months data
  const monthData = [];
  for(let m=1; m<=12; m++){
    const mk = y + '-' + String(m).padStart(2,'0');
    const mTxs = monthTx(mk).filter(t=>t.type==='income');
    const incByCat = {};
    incCols.forEach(c => incByCat[c] = 0);

    for(const t of mTxs){
      let c = String(t.category||'أخرى').trim() || 'أخرى';
      if(String(t.source||'').startsWith('salary:')) c = 'راتب';
      incByCat[c] = round2((incByCat[c]||0) + (Number(t.amount)||0));
    }
    if(incByCat['راتب'] <= 0 && (Number(defs.salary)||0) > 0){
      incByCat['راتب'] = round2(Number(defs.salary)||0);
    }
    if(incByCat['أرباح'] <= 0 && (Number(defs.profit)||0) > 0){
      incByCat['أرباح'] = round2(Number(defs.profit)||0);
    }
    const totInc = round2(Object.values(incByCat).reduce((s,v)=>s+v, 0));

    // Commitments breakdown from unified dues for month mk
    const dues = getUnifiedMonthlyDues(mk);
    let defSum = 0, monSum = 0, cardSum = 0;
    const dueByItemName = {};
    for(const it of dues.items){
      if(it.categoryType === 'مستحقات مؤجلة') defSum = round2(defSum + it.amount);
      else if(it.categoryType === 'التزامات شهرية') monSum = round2(monSum + it.amount);
      else cardSum = round2(cardSum + it.amount);
      const itemKey = String(it.title||'').trim();
      if(itemKey) dueByItemName[itemKey] = round2((dueByItemName[itemKey]||0) + it.amount);
    }
    const totDue = round2(defSum + monSum + cardSum);
    const net = round2(totInc - totDue);

    monthData.push({ m, mk, incByCat, defSum, monSum, cardSum, dueByItemName, totInc, totDue, net });
  }

  // Filter incCols so we show 'راتب', 'أرباح', 'جمعيات', and any income column that has > 0 in at least one month
  const activeIncCols = incCols.filter(c => c==='راتب' || c==='أرباح' || c==='جمعيات' || monthData.some(md => (md.incByCat[c]||0) > 0));

  // Collect all distinct individual commitment item names active in this year
  const dueItemSet = new Set();
  monthData.forEach(md => Object.keys(md.dueByItemName).forEach(k => dueItemSet.add(k)));
  const activeDueItemCols = [...dueItemSet];

  headEl.innerHTML = `
    <tr>
      <th class="sticky-col">الشهر</th>
      ${activeIncCols.map(c=>`<th style="color:var(--blue)">${esc(c==='راتب'?'المرتب':c)}</th>`).join('')}
      <th style="color:var(--orange)">مستحقات مؤجلة</th>
      <th style="color:var(--orange)">التزامات شهرية</th>
      <th style="color:var(--orange)">أقساط البطاقات</th>
      ${activeDueItemCols.map(dn=>`<th style="color:#ffd19a">${esc(dn)}</th>`).join('')}
      <th style="color:var(--blue);background:var(--surface)">إجمالي الدخل</th>
      <th style="color:var(--orange);background:var(--surface)">إجمالي الالتزامات</th>
      <th style="color:var(--mint);background:var(--surface)">صافي المتبقي</th>
    </tr>
  `;

  const colSums = {
    inc: Object.fromEntries(activeIncCols.map(c=>[c,0])),
    dueItems: Object.fromEntries(activeDueItemCols.map(dn=>[dn,0])),
    defSum: 0, monSum: 0, cardSum: 0, totInc: 0, totDue: 0, net: 0
  };

  let rowsHtml = '';
  for(const md of monthData){
    activeIncCols.forEach(c => { colSums.inc[c] = round2(colSums.inc[c] + (md.incByCat[c]||0)); });
    activeDueItemCols.forEach(dn => { colSums.dueItems[dn] = round2(colSums.dueItems[dn] + (md.dueByItemName[dn]||0)); });
    colSums.defSum = round2(colSums.defSum + md.defSum);
    colSums.monSum = round2(colSums.monSum + md.monSum);
    colSums.cardSum = round2(colSums.cardSum + md.cardSum);
    colSums.totInc = round2(colSums.totInc + md.totInc);
    colSums.totDue = round2(colSums.totDue + md.totDue);
    colSums.net = round2(colSums.net + md.net);

    rowsHtml += `
      <tr class="${md.mk===curYM?'cur-row':''}">
        <td class="sticky-col"><b>${monthNamesAr[md.m-1]}</b></td>
        ${activeIncCols.map(c=>`<td>${maskable(fmtInt(md.incByCat[c]||0))}</td>`).join('')}
        <td>${maskable(fmtInt(md.defSum))}</td>
        <td>${maskable(fmtInt(md.monSum))}</td>
        <td>${maskable(fmtInt(md.cardSum))}</td>
        ${activeDueItemCols.map(dn=>`<td>${maskable(fmtInt(md.dueByItemName[dn]||0))}</td>`).join('')}
        <td class="blue"><b>${maskable(fmtInt(md.totInc))}</b></td>
        <td class="orange"><b>${maskable(fmtInt(md.totDue))}</b></td>
        <td class="${md.net>=0?'mint':'red'}"><b>${maskable((md.net>0?'+':'')+fmtInt(md.net))}</b></td>
      </tr>
    `;
  }

  rowsHtml += `
    <tr class="sum-row">
      <td class="sticky-col"><b>الإجمالي</b></td>
      ${activeIncCols.map(c=>`<td class="blue"><b>${maskable(fmtInt(colSums.inc[c]||0))}</b></td>`).join('')}
      <td class="orange"><b>${maskable(fmtInt(colSums.defSum))}</b></td>
      <td class="orange"><b>${maskable(fmtInt(colSums.monSum))}</b></td>
      <td class="orange"><b>${maskable(fmtInt(colSums.cardSum))}</b></td>
      ${activeDueItemCols.map(dn=>`<td style="color:#ffd19a"><b>${maskable(fmtInt(colSums.dueItems[dn]||0))}</b></td>`).join('')}
      <td class="blue"><b>${maskable(fmtInt(colSums.totInc))}</b></td>
      <td class="orange"><b>${maskable(fmtInt(colSums.totDue))}</b></td>
      <td class="${colSums.net>=0?'mint':'red'}"><b>${maskable((colSums.net>0?'+':'')+fmtInt(colSums.net))}</b></td>
    </tr>
  `;
  bodyEl.innerHTML = rowsHtml;
}

function saveReportDefaults(){
  const y = String(forecastYear);
  state.reportDefaults = state.reportDefaults || {};
  state.reportDefaults[y] = { salary: num('repDefSalary'), profit: num('repDefProfit') };
  persist();
  toast('تم حفظ الدخل المتوقع لسنة ' + y);
}


/* =========================================================
   SALARY CALCULATOR (Inside More / Settings)
   ========================================================= */
function initSalary(){
  let y=document.getElementById('salYear'), m=document.getElementById('salMonth'); if(!y||!m) return;
  for(let i=new Date().getFullYear()-3; i<=new Date().getFullYear()+10; i++) y.add(new Option(i,String(i)));
  monthNamesAr.forEach((n,i)=>m.add(new Option(n,String(i+1))));
  y.value = String(activeYear); m.value = String(activeMonth);
  loadSalaryConfig();
}
function loadSalaryConfig(){
  let y=val('salYear'), c=state.salaryConfig[y]||{};
  const cfg={Basic:0,Attendance:0,Years:0,WorkHours:8,WorkDays:30,AllowanceRate:1,RestRate:2,OTRate:1.5,HolidayRate:2,MealPrice:70,InsAdd1:1400,InsAdd2:800,InsuranceBaseRate:10,MedicalRate:6,MartyrsRate:0.05};
  Object.entries(cfg).forEach(([k,v])=>setv('sal'+k, c[k]??v));
  let k=y+'-'+String(Number(val('salMonth')||1)).padStart(2,'0'), d=state.salaryMonths[k]||{};
  setv('salRating',d.Rating??0); setv('salAllowanceHours',d.AllowanceHours??0); setv('salRestHours',d.RestHours??0);
  setv('salOvertime',d.Overtime??0); setv('salHoliday',d.Holiday??0); setv('salDays',d.Days??0); setv('sal12H',d.Hours12??0); setv('salOther',d.Other??0);
  updateMealPreview(); showSalaryResult();
}
function saveSalaryConfig(){
  let y=val('salYear');
  state.salaryConfig[y]={Basic:num('salBasic'),Attendance:num('salAttendance'),Years:num('salYears'),WorkHours:num('salWorkHours')||8,WorkDays:num('salWorkDays')||30,AllowanceRate:num('salAllowanceRate'),RestRate:num('salRestRate'),OTRate:num('salOTRate'),HolidayRate:num('salHolidayRate'),MealPrice:num('salMealPrice'),InsAdd1:num('salInsAdd1'),InsAdd2:num('salInsAdd2'),InsuranceBaseRate:num('salInsuranceBaseRate'),MedicalRate:num('salMedicalRate'),MartyrsRate:num('salMartyrsRate')};
  persist(); toast('تم حفظ إعدادات '+y);
}
function updateMealPreview(){
  let days=num('salDays'), h12=num('sal12H'), aH=num('salAllowanceHours'), wH=num('salWorkHours')||8;
  setv('sal8Days', round2(Math.max(0, days-(aH/wH)-h12)));
}
function calcTaxFromNovember(gross,insurance){
  const a=Math.max(0,(gross-insurance)*12);
  let annual=0;
  if(a<=60000) annual=0;
  else if(a<=75000) annual=(a-60000)*0.10;
  else if(a<=90000) annual=(a-75000)*0.15+1500;
  else if(a<=220000) annual=(a-90000)*0.20+3750;
  else if(a<=420000) annual=(a-220000)*0.225+29750;
  else if(a<=620000) annual=(a-420000)*0.25+74750;
  else if(a<=720000) annual=(a-620000)*0.25+128750;
  else if(a<=820000) annual=(a-720000)*0.25+156500;
  else if(a<=920000) annual=(a-820000)*0.25+185000;
  else if(a<=1220000) annual=(a-920000)*0.25+215000;
  else annual=(a-1220000)*0.275+300000;
  return round2(annual/12);
}
function calcSalary(d,c){
  const B=+c.Basic||0, hourly=B/(+c.WorkDays||30)/(+c.WorkHours||8);
  const aPay=round2(hourly*(+c.AllowanceRate||0)*(+d.AllowanceHours||0));
  const rPay=round2(hourly*(+c.RestRate||0)*(+d.RestHours||0));
  const oPay=round2(hourly*(+c.OTRate||0)*(+d.Overtime||0));
  const hPay=round2(hourly*(+c.HolidayRate||0)*(+d.Holiday||0));
  const h8=round2(Math.max(0,(+d.Days||0)-((+d.AllowanceHours||0)/(+c.WorkHours||8))-(+d.Hours12||0)));
  const meal=round2(h8*(+c.MealPrice||70)+(+d.Hours12||0)*(+c.MealPrice||70)*2);
  const gross=round2(B+(+d.Rating||0)+aPay+rPay+oPay+hPay+meal+(+c.Attendance||0)+(+c.Years||0)+(+d.Other||0));
  const martyrs=round2(gross*((+c.MartyrsRate||0)/100));
  const insBase=ceilTo((B+(+c.InsAdd1||0)+(+c.InsAdd2||0))/1.3,10);
  const insurance=round2(insBase*((+c.InsuranceBaseRate||0)/100)+(B+(+c.InsAdd1||0)+(+c.InsAdd2||0))*((+c.MedicalRate||0)/100));
  const tax=calcTaxFromNovember(gross,insurance);
  return {gross, martyrs, insurance, tax, net:round2(gross-martyrs-insurance-tax)};
}
function saveSalaryMonth(){
  saveSalaryConfig();
  let y=val('salYear'), key=y+'-'+String(num('salMonth')).padStart(2,'0');
  let d={Rating:num('salRating'),AllowanceHours:num('salAllowanceHours'),RestHours:num('salRestHours'),Overtime:num('salOvertime'),Holiday:num('salHoliday'),Days:num('salDays'),Hours12:num('sal12H'),Other:num('salOther'),PayDay:num('salPayDay')||1};
  let r=calcSalary(d, state.salaryConfig[y]||{});
  state.salaryMonths[key]={...d, result:r};
  const aid = state.prefs?.defaultAccount || state.accounts[0]?.id || null;
  const date = key + '-' + String(d.PayDay).padStart(2,'0');
  let ex = state.transactions.find(t=>t.source==='salary:'+key);
  if(ex){ ex.amount=r.net; ex.date=date; }
  else { state.transactions.push({id:'salary-'+key, type:'income', title:'صافي المرتب', amount:r.net, category:'راتب', date, source:'salary:'+key, accountId:aid, createdAt:Date.now()}); }
  persist(); showSalaryResult(); toast('تم حساب وحفظ صافي المرتب ✓');
}
function showSalaryResult(){
  let y=val('salYear'), key=y+'-'+String(Number(val('salMonth')||1)).padStart(2,'0'), d=state.salaryMonths[key], el=document.getElementById('salaryResult');
  if(!el) return;
  if(!d){ el.innerHTML='<div class="empty">أدخل بيانات الشهر واضغط احسب لعرض تفاصيل المرتب.</div>'; return; }
  let r=calcSalary(d, state.salaryConfig[y]||{});
  el.innerHTML=`<div class="rowline"><span>إجمالي المرتب</span><b>${egp(r.gross)}</b></div><div class="rowline"><span>التأمينات</span><b>${egp(r.insurance)}</b></div><div class="rowline"><span>الضرائب</span><b>${egp(r.tax)}</b></div><div class="hero" style="margin-top:10px;min-height:74px"><label>صافي المرتب</label><div class="amount">${egp(r.net)}</div></div>`;
}


/* =========================================================
   SETTINGS CATEGORIES TREE MANAGER
   ========================================================= */
let settingsCatMode = 'expense';
let expandedSettingsMainCats = {};

function onSettingsCatsFoldToggle(det){
  const ic = document.getElementById('settingsCatsFoldIcon');
  if(!ic) return;
  if(det.open){
    ic.textContent = '＋';
    ic.title = 'إضافة قسم رئيسي جديد';
    ic.onclick = function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      addMainCategoryInSettings();
    };
  } else {
    ic.textContent = '▼';
    ic.title = '';
    ic.onclick = null;
  }
}

function setSettingsCatTab(mode){
  settingsCatMode = mode;
  document.getElementById('setCatTabExp').classList.toggle('active', mode==='expense');
  document.getElementById('setCatTabInc').classList.toggle('active', mode==='income');
  renderSettingsCategories();
}

function addMainCategoryInSettings(){
  const title = settingsCatMode==='income' ? 'إضافة قسم دخل رئيسي' : 'إضافة قسم مصروفات رئيسي';
  showAppPrompt(title, 'اكتب اسم القسم الرئيسي...', '', (n)=>{
    if(!n || !n.trim()) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    if(!tree[clean]) tree[clean] = [];
    if(settingsCatMode==='income') state.incomeCategories = [...new Set([...(state.incomeCategories||[]), clean])];
    else state.categories = [...new Set([...(state.categories||[]), clean])];
    persist();
    toast('تمت إضافة القسم الرئيسي ✓');
  });
}

function renameMainCategoryInSettings(oldName){
  showAppPrompt('تعديل اسم القسم الرئيسي', 'الاسم الجديد...', oldName, (n)=>{
    if(!n || !n.trim() || n.trim()===oldName) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    const subs = tree[oldName] || [];
    delete tree[oldName];
    tree[clean] = [...new Set([...(tree[clean]||[]), ...subs])];
    if(settingsCatMode==='income'){
      state.incomeCategories = (state.incomeCategories||[]).map(x=>x===oldName?clean:x);
    } else {
      state.categories = (state.categories||[]).map(x=>x===oldName?clean:x);
    }
    state.transactions.forEach(t=>{ if(t.category===oldName) t.category=clean; });
    persist();
    toast('تم تعديل اسم القسم ✓');
  });
}

function addSubCategoryInSettings(mainName){
  showAppPrompt(`إضافة فرعي داخل «${mainName}»`, 'اكتب اسم القسم الفرعي...', '', (n)=>{
    if(!n || !n.trim()) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    tree[mainName] = [...new Set([...(tree[mainName]||[]), clean])];
    expandedSettingsMainCats[mainName] = true;
    persist();
    toast('تمت إضافة القسم الفرعي ✓');
  });
}

function renameSubCategoryInSettings(mainName, oldSub){
  showAppPrompt('تعديل اسم القسم الفرعي', 'الاسم الجديد...', oldSub, (n)=>{
    if(!n || !n.trim() || n.trim()===oldSub) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    tree[mainName] = (tree[mainName]||[]).map(s=>s===oldSub?clean:s);
    state.transactions.forEach(t=>{ if(t.category===mainName && t.subCategory===oldSub) t.subCategory=clean; });
    persist();
    toast('تم تعديل القسم الفرعي ✓');
  });
}

function toggleSettingsMainCatExpand(mainName){
  const was = !!expandedSettingsMainCats[mainName];
  expandedSettingsMainCats = {};
  if(!was) expandedSettingsMainCats[mainName] = true;
  renderSettingsCategories();
}

function renderSettingsCategories(){
  const container = document.getElementById('settingsCatsTreeContainer');
  if(!container) return;
  syncCategoryTrees();
  const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
  const entries = Object.entries(tree||{});
  if(!entries.length){
    container.innerHTML = '<div class="empty">لا توجد أقسام مسجلة. اضغط على علامة ＋ بالأعلى للإضافة.</div>';
    return;
  }
  container.innerHTML = entries.map(([mc, subs])=>{
    const isOpen = !!expandedSettingsMainCats[mc];
    const previewSubs = subs.length ? subs.slice(0,5).join('، ') + (subs.length>5 ? '…' : '') : 'لا توجد أقسام فرعية';
    const subsHtml = isOpen ? `
      <div class="cat-mgr-subs">
        ${subs.map(sc=>`
          <div class="cat-mgr-sub-row">
            <span>${esc(sc)}</span>
            <button type="button" class="icon-act-btn" title="تعديل الفرعي" onclick="renameSubCategoryInSettings('${esc(mc)}','${esc(sc)}')">✎</button>
          </div>
        `).join('')}
        <button type="button" class="smallbtn" style="width:100%;margin-top:2px;border-color:var(--mint);color:var(--mint)" onclick="addSubCategoryInSettings('${esc(mc)}')">＋ إضافة قسم فرعي</button>
      </div>
    ` : '';
    return `
      <div class="cat-mgr-row">
        <div class="cat-mgr-main">
          <div class="cat-mgr-main-title" onclick="toggleSettingsMainCatExpand('${esc(mc)}')">
            <b>${esc(mc)} <span style="color:var(--muted);font-weight:400">(${subs.length})</span></b>
            <small>${esc(previewSubs)}</small>
          </div>
          <div class="cat-mgr-icons">
            <button type="button" class="icon-act-btn" title="تعديل القسم الرئيسي" onclick="renameMainCategoryInSettings('${esc(mc)}')">✎</button>
            <button type="button" class="icon-act-btn" title="عرض الأقسام الفرعية" onclick="toggleSettingsMainCatExpand('${esc(mc)}')">${isOpen?'▲':'▼'}</button>
          </div>
        </div>
        ${subsHtml}
      </div>
    `;
  }).join('');
}

/* Compact Month/Year Picker Dialog */
let ymPickerState = {year:activeYear, month:activeMonth, allowClear:false, onSelect:null};
function openHomePeriodPicker(){
  openCompactYMPicker(null, false, (chosenYM)=>{
    const [y,m] = chosenYM.split('-').map(Number);
    activeYear = y; activeMonth = m; forecastYear = y;
    renderAll();
  });
}
function openCompactYMPicker(prefix, allowClear, customCb){
  let cur = prefix ? (val(prefix+'Val')||selected()) : selected();
  let [y,m] = cur.includes('-') ? cur.split('-').map(Number) : [activeYear, activeMonth];
  ymPickerState = {
    year: y, month: m, allowClear: !!allowClear,
    onSelect: (chosen)=>{
      if(prefix){
        setv(prefix+'Val', chosen);
        const lbl = document.getElementById(prefix+'Label');
        if(lbl) lbl.textContent = chosen ? formatYMArabic(chosen) : 'مفتوح';
      }
      if(customCb) customCb(chosen);
    }
  };
  renderCompactYMPicker();
}
function renderCompactYMPicker(){
  let d = document.getElementById('ymModal');
  if(!d){
    d = document.createElement('div'); d.id='ymModal'; d.className='modal center-modal';
    d.onclick = e=>{ if(e.target===d) d.classList.remove('show'); };
    d.innerHTML = '<div class="sheet"><h3>اختر الشهر والسنة</h3><div id="ymModalBody"></div></div>';
    document.body.appendChild(d);
  }
  const grid = monthNamesAr.map((n,i)=>`<button type="button" class="ym-cell ${(i+1)===ymPickerState.month?'active':''}" onclick="selectYMCell(${i+1})">${n}</button>`).join('');
  document.getElementById('ymModalBody').innerHTML = `
    <div class="ym-year-bar">
      <button type="button" onclick="ymPickerState.year--;renderCompactYMPicker()">‹</button>
      <b>${ymPickerState.year}</b>
      <button type="button" onclick="ymPickerState.year++;renderCompactYMPicker()">›</button>
    </div>
    <div class="ym-grid">${grid}</div>
    ${ymPickerState.allowClear?'<button type="button" class="secondary" style="width:100%;margin-top:8px" onclick="clearYMCell()">مفتوح (بدون نهاية)</button>':''}
  `;
  d.classList.add('show');
}
function selectYMCell(m){
  document.getElementById('ymModal').classList.remove('show');
  const res = String(ymPickerState.year)+'-'+String(m).padStart(2,'0');
  if(ymPickerState.onSelect) ymPickerState.onSelect(res);
}
function clearYMCell(){
  document.getElementById('ymModal').classList.remove('show');
  if(ymPickerState.onSelect) ymPickerState.onSelect('');
}

/* Backup, Restore, Update & Reset */
function openFilePicker(id){ const e=document.getElementById(id); if(e){ e.value=''; e.click(); } }
function backup(){
  state.prefs = state.prefs || {};
  state.prefs.lastBackupDate = today();
  persist();
  let b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}), a=document.createElement('a');
  a.href=URL.createObjectURL(b); a.download='x-wallet-backup-'+today()+'.json'; a.click();
  toast('تم تصدير النسخة الاحتياطية ✓');
}
function restore(e){
  let f=e.target.files[0]; if(!f) return;
  let r=new FileReader();
  r.onload=()=>{
    try{
      let v=JSON.parse(r.result); if(!Array.isArray(v.transactions)) throw 0;
      state=v; syncCategoryTrees(); applyPreferences(); persist(); toast('تم استرجاع النسخة ✓');
    }catch{ toast('ملف غير صالح'); }
  };
  r.readAsText(f);
}
function openPasteRestoreModal(){
  showAppPrompt('استعادة نسخة احتياطية (JSON)', 'الصق محتوى ملف JSON هنا...', '', (raw)=>{
    if(!raw || !raw.trim()) return;
    try{
      let v=JSON.parse(raw.trim()); if(!Array.isArray(v.transactions)) throw 0;
      state=v; syncCategoryTrees(); applyPreferences(); persist(); toast('تم استرجاع النسخة ✓');
    }catch{ toast('النص غير صالح'); }
  }, true);
}
function showUpdateCardModal(ver, notesText){
  const m = document.getElementById('updateAvailableModal');
  if(!m) return;
  document.getElementById('updModalTitle').textContent = '🚀 تحديث جديد: X-Wallet V' + ver;
  const lines = String(notesText||'تحسينات جديدة في التطبيق').split(/\n|\+/).map(s=>s.trim()).filter(Boolean);
  document.getElementById('updModalNotes').innerHTML =
    '<div style="font-weight:400;margin-bottom:6px;color:var(--text)">ملخص التحديث:</div>' +
    lines.map(s=>`<div style="margin:3px 0">• ${esc(s.replace(/^•\s*/,''))}</div>`).join('');
  m.classList.add('show');
}
function checkForUpdate(silent){
  const box = document.getElementById('updateDetailsBox');
  if(!silent && box) box.innerHTML = '<div class="hint" style="margin:0">جاري البحث عن تحديثات…</div>';
  fetch('./version.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(v=>{
    const rem = String(v.version||v.appVersion||'').trim();
    const notes = String(v.notes||'تحسينات عامة في الأداء والاستقرار').trim();
    const notesHtml = notes.split(/\n|\+/).map(s=>s.trim()).filter(Boolean).map(s=>`<div style="margin:3px 0">• ${esc(s.replace(/^•\s*/,''))}</div>`).join('');
    if(!rem || rem === APP_VERSION){
      if(!silent){
        if(box) box.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b style="color:var(--mint);font-size:.8rem">✓ أنت على أحدث إصدار (V${esc(APP_VERSION)})</b>
          </div>
          <div class="hint" style="margin:0;font-size:.7rem">${notesHtml}</div>
        `;
        toast('أنت على آخر إصدار V' + APP_VERSION);
      }
    } else {
      if(box) box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b style="color:var(--orange);font-size:.82rem">🚀 يتوفر تحديث جديد: V${esc(rem)}</b>
          <span class="tag">الحالي: V${esc(APP_VERSION)}</span>
        </div>
        <div class="hint" style="margin:0 0 10px;font-size:.72rem;color:var(--text-sub)"><b>أهم التحسينات:</b>${notesHtml}</div>
        <button type="button" class="primary" style="padding:9px" onclick="forceAppUpdate()">تحديث</button>
      `;
      showUpdateCardModal(rem, notes);
    }
  }).catch(()=>{
    if(!silent){
      if(box) box.innerHTML = '<div class="hint" style="margin:0;color:var(--red)">تعذر الاتصال للبحث عن تحديث. تأكد من الإنترنت.</div>';
      toast('تعذر فحص التحديث');
    }
  });
}
async function forceAppUpdate(){
  toast('جاري التحديث…');
  try{
    if('caches' in window){ const ks=await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); }
    if('serviceWorker' in navigator){ const rs=await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r=>r.unregister())); }
  }catch(_){}
  const u=new URL(location.href); u.searchParams.set('v', Date.now()); location.replace(u.toString());
}
function clearTransactionsAndCats(){
  showAppConfirm('تصفير المعاملات والأقسام', 'هل تريد تصفير جميع المعاملات والتحويلات والأقسام لتصبح فارغة؟', ()=>{
    state.transactions=[]; state.ledger=[];
    state.categories=[]; state.incomeCategories=[];
    state.categoryTree={expense:{}, income:{}};
    persist(); toast('تم تصفير المعاملات والأقسام ✓');
  }, true);
}
function resetApp(){
  showAppConfirm('حذف كل بيانات التطبيق', 'هل أنت متأكد من حذف كل بيانات التطبيق نهائياً من الجهاز؟', ()=>{
    localStorage.removeItem(KEY);
    openSafeIDB().then(db=>{
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(KEY);
      tx.oncomplete = () => location.reload();
    }).catch(()=>location.reload());
  }, true);
}
function installPWA(){
  if(window.__deferredInstallPrompt){ window.__deferredInstallPrompt.prompt(); return; }
  toast('من قائمة المتصفح ⋮ اختر «تثبيت التطبيق»');
}

/* Custom Centered Select Enhancer */
let _activeNativeSelect = null;
function closeCustomSelectModal(){
  const m = document.getElementById('customSelectModal');
  if(m) m.classList.remove('show');
  _activeNativeSelect = null;
}
function openCustomSelectFor(sel){
  if(!sel) return;
  _activeNativeSelect = sel;
  const rowLbl = sel.closest('.c-row')?.querySelector('label,.c-lbl')?.textContent?.replace(':','').trim() || 'اختر';
  document.getElementById('csModalTitle').textContent = rowLbl;
  const opts = [...sel.options];
  document.getElementById('csModalOptions').innerHTML = opts.map((o, idx)=>`
    <button type="button" class="cs-opt-btn ${o.selected?'selected':''}" onclick="pickCustomSelectOption(${idx})">
      <span>${esc(o.textContent)}</span>
      <span>${o.selected?'●':'○'}</span>
    </button>
  `).join('');
  document.getElementById('customSelectModal').classList.add('show');
}
function pickCustomSelectOption(idx){
  if(_activeNativeSelect && _activeNativeSelect.options[idx]){
    _activeNativeSelect.selectedIndex = idx;
    _activeNativeSelect.dispatchEvent(new Event('change', {bubbles:true}));
    syncCustomSelectTriggers();
  }
  closeCustomSelectModal();
}
function syncCustomSelectTriggers(){
  document.querySelectorAll('select').forEach(sel=>{
    if(sel.id === 'actAccountFilter' || sel.id === 'repPeriodMode') return;
    let trig = sel.nextElementSibling;
    if(!trig || !trig.classList.contains('custom-sel-trigger')){
      sel.style.display = 'none';
      trig = document.createElement('div');
      trig.className = 'custom-sel-trigger';
      trig.innerHTML = '<span class="cs-val"></span><span class="cs-arr">▼</span>';
      trig.onclick = () => openCustomSelectFor(sel);
      sel.parentNode.insertBefore(trig, sel.nextSibling);
    }
    const curOpt = sel.options[sel.selectedIndex];
    trig.querySelector('.cs-val').textContent = curOpt ? curOpt.textContent : '';
  });
}

function renderAll(){
  syncCustomSelectTriggers();
  renderTransactionsScreen();
  renderReportsScreen();
  renderAccountsAndCards();
  renderPlanScreen();
  renderSettingsCategories();
}

/* Horizontal Swipe Navigation (5 Main Screens + Sub-tabs, Left-to-Right Tab Order) */
(function initSwipeNavigation(){
  const MAIN_PAGES = ['trans', 'reports', 'wallet', 'plan', 'settings'];
  const SUB_TABS = {
    trans: {
      list: ['daily', 'monthly'],
      getActive: () => activeTransSubTab || 'daily',
      setActive: (val) => switchTransSubTab(val)
    },
    reports: {
      list: ['inc', 'exp'],
      getActive: () => activeReportTab || 'exp',
      setActive: (val) => switchReportTab(val)
    },
    wallet: {
      list: ['acc', 'card'],
      getActive: () => document.getElementById('tabBtnCard')?.classList.contains('active') ? 'card' : 'acc',
      setActive: (val) => switchWalletTab(val)
    },
    plan: {
      list: ['com', 'yr'],
      getActive: () => document.getElementById('tabBtnYr')?.classList.contains('active') ? 'yr' : 'com',
      setActive: (val) => switchPlanTab(val)
    }
  };

  let startX = 0, startY = 0, startTime = 0, ignoreTouch = false;

  document.addEventListener('touchstart', function(e){
    if(e.touches.length !== 1) { ignoreTouch = true; return; }
    if(document.querySelector('.modal.show')) { ignoreTouch = true; return; }
    const tgt = e.target;
    if(tgt && tgt.closest('input, textarea, select, .excel-table-wrap, [contenteditable="true"]')) {
      ignoreTouch = true;
      return;
    }
    ignoreTouch = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
  }, {passive: true});

  document.addEventListener('touchend', function(e){
    if(ignoreTouch || !e.changedTouches.length) return;
    if(document.querySelector('.modal.show')) return;
    const dt = Date.now() - startTime;
    if(dt > 650) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if(Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;

    const curPage = document.querySelector('.screen.active')?.id || 'trans';
    const pageIdx = MAIN_PAGES.indexOf(curPage);
    if(pageIdx === -1) return;

    const step = (dx < 0) ? 1 : -1;

    const subCfg = SUB_TABS[curPage];
    if(subCfg){
      const curSub = subCfg.getActive();
      const subIdx = subCfg.list.indexOf(curSub);
      const nextSubIdx = subIdx + step;
      if(nextSubIdx >= 0 && nextSubIdx < subCfg.list.length){
        subCfg.setActive(subCfg.list[nextSubIdx]);
        return;
      }
    }

    const nextPageIdx = pageIdx + step;
    if(nextPageIdx >= 0 && nextPageIdx < MAIN_PAGES.length){
      const nextPage = MAIN_PAGES[nextPageIdx];
      const navBtn = document.querySelector(`.nav[data-page="${nextPage}"]`);
      go(nextPage, navBtn);
      const nextSubCfg = SUB_TABS[nextPage];
      if(nextSubCfg){
        const targetSub = step > 0 ? nextSubCfg.list[0] : nextSubCfg.list[nextSubCfg.list.length - 1];
        nextSubCfg.setActive(targetSub);
      }
    }
  }, {passive: true});
})();

/* Full UI Bilingual Translation Engine (Arabic <-> English) with Fixed Layout Directions */
const UI_TEXT_PAIRS = [
  ['المعاملات', 'Transactions'],
  ['تحليل المعاملات', 'Analytics'],
  ['الحسابات', 'Accounts'],
  ['البطاقات', 'Cards'],
  ['الالتزامات', 'Commitments'],
  ['المزيد', 'More'],
  ['المعاملات اليومية', 'Daily Transactions'],
  ['الملخص الشهري', 'Monthly Summary'],
  ['الدخل', 'Income'],
  ['المصروفات', 'Expenses'],
  ['الصافي', 'Net'],
  ['إجمالي أرصدة جميع الحسابات', 'Total Accounts Balance'],
  ['＋ إضافة حساب جديد', '＋ Add New Account'],
  ['الحسابات المسجلة', 'Registered Accounts'],
  ['إجمالي أرصدة البطاقات (المستخدم حالياً)', 'Total Used Cards Balance'],
  ['💳 إضافة بطاقة جديدة', '💳 Add New Card'],
  ['البطاقات المسجلة', 'Registered Cards'],
  ['كل عمليات البطاقة', 'All Card Operations'],
  ['التقرير المالي السنوي', 'Yearly Financial Report'],
  ['＋ إضافة التزام جديد', '＋ Add New Commitment'],
  ['مستحقات مؤجلة', 'Deferred Dues'],
  ['التزامات شهرية', 'Monthly Commitments'],
  ['معاملات بالبطاقة', 'Card Operations'],
  ['مستحقات الشهر', 'Monthly Dues'],
  ['⚙ إعدادات عامة', '⚙ General Settings'],
  ['💼 حاسبة المرتب (الشهرية والسنوية)', '💼 Salary Calculator'],
  ['🏷 تخصيص الأقسام', '🏷 Customize Categories'],
  ['💾 النسخ الاحتياطي', '💾 Backup & Restore'],
  ['⟳ التحديثات', '⟳ Updates'],
  ['⚠ مسح البيانات', '⚠ Wipe Data'],
  ['تسجيل حركة جديدة', 'New Transaction'],
  ['مصروف', 'Expense'],
  ['دخل', 'Income'],
  ['تحويل', 'Transfer'],
  ['التاريخ', 'Date'],
  ['الحساب', 'Account'],
  ['من حساب', 'From Account'],
  ['إلى حساب', 'To Account'],
  ['القسم', 'Category'],
  ['المبلغ', 'Amount'],
  ['رسوم', 'Fee'],
  ['البيان / ملاحظة', 'Note / Memo'],
  ['حفظ', 'Save'],
  ['إلغاء', 'Cancel'],
  ['إغلاق', 'Close']
];

function applyLanguageTranslations(lang){
  const isEn = (lang === 'en');
  updateTopTabTitle();
  const map = new Map(UI_TEXT_PAIRS.map(([ar, en]) => isEn ? [ar, en] : [en, ar]));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while((node = walker.nextNode())){
    const raw = node.nodeValue.trim();
    if(raw && map.has(raw)){
      node.nodeValue = node.nodeValue.replace(raw, map.get(raw));
    }
  }
  const searchInp = document.getElementById('actSearch');
  if(searchInp) searchInp.placeholder = isEn ? 'Search memo, notes or category...' : 'بحث في البيان أو الملاحظات أو القسم...';
  syncCustomSelectTriggers();
}

/* Boot */
applyPreferences();
initSalary();
const curYM = selected();
setv('comStartVal', curYM);
const comStartLbl = document.getElementById('comStartLabel');
if(comStartLbl) comStartLbl.textContent = formatYMArabic(curYM);
setv('opPurchaseVal', curYM);
const opPurLbl = document.getElementById('opPurchaseLabel');
if(opPurLbl) opPurLbl.textContent = formatYMArabic(curYM);
setv('defDueDate', today());
recalcMonthlyCommitmentEnd();
updateBackupStatusUI();
renderAll();
recoverFromIndexedDBIfNeeded();
try{if('serviceWorker'in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});setTimeout(()=>checkForUpdate(true),1500);})}catch(e){}
