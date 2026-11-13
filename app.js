const APP_VERSION='12.3';
const APP_BUILD='2026-11-13';
const KEY='raseed_mobile_v2';

const monthNamesAr=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const dayNamesAr=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

const DEFAULT_EXP_TREE = {};
const DEFAULT_INC_TREE = {};

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

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(s){let x=document.getElementById('toast');x.textContent=s;x.style.display='block';setTimeout(()=>x.style.display='none',2300)}

function formatYMArabic(ym){
  if(!ym || !ym.includes('-')) return 'مفتوح';
  const [y,m]=ym.split('-');
  return `${monthNamesAr[Number(m)-1]||m} ${y}`;
}
function addMonthsYM(ym, add){
  if(!ym || !ym.includes('-')) return selected();
  let [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, (m - 1) + add, 1);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}

/* IndexedDB Dual-Storage Engine (Protects against accidental localStorage clearing & 5MB limits) */
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
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){toast('تم الحفظ في IndexedDB (ذاكرة المتصفح ممتلئة)')}
  saveToIndexedDB(state);
  updateBackupStatusUI();
  renderAll();
}

/* Custom Unified Dialog System (Replaces native confirm & prompt) */
let _appDialogState = null;
function closeAppDialog(){
  const m = document.getElementById('appDialogModal');
  if(m) m.classList.remove('show');
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
function showAppCustomForm(title, bodyHtml, onSubmit){
  _appDialogState = { mode:'custom', onSubmit };
  document.getElementById('appDialogTitle').textContent = title || 'تعديل';
  document.getElementById('appDialogMsg').style.display = 'none';
  document.getElementById('appDialogInputWrap').style.display = 'none';
  const cb = document.getElementById('appDialogCustomBody');
  cb.innerHTML = bodyHtml;
  cb.style.display = 'block';
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

/* Exit Confirmation & Back-Button Handling (Chrome & Installed PWA) */
let _allowExit = false;
/* Native beforeunload suppressed in favor of custom Exit Confirmation Card */
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
  const qm = document.getElementById('quickModal');
  const am = document.getElementById('accountModal');
  const ym = document.getElementById('ymModal');
  const em = document.getElementById('exitConfirmModal');
  if(qm && qm.classList.contains('show')){ closeQuickModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  if(am && am.classList.contains('show')){ closeAccountModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
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
  if(em && !em.classList.contains('show')){
    em.classList.add('show');
  }
});

/* Auto-Collapse: Opening any <details class="fold"> closes all other open folds in the same page */
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
  // Keep layout direction fixed as requested without flipping directions on English
  document.documentElement.dir = 'rtl';
  setv('prefFontSize', p.fontSize || '1');

  document.querySelectorAll('.dec-toggle-btn').forEach(b=>{
    b.classList.toggle('active', !!p.homeDecimals);
    b.textContent = lang === 'en' ? '.00 Decimals' : '.00 الكسور';
  });
  document.querySelectorAll('.privacy-toggle-btn').forEach(b=>{
    b.classList.toggle('active', !!p.privacy);
    b.textContent = p.privacy ? (lang === 'en' ? '🙈 Hidden' : '🙈 مخفي') : (lang === 'en' ? '👁 Privacy' : '👁 الإخفاء');
  });
  applyLanguageTranslations(lang);

  const defAccSel = document.getElementById('prefDefaultAcc');
  if(defAccSel){
    defAccSel.innerHTML = '<option value="">بدون افتراضي</option>' + state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    defAccSel.value = p.defaultAccount || '';
  }
}
function saveGeneralSettings(){
  state.prefs = state.prefs || {};
  state.prefs.userName = (document.getElementById('prefUserName')?.value || '').trim();
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

/* Navigation */
const TAB_TITLES = {
  ar: { trans:'المعاملات', reports:'التقارير', wallet:'الحسابات', plan:'الالتزامات', settings:'الإعدادات' },
  en: { trans:'Transactions', reports:'Reports', wallet:'Accounts', plan:'Commitments', settings:'Settings' }
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
  document.getElementById('planViewSal').style.display = which==='sal' ? 'block' : 'none';
  document.getElementById('tabBtnCom').classList.toggle('active', which==='com');
  document.getElementById('tabBtnSal').classList.toggle('active', which==='sal');
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
  renderReportsScreen();
}
let activeReportCategoryFilter = null; // { category, type }

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
function filterTransactionsByCategory(catName, txType){
  const cleanCat = String(catName||'').trim();
  activeReportCategoryFilter = { category: cleanCat, type: txType || '' };
  state.prefs = state.prefs || {};
  state.prefs.savedSearch = cleanCat;
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){}
  const box = document.getElementById('mmSearchBox');
  const btn = document.getElementById('btnToggleSearch');
  const inp = document.getElementById('actSearch');
  const clrBtn = document.getElementById('btnClearSearch');
  if(box) box.style.display = 'block';
  if(btn) btn.classList.add('active');
  if(inp) inp.value = cleanCat;
  if(clrBtn) clrBtn.style.display = cleanCat ? 'block' : 'none';
  go('trans', document.querySelector('.nav[data-page="trans"]'));
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
    if(l.from===a.id)n-=Number(l.amount)||0;
    if(l.to===a.id)n+=Number(l.amount)||0;
  }
  return round2(n);
}
function allAccountsAvailable(){
  return round2((state.accounts||[]).filter(a=>a.type!=='credit').reduce((s,a)=>s+accountBalance(a),0));
}
function opOutstanding(op){
  return op.type==='installment'
    ? op.schedules.reduce((s,x)=>s+Math.max(0,x.amount-x.paid),0)+Math.max(0,(op.feeDue||0)-(op.feePaid||0))
    : Math.max(0,op.amount-op.paid);
}
function cardOpsOutstandingFor(cardId){
  return (state.cardOps||[]).filter(o=>o.cardId===cardId).reduce((s,o)=>s+opOutstanding(o),0);
}
function cardTotalOutstanding(card){
  return round2(Math.max(0,Number(card.balance)||0) + cardOpsOutstandingFor(card.id));
}
function cardCurrentAvailable(card){
  const lim=Number(card.limit)||0;
  if(lim<=0) return null;
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
function isLoanActiveInMonth(c, m){
  if(!c.dueDate) return true;
  return m <= String(c.dueDate).slice(0, 7);
}
function monthCommitmentsStats(m){
  const monthlyList = (state.commitments||[]).filter(c=>(c.freq||'monthly')==='monthly' && commitmentDue(c,m));
  const dueLoansInMonth = (state.commitments||[]).filter(c=>c.freq==='once' && c.dueDate && String(c.dueDate).slice(0,7)===m);
  const list = [...monthlyList, ...dueLoansInMonth];
  let due=0, paid=0;
  for(const c of list){
    const cAmt=Number(c.amount)||0;
    const cPaid=(c.freq==='once')
      ? (state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0)
      : (state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id&&p.month===m).reduce((s,p)=>s+(Number(p.amount)||0),0);
    due+=cAmt;
    paid+=Math.min(cAmt,cPaid);
  }
  return {list, due:round2(due), paid:round2(paid), remain:round2(Math.max(0,due-paid))};
}
function oneTimeDebtsStats(m){
  const curM = m || selected();
  const list=(state.commitments||[]).filter(c=>c.freq==='once' && isLoanActiveInMonth(c, curM));
  let total=0, paid=0;
  for(const c of list){
    const cAmt=Number(c.amount)||0;
    const cPaid=(state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0);
    total+=cAmt;
    paid+=Math.min(cAmt,cPaid);
  }
  return {list, total:round2(total), paid:round2(paid), remain:round2(Math.max(0,total-paid))};
}

/* 1. Render Transactions Screen (Supports Daily & Monthly Tabs like Money Manager) */
let activeTransSubTab = 'daily'; // 'daily' | 'monthly'
const monthNamesEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayNamesEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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
  if(activeTransSubTab === 'monthly'){
    openHomePeriodPicker();
  } else {
    openHomePeriodPicker();
  }
}

function selectMonthFromMonthlyTab(yr, mn){
  activeYear = yr;
  activeMonth = mn;
  forecastYear = yr;
  switchTransSubTab('daily');
  renderAll();
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

  // === MODE B: MONTHLY TAB (Like Money Manager Monthly Screenshot) ===
  if(activeTransSubTab === 'monthly'){
    document.getElementById('homePeriodLabel').textContent = String(activeYear);
    let yrInc = 0, yrExp = 0;
    const monthRows = [];
    for(let mn = 12; mn >= 1; mn--){
      const ym = String(activeYear) + '-' + String(mn).padStart(2, '0');
      const mt = totals(ym);
      yrInc = round2(yrInc + mt.inc);
      yrExp = round2(yrExp + mt.exp);
      const lastDay = new Date(activeYear, mn, 0).getDate();
      const mLabel = isEn ? monthNamesEn[mn-1] : monthNamesAr[mn-1];
      const rangeStr = `${String(mn).padStart(2,'0')}.01 - ${String(mn).padStart(2,'0')}.${String(lastDay).padStart(2,'0')}`;
      monthRows.push({ mn, ym, mLabel, rangeStr, inc: mt.inc, exp: mt.exp, net: mt.net });
    }
    const yrNet = round2(yrInc - yrExp);
    document.getElementById('incomeHero').textContent = maskable(fmtNum(yrInc));
    document.getElementById('expenseHero').textContent = maskable(fmtNum(yrExp));
    const remEl = document.getElementById('remaining');
    remEl.textContent = maskable(fmtNum(yrNet));
    remEl.className = yrNet >= 0 ? 'mint' : 'red';

    feed.innerHTML = `<div class="day-group">` + monthRows.map(r => `
      <div class="mm-month-row ${r.mn === activeMonth ? 'cur-month' : ''}" onclick="selectMonthFromMonthlyTab(${activeYear}, ${r.mn})">
        <div class="mm-m-name">
          <b>${esc(r.mLabel)}</b>
          <small>${r.rangeStr}</small>
        </div>
        <div class="mm-m-inc blue">${maskable(fmt(r.inc))} EGP</div>
        <div class="mm-m-exp">
          <b class="red">${maskable(fmt(r.exp))} EGP</b>
          <small>${maskable(fmt(r.net))} EGP</small>
        </div>
      </div>
    `).join('') + `</div>`;
    return;
  }

  // === MODE A: DAILY TAB ===
  const t = totals(m);
  document.getElementById('homePeriodLabel').textContent = isEn ? `${monthNamesEn[activeMonth-1]} ${activeYear}` : formatYMArabic(m);
  document.getElementById('incomeHero').textContent = maskable(fmtNum(t.inc));
  document.getElementById('expenseHero').textContent = maskable(fmtNum(t.exp));
  const remEl = document.getElementById('remaining');
  remEl.textContent = maskable(fmtNum(t.net));
  remEl.className = t.net >= 0 ? 'mint' : 'red';

  const txList = monthTx(m).map(x=>({...x, _kind:'tx'}));
  const ledList = (state.ledger||[]).filter(l=>monthKey(l.date)===m).map(l=>{
    const fromA = state.accounts.find(a=>a.id===l.from)?.name || (isEn?'Account':'حساب');
    const toA = state.accounts.find(a=>a.id===l.to)?.name || (isEn?'Account':'حساب');
    return {
      id: l.id,
      type: l.type,
      category: l.type==='transfer' ? (isEn?'Transfer':'تحويل') : (isEn?'Adjustment':'تسوية'),
      subCategory: '',
      title: l.type==='transfer' ? `${fromA} → ${toA}` : (l.note || (isEn?'Balance Adjustment':'تسوية رصيد')),
      accountLabel: l.type==='transfer' ? `${fromA} → ${toA}` : fromA,
      accountId: l.from,
      amount: l.type==='transfer' ? Number(l.amount)||0 : Number(l.delta??l.amount)||0,
      date: l.date,
      _kind: 'ledger'
    };
  });

  let combined = [...txList, ...ledList].filter(it=>{
    if(accFilter && it.accountId !== accFilter) return false;
    if(activeReportCategoryFilter && rawQ === activeReportCategoryFilter.category){
      const itCat = String(it.category||'أخرى').trim() || 'أخرى';
      if(itCat !== activeReportCategoryFilter.category) return false;
      if(activeReportCategoryFilter.type === 'expense' && !isActualExpenseTx(it)) return false;
      if(activeReportCategoryFilter.type === 'income' && it.type !== 'income') return false;
      return true;
    }
    if(q && !(String(it.title||'').toLowerCase().includes(q) || String(it.category||'').toLowerCase().includes(q) || String(it.subCategory||'').toLowerCase().includes(q))) return false;
    return true;
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));

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
    const naturalDateText = isEn
      ? `${dayName} ${dayNum}-${monNum}-${yrNum}`
      : `${dayName} ${dayNum}‏-${monNum}‏-${yrNum}`;

    let dayInc = 0, dayExp = 0;
    for(const it of items){
      if(it.type === 'income') dayInc += Number(it.amount)||0;
      else if(isActualExpenseTx(it)) dayExp += Number(it.amount)||0;
    }

    const rowsHtml = items.map(it=>{
      let accName = it.accountLabel || (state.accounts.find(a=>a.id===it.accountId)?.name || (isCardPurchaseTx(it)?(isEn?'Credit Card':'بطاقة ائتمان'):''));
      let amtClass = it.type==='income' ? 'blue' : (it.type==='transfer' ? 'mint' : (isCardPurchaseTx(it) ? 'orange' : 'red'));
      let amtPrefix = it.type==='income' ? '+' : (it.type==='transfer' ? '⇄ ' : '−');
      const canEdit = it._kind === 'tx' && !isCardPurchaseTx(it) && !String(it.id).startsWith('salary-');
      const actions = it._kind === 'tx' ? `
        <div class="tap-actions">
          <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="duplicateTxToday('${esc(it.id)}')">${isEn?'Duplicate Today ↻':'تكرار اليوم ↻'}</button>
          ${canEdit ? `<button type="button" class="smallbtn" onclick="openEditQuickTx('${esc(it.id)}')">${isEn?'Edit':'تعديل'}</button>` : ''}
          <button type="button" class="smallbtn danger" onclick="deleteTransaction('${esc(it.id)}')">${isEn?'Delete':'حذف'}</button>
        </div>` : '';
      const rawTitle = String(it.title||'').trim();
      const isDupTitle = !rawTitle || rawTitle === String(it.category||'').trim() || rawTitle === String(it.subCategory||'').trim();
      const memoLine = isDupTitle ? '' : rawTitle;
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
            <span dir="${isEn?'ltr':'rtl'}" style="font-size:.8rem;color:var(--text);unicode-bidi:isolate">${naturalDateText}</span>
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

function duplicateTxToday(id){
  const orig = state.transactions.find(x=>String(x.id)===String(id));
  if(!orig) return;
  state.transactions.push({
    ...orig,
    id: 'tx-' + Date.now(),
    date: today()
  });
  persist();
  toast('تم تكرار الحركة بتاريخ اليوم ✓');
}

/* 2. Render Reports Screen (3 Functions: Monthly Expense by Main Cat, Monthly Income by Main Cat, Yearly Report) */
let activeReportTab = 'exp';
const CHART_COLORS = ['#ff6b6b','#ff9f43','#feca57','#1dd1a1','#48dbfb','#54a0ff','#5f27cd','#ff9ff3','#00d2d3','#c8d6e5','#ee5253','#10ac84'];

function switchReportTab(tab){
  activeReportTab = tab;
  document.getElementById('repTabExp').classList.toggle('active', tab==='exp');
  document.getElementById('repTabInc').classList.toggle('active', tab==='inc');
  document.getElementById('repTabYr').classList.toggle('active', tab==='yr');
  document.getElementById('repViewMonthly').style.display = tab==='yr' ? 'none' : 'block';
  document.getElementById('repViewYearly').style.display = tab==='yr' ? 'block' : 'none';
  renderReportsScreen();
}

function renderMonthlyCategoryReport(curYM, mode){
  document.getElementById('repPeriodLabel').textContent = formatYMArabic(curYM);
  const isInc = (mode === 'inc');
  const mTxs = monthTx(curYM).filter(t => isInc ? t.type==='income' : isActualExpenseTx(t));

  const byMain = {};
  let grandTotal = 0;
  for(const t of mTxs){
    const amt = Number(t.amount)||0;
    if(amt <= 0) continue;
    const cat = String(t.category||'أخرى').trim() || 'أخرى';
    byMain[cat] = round2((byMain[cat]||0) + amt);
    grandTotal = round2(grandTotal + amt);
  }

  const lblEl = document.getElementById('repMonthlyTotalLabel');
  const valEl = document.getElementById('repMonthlyTotalVal');
  lblEl.textContent = isInc ? 'إجمالي الدخل' : 'إجمالي المصاريف';
  valEl.textContent = maskable(egp(grandTotal));
  valEl.className = isInc ? 'blue' : 'red';

  const entries = Object.entries(byMain).sort((a,b)=>b[1]-a[1]);
  const donutWrap = document.getElementById('repDonutWrap');
  const chipsWrap = document.getElementById('repLegendChips');
  const listEl = document.getElementById('repCatBreakdownList');

  if(!entries.length || grandTotal <= 0){
    donutWrap.innerHTML = '<div class="empty">لا توجد بيانات</div>';
    chipsWrap.innerHTML = '';
    listEl.innerHTML = `<div class="empty">لا توجد ${isInc?'إيرادات':'مصاريف'} مسجلة في ${formatYMArabic(curYM)}.</div>`;
    return;
  }

  // Conic-gradient Donut Chart
  let accPct = 0;
  const stops = [];
  entries.forEach(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = (amt / grandTotal) * 100;
    stops.push(`${color} ${accPct.toFixed(2)}% ${(accPct + pct).toFixed(2)}%`);
    accPct += pct;
  });
  donutWrap.innerHTML = `
    <div style="width:164px;height:164px;border-radius:50%;background:conic-gradient(${stops.join(',')});display:grid;place-items:center;box-shadow:0 6px 20px #0004">
      <div style="width:96px;height:96px;border-radius:50%;background:var(--panel);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4px">
        <small style="font-size:.6rem;color:var(--muted)">${isInc?'الدخل':'المصاريف'}</small>
        <b style="font-size:.76rem;direction:ltr">${maskable(fmtInt(grandTotal))}</b>
      </div>
    </div>
  `;

  const repTypeStr = isInc ? 'income' : 'expense';
  chipsWrap.innerHTML = entries.slice(0, 6).map(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = Math.round((amt / grandTotal) * 100);
    return `<span class="tag" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer" onclick="filterTransactionsByCategory(${ JSON.stringify(cat).replace(/"/g,'&quot;') }, '${repTypeStr}')"><i style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></i>${esc(cat)} ${pct}%</span>`;
  }).join('');

  listEl.innerHTML = entries.map(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = Math.max(1, Math.round((amt / grandTotal) * 100));
    return `
      <div class="listitem" style="cursor:pointer;align-items:center;padding:10px 4px" onclick="filterTransactionsByCategory(${ JSON.stringify(cat).replace(/"/g,'&quot;') }, '${repTypeStr}')" title="اضغط لعرض معاملات هذا البند">
        <span style="background:${color};color:#08121e;font-weight:400;font-size:.7rem;padding:3px 7px;border-radius:8px;min-width:42px;text-align:center">${pct}%</span>
        <div class="info" style="padding:0 6px">
          <b>${esc(cat)}</b>
        </div>
        <strong style="direction:ltr;font-size:.86rem">${maskable(egp(amt))} ‹</strong>
      </div>
    `;
  }).join('');
}

function renderReportsScreen(){
  renderMonthlyCategoryReport(selected(), activeReportTab === 'inc' ? 'inc' : 'exp');
  const curYM = selected();
  const y = String(forecastYear);
  const defs = (state.reportDefaults||{})[y] || {salary:0, profit:0};
  const sInp = document.getElementById('repDefSalary');
  const pInp = document.getElementById('repDefProfit');
  if(sInp && document.activeElement !== sInp) sInp.value = defs.salary || '';
  if(pInp && document.activeElement !== pInp) pInp.value = defs.profit || '';

  function getMonthForecast(mk){
    const yr = mk.slice(0,4);
    const dYr = (state.reportDefaults||{})[yr] || defs;
    const mTxs = monthTx(mk);
    const actualSal = round2(mTxs.filter(x=>x.type==='income' && (x.category==='راتب' || String(x.source||'').startsWith('salary:'))).reduce((s,x)=>s+(Number(x.amount)||0),0));
    const actualProf = round2(mTxs.filter(x=>x.type==='income' && x.category==='أرباح').reduce((s,x)=>s+(Number(x.amount)||0),0));
    const otherInc = round2(mTxs.filter(x=>x.type==='income' && x.category!=='راتب' && !String(x.source||'').startsWith('salary:') && x.category!=='أرباح').reduce((s,x)=>s+(Number(x.amount)||0),0));

    const sal = actualSal > 0 ? actualSal : (Number(dYr.salary)||0);
    const prof = actualProf > 0 ? actualProf : (Number(dYr.profit)||0);
    const totInc = round2(sal + prof + otherInc);

    // Commitments & Installments due in month mk
    const comStats = monthCommitmentsStats(mk);
    let extraCardDue = 0;
    const syncedOpIds = new Set((state.commitments||[]).filter(c=>c.cardOpId).map(c=>c.cardOpId));
    (state.cardOps||[]).forEach(o=>{
      if(o.type==='swipe' && o.dueDate && o.dueDate.slice(0,7)===mk){
        extraCardDue += Number(o.amount)||0;
      } else if(o.type==='installment'){
        if(o.feeMonth===mk) extraCardDue += Number(o.feeDue)||0;
        if(!syncedOpIds.has(o.id)){
          (o.schedules||[]).forEach(sc=>{ if(sc.month===mk) extraCardDue += Number(sc.amount)||0; });
        }
      }
    });

    const totDue = round2(comStats.due + extraCardDue);
    const diff = round2(totInc - totDue);
    return {mk, sal, prof, totInc, totDue, diff};
  }

  const nextMK = addMonthsYM(curYM, 1);
  const nextFc = getMonthForecast(nextMK);
  document.getElementById('fcNextMonthNet').textContent = maskable((nextFc.diff>=0?'+':'') + egpSmart(nextFc.diff));
  document.getElementById('fcNextMonthSub').textContent = `توقع شهر ${formatYMArabic(nextMK)} (${nextFc.diff>=0?'فائض متوقع':'عجز متوقع'})`;
  document.getElementById('fcExpectedSal').textContent = maskable(fmtNum(nextFc.totInc));
  document.getElementById('fcNextDue').textContent = maskable(fmtNum(nextFc.totDue));
  document.getElementById('fcLoansRemain').textContent = maskable(fmtNum(oneTimeDebtsStats(curYM).remain));

  document.getElementById('forecastYearLabel').textContent = y;
  let rowsHtml = '';
  let sumInc = 0, sumDue = 0, sumDiff = 0;
  for(let m=1; m<=12; m++){
    const mk = y + '-' + String(m).padStart(2,'0');
    const fc = getMonthForecast(mk);
    sumInc += fc.totInc; sumDue += fc.totDue; sumDiff += fc.diff;
    rowsHtml += `<tr class="${mk===curYM?'cur-row':''}">
      <td><b>${monthNamesAr[m-1]}</b></td>
      <td class="num blue">${maskable(fmtInt(fc.totInc))}</td>
      <td class="num orange">${maskable(fmtInt(fc.totDue))}</td>
      <td class="num ${fc.diff>=0?'mint':'red'}"><b>${maskable((fc.diff>0?'+':'')+fmtInt(fc.diff))}</b></td>
    </tr>`;
  }
  rowsHtml += `<tr style="background:var(--surface);font-weight:400">
    <td>الإجمالي</td>
    <td class="num blue">${maskable(fmtInt(sumInc))}</td>
    <td class="num orange">${maskable(fmtInt(sumDue))}</td>
    <td class="num ${sumDiff>=0?'mint':'red'}">${maskable((sumDiff>0?'+':'')+fmtInt(sumDiff))}</td>
  </tr>`;
  document.getElementById('yearlyBreakdownBody').innerHTML = rowsHtml;
}

function saveReportDefaults(){
  const y = String(forecastYear);
  state.reportDefaults = state.reportDefaults || {};
  state.reportDefaults[y] = { salary: num('repDefSalary'), profit: num('repDefProfit') };
  persist();
  toast('تم حفظ الدخل المتوقع لسنة ' + y);
}

/* 3. Ergonomic Money Manager Quick Entry Modal (Auto-Starts at Account -> Auto-Moves to Categories in Lower Half) */
let qmState = { type:'expense', accountId:'', toAccountId:'', category:'', subCategory:'', isCard:false, cardMode:'swipe', editId:null, dock:'acc' };

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

function openQuickAddModal(defaultType){
  const tree = defaultType === 'income' ? state.categoryTree.income : state.categoryTree.expense;
  const firstMain = Object.keys(tree)[0] || 'أخرى';
  qmState = {
    type: defaultType || 'expense',
    accountId: state.prefs?.defaultAccount || (state.accounts[0]?.id || ''),
    toAccountId: state.accounts[1]?.id || '',
    category: firstMain,
    subCategory: '',
    isCard: false,
    cardMode: 'swipe',
    editId: null,
    dock: 'acc'
  };
  document.getElementById('qmHeaderTitle').textContent = 'تسجيل حركة جديدة';
  setv('qmDate', today());
  setv('qmAmount', '');
  setv('qmNote', '');
  setQuickTxType(qmState.type);
  renderQuickPickers();
  setQmDockMode('acc');
  document.getElementById('quickModal').classList.add('show');
}

function openEditQuickTx(id){
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(!t) return;
  qmState = {
    type: t.type === 'income' ? 'income' : 'expense',
    accountId: t.accountId || '',
    toAccountId: '',
    category: t.category || 'أخرى',
    subCategory: t.subCategory || '',
    isCard: false,
    cardMode: 'swipe',
    editId: t.id,
    dock: 'cat'
  };
  document.getElementById('qmHeaderTitle').textContent = 'تعديل حركة';
  setv('qmDate', t.date || today());
  setv('qmAmount', t.amount || '');
  setv('qmNote', t.title || '');
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
  document.getElementById('qmTabExp').classList.toggle('active', t==='expense');
  document.getElementById('qmTabInc').classList.toggle('active', t==='income');
  document.getElementById('qmTabTrn').classList.toggle('active', t==='transfer');

  document.getElementById('qmToAccRow').style.display = t==='transfer' ? 'flex' : 'none';
  document.getElementById('qmCatRow').style.display = t==='transfer' ? 'none' : 'flex';
  document.getElementById('qmAccLabelTitle').textContent = t==='transfer' ? 'من حساب :' : 'الحساب :';

  if(t !== 'expense'){
    qmState.isCard = false;
    document.getElementById('qmCardModeRow').style.display = 'none';
    document.getElementById('qmCardMonthsRow').style.display = 'none';
  }
  if(t !== 'transfer'){
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
  if(qmState.type === 'expense' && !qmState.editId){
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
    document.getElementById('qmAccSelectedText').textContent = 'أضف حسابًا أولاً';
  }
  document.getElementById('qmAccGrid').innerHTML = accItems.map(a=>`
    <button type="button" class="qg-item ${a.id===qmState.accountId?'selected':''}" onclick="selectQuickAcc('${a.id}', ${a.isCard})">${esc(a.name)}</button>
  `).join('');

  const toAcc = state.accounts.find(a=>a.id===qmState.toAccountId) || state.accounts.find(a=>a.id!==qmState.accountId);
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
    document.getElementById('qmCatSelectedText').textContent = 'لا توجد أقسام (استورد .mmbak أو أضف)';
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
      mainColEl.innerHTML = '<div class="empty" style="padding:14px 4px;font-size:.68rem">القائمة فارغة.<br>اضغط «＋ رئيسي» أو استورد ملف Money Manager.</div>';
      subColEl.innerHTML = '<div class="empty" style="padding:14px 4px;font-size:.68rem">—</div>';
    } else {
      mainColEl.innerHTML = mainCats.map(mc=>{
        const subsCount = (tree[mc]||[]).length;
        return `<button type="button" class="mm-cat-item ${mc===qmState.category?'active':''}" onclick="selectQuickMainCat('${esc(mc)}')">
          <span>${esc(mc)}</span>
          ${subsCount ? `<small style="opacity:.7">‹</small>` : ''}
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

/* Selecting Account automatically jumps to Categories (or To-Account for transfer) */
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
  const amt = document.getElementById('qmAmount');
  if(amt) amt.focus();
}
function selectQuickMainCat(mc){
  qmState.category = mc;
  qmState.subCategory = '';
  renderQuickPickers();
  const subs = getActiveCatTree()[mc] || [];
  if(!subs.length){
    setQmDockMode('none');
    const amt = document.getElementById('qmAmount');
    if(amt) amt.focus();
  }
}
function selectQuickSubCat(sc){
  qmState.subCategory = sc;
  renderQuickPickers();
  setQmDockMode('none');
  const amt = document.getElementById('qmAmount');
  if(amt) amt.focus();
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
  const date = val('qmDate') || today();
  const note = val('qmNote').trim();
  if(amount <= 0) return toast('أدخل المبلغ بشكل صحيح');

  if(qmState.type === 'transfer'){
    if(!qmState.accountId || !qmState.toAccountId || qmState.accountId === qmState.toAccountId){
      return toast('اختر حسابين مختلفين للتحويل');
    }
    state.ledger.push({
      id: 'ledger-' + Date.now(),
      type: 'transfer',
      from: qmState.accountId,
      to: qmState.toAccountId,
      amount,
      fee: 0,
      note: note || 'تحويل بين الحسابات',
      date
    });
    persist(); closeQuickModal(); toast('تم تسجيل التحويل ✓');
    return;
  }

  if(qmState.isCard && qmState.type === 'expense'){
    const card = state.cards.find(c=>c.id===qmState.accountId);
    if(!card) return toast('اختر البطاقة');
    const title = note || qmState.subCategory || qmState.category || 'شراء بالبطاقة';
    const opType = qmState.cardMode;
    let op = {id:'op-'+Date.now(), cardId:card.id, type:opType, title, amount, date, paid:0, dueDate:dueDateFor(card,date)};
    if(opType === 'installment'){
      const months = num('qmCardMonths') || 12;
      const t = (card.terms||{})[months] || {monthlyRate:0, adminRate:0};
      const interest = round2(amount * t.monthlyRate * months);
      const fee = round2(amount * t.adminRate);
      const base = round2((amount + interest) / months);
      const purchaseYM = date.slice(0,7);
      const feeYM = addMonthsYM(purchaseYM, 1);
      op.purchaseMonth = purchaseYM; op.months = months; op.interest = interest;
      op.adminFee = fee; op.installment = base; op.total = round2(amount + interest + fee);
      op.feeMonth = feeYM; op.feeDue = fee; op.feePaid = 0;
      let [fy, fm] = feeYM.split('-').map(Number);
      op.schedules = Array.from({length:months}, (_, i) => {
        let dt = new Date(fy, (fm - 1) + 1 + i, 1);
        return {month: dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'), amount: base, principalAndInterest: base, fee: 0, paid: 0};
      });
    }
    state.cardOps.push(op);
    state.transactions.push({id:'card-purchase-'+op.id, type:'card_purchase', title:'شراء بالبطاقة - '+title, category:qmState.category||'مشتريات بطاقة', subCategory:qmState.subCategory||'', amount, date, accountId:null, source:'card-purchase:'+op.id});
    if(opType === 'installment') syncCardInstallmentsToCommitments();
    persist(); closeQuickModal(); toast(opType==='installment'?'تم تسجيل التقسيط وإضافة أقساطه ✓':'تم تسجيل الشراء على البطاقة ✓');
    return;
  }

  if(state.accounts.length && !qmState.accountId) return toast('اختر الحساب');
  const title = note;
  if(qmState.editId){
    const t = state.transactions.find(x=>String(x.id)===String(qmState.editId));
    if(t){
      t.type = qmState.type;
      t.category = qmState.category;
      t.subCategory = qmState.subCategory || '';
      t.title = title;
      t.amount = amount;
      t.date = date;
      t.accountId = qmState.accountId || null;
    }
    persist(); closeQuickModal(); toast('تم تعديل الحركة ✓');
    return;
  }

  state.transactions.push({
    id: 'tx-' + Date.now(),
    type: qmState.type,
    category: qmState.category,
    subCategory: qmState.subCategory || '',
    title,
    amount,
    date,
    accountId: qmState.accountId || null
  });
  persist(); closeQuickModal(); toast('تم الحفظ ✓');
}

function deleteTransaction(id){
  showAppConfirm('حذف الحركة', 'هل تريد حذف هذه الحركة نهائياً؟', ()=>{
    state.transactions = state.transactions.filter(x=>String(x.id)!==String(id));
    persist(); toast('تم الحذف');
  }, true);
}

/* 4. Fixed Money Manager (.mmbak) Importer — Accurately Maps All Main & Subcategories without 'أخرى' */
let mmPending = null;
function mmDefaultType(name, currency){
  if(!/EGP_EGP/i.test(String(currency||''))) return 'skip';
  if(/credit/i.test(String(name||''))) return 'skip';
  if(/cash/i.test(String(name||''))) return 'cash';
  if(/vodafone|wallet|wechat/i.test(String(name||''))) return 'wallet';
  return 'bank';
}
function mmTypeSelect(i, selected){
  const opts=[['cash','كاش'],['bank','بنك / Debit'],['wallet','محفظة إلكترونية'],['prepaid','بطاقة مسبقة'],['skip','استبعاد']];
  return `<select class="mmtype" data-index="${i}" style="width:100%;background:var(--surface);color:var(--text);border:1px solid var(--line2);border-radius:9px;padding:6px;margin-top:4px">${opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('')}</select>`;
}
function readMmbak(ev){
  let file = ev.target.files && ev.target.files[0]; if(!file) return;
  let out = document.getElementById('mmbakPreview'); out.textContent = 'جارٍ قراءة النسخة والأقسام الرئيسية والفرعية…';
  if(!window.initSqlJs){ out.textContent = 'مكتبة SQL غير متاحة. تأكد من الإنترنت.'; return; }
  let reader = new FileReader();
  reader.onload = async e => {
    try{
      let SQL = await initSqlJs({locateFile:f=>'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/'+f});
      let db = new SQL.Database(new Uint8Array(e.target.result));

      let assets = [];
      try{
        assets = db.exec("SELECT uid,NIC_NAME,currencyUid,IFNULL(BALANCE,IFNULL(ZMONEY,IFNULL(AMOUNT,0))) FROM ASSETS")[0]?.values || [];
      }catch(_){
        assets = (db.exec("SELECT uid,NIC_NAME,currencyUid FROM ASSETS")[0]?.values||[]).map(r=>[r[0],r[1],r[2],0]);
      }

      // Exact Money Manager ZCATEGORY Parser (ID, C_IS_DEL, uid, NAME, ORDERSEQ, TYPE, STATUS, pUid)
      let catInfoMap = {}; // key (uid or ID) -> { name, parentName, doType }
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
          // Resolve parent relationships accurately
          for(const obj of allObjs){
            let parent = (obj.pUid && obj.pUid !== obj.uid && obj.pUid !== obj.id) ? byKey[obj.pUid] : null;
            // Walk up if multi-level
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

      // Inspect INOUTCOME columns dynamically so we catch ctgUid, subCtgUid, categoryName, etc.
      const ioCols = (db.exec(`PRAGMA table_info("INOUTCOME")`)[0]?.values||[]).map(x=>String(x[1]));
      const subCol = ioCols.find(c=>/^(sub_?ctg|sub_?cat|zsub|subctg)/i.test(c));
      const catNameCol = ioCols.find(c=>/^(ctg_?name|cat_?name|category_?name)/i.test(c));
      const extraSel = [subCol ? `"${subCol}"` : "''", catNameCol ? `"${catNameCol}"` : "''"].join(',');

      let tx = db.exec(`SELECT uid,assetUid,toAssetUid,ZDATE,DO_TYPE,ZMONEY,ZCONTENT,ctgUid,currencyUid,WDATE,txUidTrans,${extraSel} FROM INOUTCOME WHERE COALESCE(IS_DEL,0)=0 ORDER BY CASE WHEN DO_TYPE='3' THEN 0 ELSE 1 END`)[0]?.values || [];
      mmPending = {assets, tx, catInfoMap, expTree, incTree};

      const totalCats = Object.keys(expTree).length + Object.keys(incTree).length;
      const totalSubs = Object.values(expTree).reduce((s,a)=>s+a.length,0) + Object.values(incTree).reduce((s,a)=>s+a.length,0);

      out.innerHTML = `<p class="hint">تم العثور على <b>${assets.length}</b> حساب، <b>${tx.length}</b> حركة، <b>${totalCats}</b> قسم رئيسي، و<b>${totalSubs}</b> قسم فرعي:</p>` +
        `<label style="display:flex;align-items:center;gap:8px;font-size:.74rem;color:var(--mint);margin:6px 0 8px;cursor:pointer"><input type="checkbox" id="mmReplaceCatsChk" checked> استبدال الأقسام الافتراضية بأقسام Money Manager وتحديث المعاملات السابقة</label>` +
        assets.map((a,i)=>`<div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" class="mmasset" value="${i}" checked><div><b style="font-size:.78rem">${esc(a[1]||'حساب')}</b><small style="display:block;color:var(--muted);font-size:.66rem">${esc(a[2]||'')} · رصيد: ${esc(String(a[3]??0))}</small>${mmTypeSelect(i,mmDefaultType(a[1],a[2]))}</div></div>`).join('') +
        `<button class="primary" style="margin-top:10px" onclick="commitMmbakDirect()">استيراد الحسابات والأقسام والحركات الآن</button>`;
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

  const map = new Map(), newAccounts = [];
  for(const i of chosen){
    const a = mmPending.assets[i], name = String(a[1]||'حساب').trim(), currency = String(a[2]||'EGP_EGP');
    if(!/EGP_EGP/i.test(currency)) continue;
    const type = document.querySelector(`.mmtype[data-index="${i}"]`)?.value || mmDefaultType(name,currency);
    if(type === 'skip') continue;
    const existing = state.accounts.find(x=>x.name.trim().toLowerCase()===name.toLowerCase());
    const dest = existing || {id:'mm-'+String(a[0]), name, type, opening:round2(Number(a[3])||0)};
    if(!existing) newAccounts.push(dest);
    map.set(a[0], dest.id);
  }

  const txs = [], seenTransferKeys = new Set();
  const existingTxById = new Map(state.transactions.map(x=>[String(x.id), x]));
  const seen = new Set([...state.transactions, ...state.ledger].map(x=>String(x.id)));
  for(const r of mmPending.tx){
    const [uid,asset,to,date,kind,money,content,cat,currency,wdate,txUidTrans,subCtgRaw,catNameRaw] = r;
    if(!map.has(asset)) continue;
    const n = Math.abs(Number(money)||0); if(!n) continue;
    let ds = String(wdate||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(ds)){ const raw=Number(date); ds=Number.isFinite(raw)&&raw>100000000000?new Date(raw).toISOString().slice(0,10):String(date).slice(0,10); }
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
    const usableMemo = (cleanMemo && !isMemoUuid) ? cleanMemo : '';

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

    // Ensure every imported category and subcategory is registered in state.categoryTree without any loss
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

  const totalCats = Object.keys(mmPending.expTree||{}).length + Object.keys(mmPending.incTree||{}).length;
  mmPending = null;
  persist();
  document.getElementById('mmbakPreview').innerHTML = `<div class="hint" style="color:var(--mint)">✓ تم استيراد <b>${newAccounts.length}</b> حساب، <b>${totalCats}</b> قسم رئيسي بأقسامه الفرعية، و<b>${txs.length}</b> حركة!</div>`;
  toast('تم استيراد الأقسام والحركات بنجاح ✓');
}

/* 5. Accounts: Full Statement (All Transactions + Month Filter) + Edit + Delete */
function addAccount(){
  let name = val('accName').trim(), opening = num('accOpening');
  if(!name) return toast('اكتب اسم الحساب');
  state.accounts.push({id:'acc-'+Date.now(), name, type:val('accType'), opening});
  persist(); setv('accName',''); setv('accOpening',''); toast('تمت إضافة الحساب');
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
      rows.push({date:l.date, title:'تحويل إلى ' + toN, cat:'تحويل', delta:-(Number(l.amount)||0)});
    } else if(l.to===id){
      const fromN = state.accounts.find(x=>x.id===l.from)?.name || 'حساب';
      rows.push({date:l.date, title:'تحويل من ' + fromN, cat:'تحويل', delta:Number(l.amount)||0});
    }
  });
  rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const bal = accountBalance(acc);

  // Build available months for quick filter
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
      <strong class="${r.delta>=0?'blue':'red'}" style="direction:ltr;margin-right:8px">${r.delta>=0?'+':''}${fmt(r.delta)}</strong>
    </div>
  `).join('') : '<div class="empty">لا توجد حركات مسجلة في هذه الفترة.</div>';

  document.getElementById('accModalBody').innerHTML = `
    <div class="hero" style="padding:13px;margin-bottom:10px">
      <label>الرصيد الحالي الكلي</label>
      <div class="amount" style="font-size:1.45rem">${egp(bal)}</div>
    </div>
    <div class="c-row" style="margin-bottom:8px;min-height:40px">
      <label>فلترة الفترة :</label>
      <select onchange="openAccountStatement('${acc.id}', this.value)">${filterOpts}</select>
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
      <div class="c-row"><label>اسم الحساب :</label><input id="editAccName" value="${esc(acc.name)}"></div>
      <div class="c-row"><label>النوع :</label>
        <select id="editAccType">
          <option value="cash" ${acc.type==='cash'?'selected':''}>كاش</option>
          <option value="bank" ${acc.type==='bank'?'selected':''}>حساب بنكي</option>
          <option value="wallet" ${acc.type==='wallet'?'selected':''}>محفظة إلكترونية</option>
          <option value="prepaid" ${acc.type==='prepaid'?'selected':''}>بطاقة مسبقة الدفع</option>
        </select>
      </div>
      <div class="c-row"><label>الرصيد الحالي :</label><input id="editAccCurBal" type="number" step="0.01" value="${curBal}"></div>
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
        <div class="tap-actions">
          <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="openAccountStatement('${a.id}')">كشف حساب</button>
          <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditAccountModal('${a.id}')">تعديل</button>
          <button type="button" class="smallbtn danger" onclick="deleteAccount('${a.id}')">حذف</button>
        </div>
      </div>
      <strong>${maskable(egpSmart(accountBalance(a)))}</strong>
    </div>
  `).join('') : '<div class="empty">لا توجد حسابات مسجلة.</div>';

  // Cards
  const m = selected(), debt = allCardsOutstanding();
  let due = 0, monthDueItems = [];
  state.cardOps.forEach(o=>{
    const cName = state.cards.find(x=>x.id===o.cardId)?.name || 'بطاقة';
    if(o.type==='swipe'){
      if(o.dueDate && o.dueDate.slice(0,7)===m){
        const rem = opOutstanding(o); due += rem;
        monthDueItems.push({title:o.title, card:cName, kind:'شراء', remaining:rem, amount:o.amount});
      }
    } else {
      if(o.feeMonth===m){
        const remF = Math.max(0,(o.feeDue||0)-(o.feePaid||0)); due += remF;
        monthDueItems.push({title:`مصاريف إدارية: ${o.title}`, card:cName, kind:'رسوم', remaining:remF, amount:o.feeDue||0});
      }
      (o.schedules||[]).forEach((sc,idx)=>{
        if(sc.month===m){
          const remS = Math.max(0,sc.amount-sc.paid); due += remS;
          monthDueItems.push({title:`قسط (${idx+1}/${o.months}): ${o.title}`, card:cName, kind:'قسط', remaining:remS, amount:sc.amount});
        }
      });
    }
  });
  document.getElementById('cardDebtTotal').textContent = maskable(fmt(debt));
  document.getElementById('cardDueTotal').textContent = maskable(fmt(due));
  document.getElementById('cardDueMonthName').textContent = monthNamesAr[activeMonth-1]||'';
  document.getElementById('cardMonthScheduleLabel').textContent = formatYMArabic(m);

  const cardOpts = state.cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('') || '<option value="">لا توجد بطاقة</option>';
  ['opCard','payCard'].forEach(id=>{ const e=document.getElementById(id); if(e) e.innerHTML=cardOpts; });
  const accOpts = state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('') || '<option value="">لا يوجد حساب</option>';
  const cpAcc = document.getElementById('cardPayAccount'); if(cpAcc) cpAcc.innerHTML = accOpts;

  document.getElementById('cardsList').innerHTML = state.cards.length ? state.cards.map(c=>{
    const d = cardTotalOutstanding(c), av = cardCurrentAvailable(c);
    return `<div class="listitem" onclick="toggleItemActions(this,event)">
      <div class="info">
        <b>${esc(c.name)}</b>
        <small>${av!==null?'المتاح: '+egp(av)+' · ':''}الحد: ${egp(c.limit||0)} · يوم السداد: ${c.payDay||3}</small>
        <div class="tap-actions">
          <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditCardModal('${c.id}')">تعديل</button>
          <button type="button" class="smallbtn danger" onclick="deleteCard('${c.id}')">حذف</button>
        </div>
      </div>
      <strong class="${d>0?'orange':'mint'}">${egp(d)}</strong>
    </div>`;
  }).join('') : '<div class="empty">لا توجد بطاقات.</div>';

  document.getElementById('cardMonthlyDueList').innerHTML = monthDueItems.length ? monthDueItems.map(it=>`
    <div class="listitem"><div class="info"><b>${esc(it.title)} <span class="tag">${esc(it.card)} · ${it.kind}</span></b></div><strong class="blue">${egp(it.remaining>0?it.remaining:it.amount)}</strong></div>
  `).join('') : '<div class="empty">لا توجد مستحقات للبطاقات في هذا الشهر.</div>';

  document.getElementById('cardOpsList').innerHTML = state.cardOps.length ? state.cardOps.map(o=>{
    const cName = state.cards.find(x=>x.id===o.cardId)?.name || 'بطاقة';
    const rem = opOutstanding(o);
    return `<div class="listitem" onclick="toggleItemActions(this,event)">
      <div class="info">
        <b>${esc(o.title)} <span class="tag">${esc(cName)} · ${o.type==='installment'?'تقسيط '+o.months+'ش':'شراء'}</span></b>
        <small>${esc(o.date||'')} · الإجمالي: ${egp(o.total||o.amount||0)}</small>
        <div class="tap-actions">
          <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditCardOpModal('${o.id}')">تعديل</button>
          <button type="button" class="smallbtn danger" onclick="deleteCardOp('${o.id}')">حذف</button>
        </div>
      </div>
      <strong class="${rem>0?'orange':'mint'}">${egp(rem)}</strong>
    </div>`;
  }).join('') : '<div class="empty">لا توجد عمليات.</div>';
}

function toggleCardPanel(panelId, btn){
  const t = document.getElementById(panelId);
  const was = t.classList.contains('show');
  document.querySelectorAll('.card-subpanel').forEach(p=>p.classList.remove('show'));
  document.querySelectorAll('.h-action-btn').forEach(b=>b.classList.remove('active'));
  if(!was){ t.classList.add('show'); if(btn) btn.classList.add('active'); }
}
function closeCardPanels(){
  document.querySelectorAll('.card-subpanel').forEach(p=>p.classList.remove('show'));
  document.querySelectorAll('.h-action-btn').forEach(b=>b.classList.remove('active'));
}
function setCardOpType(t){
  setv('opType', t);
  document.getElementById('segOpSwipe').classList.toggle('active', t==='swipe');
  document.getElementById('segOpInst').classList.toggle('active', t==='installment');
  document.querySelectorAll('.installment-only').forEach(e=>e.style.display = t==='installment' ? 'flex' : 'none');
  showCreditQuote();
}
function syncCardOpMonthsFromDate(){
  const d = val('opDate'); if(!d || d.length<7) return;
  const pYM = d.slice(0,7), fYM = addMonthsYM(pYM, 1);
  setv('opPurchaseVal', pYM); document.getElementById('opPurchaseLabel').textContent = formatYMArabic(pYM);
  setv('opFeeMonthVal', fYM); document.getElementById('opFeeMonthLabel').textContent = formatYMArabic(fYM);
  showCreditQuote();
}
function openCardOpPurchasePicker(){
  openCompactYMPicker('opPurchase', false, (chosenYM)=>{
    const nextYM = addMonthsYM(chosenYM, 1);
    setv('opFeeMonthVal', nextYM);
    document.getElementById('opFeeMonthLabel').textContent = formatYMArabic(nextYM);
    showCreditQuote();
  });
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
  persist(); setv('cardName',''); setv('cardLimit',''); setv('cardAvailable',''); closeCardPanels(); toast('تم حفظ البطاقة');
}
function dueDateFor(card,date){
  let d=new Date(date+'T12:00:00'), y=d.getFullYear(), m=d.getMonth()+1, day=card.payDay||3;
  let due=new Date(y,m,day);
  return due.getFullYear()+'-'+String(due.getMonth()+1).padStart(2,'0')+'-'+String(due.getDate()).padStart(2,'0');
}
function showCreditQuote(){
  const el = document.getElementById('creditQuote'); if(!el) return;
  const card = state.cards.find(c=>c.id===val('opCard')), amount = num('opAmount'), months = num('opMonths')||12;
  if(!card || !amount || val('opType')!=='installment'){ el.innerHTML='<div class="empty">أدخل المبلغ لعرض القسط والفائدة.</div>'; return; }
  const t = (card.terms||{})[months] || {monthlyRate:0, adminRate:0};
  const interest = round2(amount * t.monthlyRate * months), fee = round2(amount * t.adminRate), base = round2((amount + interest)/months);
  const feeYM = val('opFeeMonthVal') || addMonthsYM(val('opPurchaseVal')||selected(), 1);
  el.innerHTML = `<div class="rowline"><span>القسط الشهري (يبدأ ${formatYMArabic(addMonthsYM(feeYM,1))})</span><b>${fmt(base)} EGP</b></div><div class="rowline"><span>المصاريف (${formatYMArabic(feeYM)})</span><b>${fmt(fee)} EGP</b></div>`;
}
function addCardOperation(){
  let card=state.cards.find(c=>c.id===val('opCard')), type=val('opType'), amount=num('opAmount'), date=val('opDate'), title=val('opTitle').trim();
  if(!card||!amount||!date||!title) return toast('أكمل بيانات العملية');
  let op={id:'op-'+Date.now(), cardId:card.id, type, title, amount, date, paid:0, dueDate:dueDateFor(card,date)};
  if(type==='installment'){
    const months = num('opMonths')||12, t = (card.terms||{})[months]||{monthlyRate:0,adminRate:0};
    const interest = round2(amount*t.monthlyRate*months), fee = round2(amount*t.adminRate), base = round2((amount+interest)/months);
    const purchaseYM = val('opPurchaseVal') || date.slice(0,7);
    const feeYM = val('opFeeMonthVal') || addMonthsYM(purchaseYM, 1);
    op.purchaseMonth=purchaseYM; op.months=months; op.interest=interest; op.adminFee=fee; op.installment=base; op.total=round2(amount+interest+fee);
    op.feeMonth=feeYM; op.feeDue=fee; op.feePaid=0;
    let [fy,fm]=feeYM.split('-').map(Number);
    op.schedules = Array.from({length:months}, (_,i)=>{ let dt=new Date(fy,(fm-1)+1+i,1); return {month:dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0'), amount:base, principalAndInterest:base, fee:0, paid:0}; });
  }
  state.cardOps.push(op);
  state.transactions.push({id:'card-purchase-'+op.id, type:'card_purchase', title:'شراء بالبطاقة - '+title, category:'مشتريات بطاقة', amount, date, accountId:null, source:'card-purchase:'+op.id});
  if(type==='installment') syncCardInstallmentsToCommitments();
  persist(); setv('opTitle',''); setv('opAmount',''); closeCardPanels(); toast('تم تسجيل العملية ✓');
}
function payCard(){
  let card=state.cards.find(c=>c.id===val('payCard')), amount=num('cardPaymentAmount'), date=val('cardPaymentDate')||today(), accountId=val('cardPayAccount');
  if(!card||amount<=0) return toast('أدخل مبلغ السداد');
  let left = amount;
  if(card.balance>0){ let p=Math.min(left,card.balance); card.balance=round2(card.balance-p); left=round2(left-p); }
  for(let op of state.cardOps.filter(o=>o.cardId===card.id)){
    if(left<=0) break;
    if(op.type==='installment'){
      if((op.feeDue||0)>(op.feePaid||0)){ let f=Math.min(left,op.feeDue-op.feePaid); op.feePaid=round2((op.feePaid||0)+f); left=round2(left-f); }
      for(let sc of op.schedules){ let x=Math.min(left,sc.amount-sc.paid); if(x>0){sc.paid=round2(sc.paid+x); left=round2(left-x);} if(left<=0)break; }
    } else { let x=Math.min(left,op.amount-op.paid); op.paid=round2(op.paid+x); left=round2(left-x); }
  }
  state.cardPayments.push({id:'cp-'+Date.now(), cardId:card.id, amount, date, accountId:accountId||null});
  state.transactions.push({id:'cardpay-'+Date.now(), type:'credit_payment', title:'سداد بطاقة - '+card.name, category:'سداد بطاقة', amount, date, accountId:accountId||null, source:'card-payment'});
  persist(); setv('cardPaymentAmount',''); closeCardPanels(); toast('تم تسجيل السداد ✓');
}

function openEditCardModal(cardId){
  const card = state.cards.find(c=>c.id===cardId);
  if(!card) return;
  const curAvail = cardCurrentAvailable(card) ?? Math.max(0, (Number(card.limit)||0) - (Number(card.balance)||0));
  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>اسم البطاقة :</label><input id="edCardName" value="${esc(card.name)}"></div>
      <div class="c-row"><label>الحد الائتماني :</label><input id="edCardLimit" type="number" step="0.01" value="${Number(card.limit)||0}"></div>
      <div class="c-row"><label>الرصيد المتاح حالياً :</label><input id="edCardAvail" type="number" step="0.01" value="${curAvail}"></div>
      <div class="c-row"><label>يوم السداد :</label><input id="edCardPayDay" type="number" min="1" max="28" value="${card.payDay||3}"></div>
    </div>
  `;
  showAppCustomForm('تعديل البطاقة: ' + card.name, formHtml, ()=>{
    const nm = val('edCardName').trim();
    const lim = num('edCardLimit');
    const av = num('edCardAvail');
    if(!nm || lim <= 0){ toast('أكمل اسم البطاقة والحد الائتماني'); return false; }
    card.name = nm;
    card.limit = lim;
    card.payDay = num('edCardPayDay') || 3;
    const opsOut = cardOpsOutstandingFor(card.id);
    card.balance = round2(Math.max(0, lim - av - opsOut));
    syncCardInstallmentsToCommitments();
    persist();
    toast('تم تعديل البطاقة ✓');
    return true;
  });
}

function deleteCard(cardId){
  showAppConfirm('حذف البطاقة', 'هل تريد حذف هذه البطاقة وجميع عملياتها المسجلة؟', ()=>{
    const opIds = new Set(state.cardOps.filter(o=>o.cardId===cardId).map(o=>o.id));
    state.cards = state.cards.filter(c=>c.id!==cardId);
    state.cardOps = state.cardOps.filter(o=>o.cardId!==cardId);
    state.transactions = state.transactions.filter(t=>!t.source || ! [...opIds].some(id=>t.source==='card-purchase:'+id));
    syncCardInstallmentsToCommitments();
    persist();
    toast('تم حذف البطاقة ✓');
  }, true);
}

function openEditCardOpModal(opId){
  const op = state.cardOps.find(o=>o.id===opId);
  if(!op) return;
  const isInst = op.type === 'installment';
  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>وصف العملية :</label><input id="edOpTitle" value="${esc(op.title)}"></div>
      <div class="c-row"><label>المبلغ الأصلي :</label><input id="edOpAmount" type="number" step="0.01" value="${Number(op.amount)||0}"></div>
      <div class="c-row"><label>تاريخ العملية :</label><input id="edOpDate" type="date" value="${esc(op.date||today())}"></div>
      ${isInst ? `<div class="c-row"><label>مدة التقسيط :</label>
        <select id="edOpMonths">
          ${[3,6,9,12,15,18,24,36].map(m=>`<option value="${m}" ${Number(op.months)===m?'selected':''}>${m} شهر</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
  `;
  showAppCustomForm('تعديل عملية البطاقة', formHtml, ()=>{
    const title = val('edOpTitle').trim();
    const amount = num('edOpAmount');
    const date = val('edOpDate') || today();
    if(!title || amount <= 0){ toast('أدخل الوصف والمبلغ بشكل صحيح'); return false; }
    const card = state.cards.find(c=>c.id===op.cardId);
    op.title = title;
    op.amount = amount;
    op.date = date;
    op.dueDate = card ? dueDateFor(card, date) : op.dueDate;
    if(op.type === 'installment'){
      const months = num('edOpMonths') || op.months || 12;
      const t = (card?.terms||{})[months] || {monthlyRate:0, adminRate:0};
      const interest = round2(amount * t.monthlyRate * months);
      const fee = round2(amount * t.adminRate);
      const base = round2((amount + interest) / months);
      const purchaseYM = date.slice(0,7);
      const feeYM = addMonthsYM(purchaseYM, 1);
      op.purchaseMonth = purchaseYM;
      op.months = months;
      op.interest = interest;
      op.adminFee = fee;
      op.installment = base;
      op.total = round2(amount + interest + fee);
      op.feeMonth = feeYM;
      op.feeDue = fee;
      let [fy, fm] = feeYM.split('-').map(Number);
      const oldPaidByMonth = {};
      (op.schedules||[]).forEach(sc=>{ oldPaidByMonth[sc.month] = sc.paid || 0; });
      op.schedules = Array.from({length:months}, (_, i) => {
        let dt = new Date(fy, (fm - 1) + 1 + i, 1);
        const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
        return {month: mk, amount: base, principalAndInterest: base, fee: 0, paid: Math.min(base, oldPaidByMonth[mk]||0)};
      });
    }
    const linkedTx = state.transactions.find(tx=>tx.source==='card-purchase:'+op.id);
    if(linkedTx){
      linkedTx.title = 'شراء بالبطاقة - ' + title;
      linkedTx.amount = amount;
      linkedTx.date = date;
    }
    syncCardInstallmentsToCommitments();
    persist();
    toast('تم تعديل عملية البطاقة ✓');
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

function syncCardInstallmentsToCommitments(){
  const validOpIds = new Set((state.cardOps||[]).filter(o=>o.type==='installment').map(o=>o.id));
  state.commitments = (state.commitments||[]).filter(c => !c.cardOpId || validOpIds.has(c.cardOpId));
  for(const op of (state.cardOps||[])){
    if(op.type !== 'installment') continue;
    const cName = state.cards.find(c=>c.id===op.cardId)?.name || 'بطاقة';
    const comId = 'com-cardop-' + op.id;
    const firstM = op.schedules?.[0]?.month || op.feeMonth || op.date.slice(0,7);
    const lastM = op.schedules?.[op.schedules.length-1]?.month || firstM;
    const existing = state.commitments.find(c=>c.id===comId);
    if(!existing){
      state.commitments.push({id:comId, cardOpId:op.id, title:`${op.title} (${cName})`, type:'قسط بطاقة', freq:'monthly', amount:round2(Number(op.installment)||0), start:firstM, end:lastM, day:3});
    } else {
      existing.title = `${op.title} (${cName})`;
      existing.amount = round2(Number(op.installment)||0);
      existing.start = firstM;
      existing.end = lastM;
    }
  }
}

/* Commitments & Loans */
function toggleCommitmentFreqFields(){
  const isM = val('comFreq') !== 'once';
  document.querySelectorAll('.com-monthly-only').forEach(e=>e.style.display = isM ? 'flex' : 'none');
}
function addCommitment(){
  const freq = val('comFreq')||'monthly', type = val('comType')||'التزام شهري', title = val('comTitle').trim()||type, amount = num('comAmount');
  if(amount<=0) return toast('أدخل المبلغ');
  state.commitments.push({id:'com-'+Date.now(), title, type, freq, amount, start:val('comStartVal')||selected(), end:freq==='monthly'?val('comEndVal'):'', day:num('comDay')||1, dueDate:val('comDueDate')||'', note:val('comNote').trim()});
  persist(); setv('comTitle',''); setv('comAmount',''); toast('تم الحفظ ✓');
}
function markCommitmentPaid(id){
  const c = state.commitments.find(x=>x.id===id), m = selected(); if(!c) return;
  const isOnce = c.freq==='once';
  const paid = isOnce ? state.commitmentPayments.filter(p=>p.commitmentId===id).reduce((s,p)=>s+(Number(p.amount)||0),0) : state.commitmentPayments.filter(p=>p.commitmentId===id&&p.month===m).reduce((s,p)=>s+(Number(p.amount)||0),0);
  const rem = Math.max(0,(Number(c.amount)||0)-paid);
  if(!rem) return toast('مسدد بالكامل ✓');
  const accId = state.prefs?.defaultAccount || state.accounts[0]?.id || null;
  state.commitmentPayments.push({id:'cmp-'+Date.now(), commitmentId:id, month:m, amount:rem, date:today(), accountId:accId});
  state.transactions.push({id:'com-pay-'+Date.now(), type:'expense', title:'سداد '+c.title, category:c.type||'التزام', amount:rem, date:today(), accountId:accId, source:'commitment-payment'});
  persist(); toast('تم تسجيل السداد ✓');
}
function openEditCommitmentModal(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  const isOnce = c.freq === 'once';
  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>الاسم :</label><input id="edComTitle" value="${esc(c.title)}"></div>
      <div class="c-row"><label>المبلغ :</label><input id="edComAmount" type="number" step="0.01" value="${Number(c.amount)||0}"></div>
      ${!isOnce ? `<div class="c-row"><label>يوم الاستحقاق :</label><input id="edComDay" type="number" min="1" max="31" value="${c.day||1}"></div>` : ''}
      <div class="c-row"><label>ميعاد السداد :</label><input id="edComDueDate" type="date" value="${esc(c.dueDate||'')}"></div>
      <div class="c-row"><label>ملاحظة :</label><input id="edComNote" value="${esc(c.note||'')}"></div>
    </div>
  `;
  showAppCustomForm('تعديل الالتزام: ' + c.title, formHtml, ()=>{
    const title = val('edComTitle').trim();
    const amount = num('edComAmount');
    if(!title || amount <= 0){ toast('أدخل الاسم والمبلغ بشكل صحيح'); return false; }
    c.title = title;
    c.amount = amount;
    if(!isOnce) c.day = num('edComDay') || c.day || 1;
    c.dueDate = val('edComDueDate') || '';
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
  const comStats = monthCommitmentsStats(m);
  const debtStats = oneTimeDebtsStats(m);
  document.getElementById('comHeroMonthLabel').textContent = formatYMArabic(m);
  document.getElementById('comHeroTotal').textContent = maskable(egpSmart(comStats.due));
  document.getElementById('comHeroPaid').textContent = maskable(fmtNum(comStats.paid));
  document.getElementById('comHeroRemain').textContent = maskable(fmtNum(comStats.remain));
  document.getElementById('comHeroLoans').textContent = maskable(fmtNum(debtStats.remain));
  document.getElementById('comMonthLabel').textContent = formatYMArabic(m);

  document.getElementById('commitmentsList').innerHTML = comStats.list.length ? comStats.list.map(c=>{
    const paid = c.freq==='once' ? state.commitmentPayments.filter(p=>p.commitmentId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0) : state.commitmentPayments.filter(p=>p.commitmentId===c.id&&p.month===m).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const left = Math.max(0,(Number(c.amount)||0)-paid);
    return `<div class="listitem" onclick="toggleItemActions(this,event)"><div class="info"><b>${esc(c.title)} <span class="tag">${esc(c.type)}</span></b><div class="tap-actions"><button type="button" class="smallbtn" onclick="markCommitmentPaid('${c.id}')">${left?'تسجيل دفع':'مدفوع ✓'}</button><button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditCommitmentModal('${c.id}')">تعديل</button><button type="button" class="smallbtn danger" onclick="deleteCommitment('${c.id}')">حذف</button></div></div><strong class="${left?'orange':'mint'}">${egp(left)}</strong></div>`;
  }).join('') : '<div class="empty">لا توجد التزامات شهرية في هذا الشهر.</div>';

  document.getElementById('oneTimeDebtsList').innerHTML = debtStats.list.length ? debtStats.list.map(c=>{
    const paid = state.commitmentPayments.filter(p=>p.commitmentId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const left = Math.max(0,(Number(c.amount)||0)-paid);
    return `<div class="listitem" onclick="toggleItemActions(this,event)"><div class="info"><b>${esc(c.title)}</b>${c.dueDate?`<small style="color:var(--orange)">ميعاد السداد: ${c.dueDate}</small>`:''}<div class="tap-actions"><button type="button" class="smallbtn" onclick="markCommitmentPaid('${c.id}')">${left?'تسجيل سداد':'مسدد ✓'}</button><button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditCommitmentModal('${c.id}')">تعديل</button><button type="button" class="smallbtn danger" onclick="deleteCommitment('${c.id}')">حذف</button></div></div><strong class="${left?'red':'mint'}">${egp(left)}</strong></div>`;
  }).join('') : '<div class="empty">لا توجد سلف قائمة.</div>';
}

/* Salary Calculator */
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
  else { state.transactions.push({id:'salary-'+key, type:'income', title:'صافي المرتب', amount:r.net, category:'راتب', date, source:'salary:'+key, accountId:aid}); }
  persist(); showSalaryResult(); toast('تم حساب وحفظ صافي المرتب ✓');
}
function showSalaryResult(){
  let y=val('salYear'), key=y+'-'+String(Number(val('salMonth')||1)).padStart(2,'0'), d=state.salaryMonths[key], el=document.getElementById('salaryResult');
  if(!el) return;
  if(!d){ el.innerHTML='<div class="empty">افتح «مدخلات الشهر» واضغط احسب لعرض تفاصيل المرتب.</div>'; return; }
  let r=calcSalary(d, state.salaryConfig[y]||{});
  el.innerHTML=`<div class="rowline"><span>إجمالي المرتب</span><b>${egp(r.gross)}</b></div><div class="rowline"><span>التأمينات</span><b>${egp(r.insurance)}</b></div><div class="rowline"><span>الضرائب</span><b>${egp(r.tax)}</b></div><div class="hero" style="margin-top:10px"><label>صافي المرتب</label><div class="amount">${egp(r.net)}</div></div>`;
}

/* Settings Categories Tree Manager (Collapsed by default, Arrow -> + to add main, Edit pencil + Expand arrow per main, Edit pencil per sub) */
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


/* Custom Centered Select Enhancer (Replaces native OS select popups with Exit-Card style modal) */
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
    if(sel.id === 'actAccountFilter') return; // keep compact inline filter in search bar
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
      list: ['exp', 'inc', 'yr'],
      getActive: () => activeReportTab || 'exp',
      setActive: (val) => switchReportTab(val)
    },
    wallet: {
      list: ['acc', 'card'],
      getActive: () => document.getElementById('tabBtnCard')?.classList.contains('active') ? 'card' : 'acc',
      setActive: (val) => switchWalletTab(val)
    },
    plan: {
      list: ['com', 'sal'],
      getActive: () => document.getElementById('tabBtnSal')?.classList.contains('active') ? 'sal' : 'com',
      setActive: (val) => switchPlanTab(val)
    }
  };

  let startX = 0, startY = 0, startTime = 0, ignoreTouch = false;

  document.addEventListener('touchstart', function(e){
    if(e.touches.length !== 1) { ignoreTouch = true; return; }
    if(document.querySelector('.modal.show')) { ignoreTouch = true; return; }
    const tgt = e.target;
    if(tgt && tgt.closest('input, textarea, select, [contenteditable="true"]')) {
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

    // Tabs are ordered Left-to-Right: [0: trans, 1: reports, 2: wallet, 3: plan, 4: settings]
    // Swiping finger Left (dx < 0) advances to next right tab (+1); Swiping Right (dx > 0) goes back to left tab (-1).
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
  ['التقارير', 'Reports'],
  ['الحسابات', 'Accounts'],
  ['الالتزامات', 'Commitments'],
  ['الإعدادات', 'Settings'],
  ['المزيد', 'Settings'],
  ['يومي', 'Daily'],
  ['شهري', 'Monthly'],
  ['الدخل', 'Income'],
  ['المصروفات', 'Expenses'],
  ['الصافي', 'Total'],
  ['مصاريف الشهر', 'Monthly Expenses'],
  ['دخل الشهر', 'Monthly Income'],
  ['التقرير السنوي', 'Yearly Report'],
  ['الحسابات والأرصدة', 'Accounts & Balances'],
  ['البطاقات الائتمانية', 'Credit Cards'],
  ['إجمالي الأموال المتاحة (الكاش والبنوك والمحافظ)', 'Total Available Balance (Cash, Banks & Wallets)'],
  ['＋ إضافة حساب جديد', '＋ Add New Account'],
  ['اسم الحساب :', 'Account Name :'],
  ['النوع :', 'Type :'],
  ['الرصيد الافتتاحي :', 'Opening Balance :'],
  ['إضافة الحساب', 'Add Account'],
  ['حساباتي', 'My Accounts'],
  ['اضغط لكشف الحساب أو التعديل', 'Tap for statement or edit'],
  ['إجمالي المديونية (المستخدم)', 'Total Used Debt'],
  ['إضافة بطاقة', 'Add Card'],
  ['تسجيل عملية', 'Add Operation'],
  ['سداد بطاقة', 'Pay Card'],
  ['البطاقات المسجلة', 'Registered Cards'],
  ['كل عمليات البطاقات', 'All Card Operations'],
  ['الالتزامات والسلف', 'Commitments & Loans'],
  ['حاسبة المرتب', 'Salary Calculator'],
  ['المسدد', 'Paid'],
  ['المتبقي', 'Remaining'],
  ['متبقي السلف', 'Loans Left'],
  ['＋ إضافة التزام شهري أو سلفة', '＋ Add Commitment or Loan'],
  ['الالتزامات الشهرية', 'Monthly Commitments'],
  ['السلف القائمة', 'Active Loans'],
  ['⚙ إعدادات السنة (ثابتة خلال السنة)', '⚙ Yearly Salary Settings'],
  ['📅 مدخلات الشهر', '📅 Monthly Salary Inputs'],
  ['تفاصيل مرتب الشهر', 'Monthly Salary Breakdown'],
  ['احسب واحفظ الشهر', 'Calculate & Save Month'],
  ['حفظ إعدادات السنة', 'Save Yearly Settings'],
  ['⚙ إعدادات عامة', '⚙ General Settings'],
  ['🏷 تخصيص الأقسام', '🏷 Customize Categories'],
  ['💾 النسخ الاحتياطي', '💾 Backup & Restore'],
  ['⟳ التحديثات', '⟳ Updates'],
  ['⚠ مسح البيانات', '⚠ Wipe Data'],
  ['اللغة / Language :', 'Language :'],
  ['حجم الخط :', 'Font Size :'],
  ['الحساب الافتراضي :', 'Default Account :'],
  ['إخفاء الأرقام والكسور :', 'Privacy & Decimals :'],
  ['وضع الخلفية :', 'Background Mode :'],
  ['لون الثيم (8 ألوان) :', 'Theme Color (8 Colors) :'],
  ['تثبيت التطبيق :', 'Install App :'],
  ['تثبيت الآن', 'Install Now'],
  ['حفظ الإعدادات', 'Save Settings'],
  ['أقسام المصروفات', 'Expense Categories'],
  ['أقسام الدخل', 'Income Categories'],
  ['حالة التخزين الآمن :', 'Safe Storage Status :'],
  ['تصدير نسخة (JSON) :', 'Export Backup (JSON) :'],
  ['تصدير', 'Export'],
  ['استعادة نسخة :', 'Restore Backup :'],
  ['ملف', 'File'],
  ['لصق نص', 'Paste JSON'],
  ['استيراد .mmbak', 'Import .mmbak'],
  ['الإصدار الحالي :', 'Current Version :'],
  ['التحديثات :', 'Updates :'],
  ['فحص', 'Check'],
  ['تحديث الآن', 'Update Now'],
  ['تصفير المعاملات والأقسام :', 'Clear Transactions & Categories :'],
  ['تصفير', 'Clear'],
  ['حذف كل بيانات التطبيق :', 'Delete All App Data :'],
  ['مسح الكل', 'Wipe All'],
  ['تسجيل حركة جديدة', 'New Transaction'],
  ['مصروف', 'Expense'],
  ['دخل', 'Income'],
  ['تحويل', 'Transfer'],
  ['التاريخ :', 'Date :'],
  ['الحساب :', 'Account :'],
  ['من حساب :', 'From Account :'],
  ['إلى حساب :', 'To Account :'],
  ['القسم :', 'Category :'],
  ['المبلغ (EGP) :', 'Amount (EGP) :'],
  ['البيان / ملاحظة :', 'Note / Memo :'],
  ['القسم الرئيسي', 'Main Category'],
  ['القسم الفرعي', 'Subcategory'],
  ['حفظ', 'Save'],
  ['إلغاء', 'Cancel'],
  ['إغلاق', 'Close'],
  ['الشهر', 'Month'],
  ['الفائض/العجز', 'Net'],
  ['الإجمالي', 'Total']
];

function applyLanguageTranslations(lang){
  const isEn = (lang === 'en');
  updateTopTabTitle();

  // Translate static text nodes matching dictionary pairs
  const map = new Map(UI_TEXT_PAIRS.map(([ar, en]) => isEn ? [ar, en] : [en, ar]));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while((node = walker.nextNode())){
    const raw = node.nodeValue.trim();
    if(raw && map.has(raw)){
      node.nodeValue = node.nodeValue.replace(raw, map.get(raw));
    }
  }

  // Translate placeholders
  const searchInp = document.getElementById('actSearch');
  if(searchInp) searchInp.placeholder = isEn ? 'Search memo or category...' : 'بحث في البيان أو القسم...';
  const qmNote = document.getElementById('qmNote');
  if(qmNote) qmNote.placeholder = isEn ? 'Optional note...' : 'اختياري (يأخذ اسم القسم لو فارغ)';

  syncCustomSelectTriggers();
}

/* Boot */
applyPreferences();
initSalary();
const curYM = selected();
setv('comStartVal', curYM); document.getElementById('comStartLabel').textContent = formatYMArabic(curYM);
setv('opPurchaseVal', curYM); document.getElementById('opPurchaseLabel').textContent = formatYMArabic(curYM);
const nYM = addMonthsYM(curYM, 1);
setv('opFeeMonthVal', nYM); document.getElementById('opFeeMonthLabel').textContent = formatYMArabic(nYM);
setv('opDate', today()); setv('cardPaymentDate', today());
toggleCommitmentFreqFields();
updateBackupStatusUI();
renderAll();
recoverFromIndexedDBIfNeeded();
try{if('serviceWorker'in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});setTimeout(()=>checkForUpdate(true),1500);})}catch(e){}
