/* =========================================================
   X-Wallet V13.5 — Core Engine (core.js)
   - Local Device Date (Fixes post-midnight Cairo timezone bug)
   - Unique Collision-Proof IDs (uid)
   - Safe JS String Escaping in Inline Handlers (escJs)
   - SHA-256 PIN Hashing + Brute-Force Rate Limiting
   - Separate IndexedDB Store for Auto-Snapshots (Fixes 8.2MB vs 3MB backup size)
   - Selective Screen Rendering on Persist (Instant Save Speed)
   ========================================================= */
const APP_VERSION = '13.8';
const APP_BUILD = '2026-11-14';
const KEY = 'raseed_mobile_v2';
const SNAP_KEY = 'raseed_auto_snapshots_v1';

const monthNamesAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const monthNamesEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayNamesAr = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const dayNamesEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* 1. Local Device Date (Never uses UTC toISOString, fixing 12AM-3AM Cairo date shift) */
function localDateISO(dObj){
  const d = (dObj instanceof Date && !isNaN(dObj)) ? dObj : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const today = () => localDateISO(new Date());

/* 2. Collision-Proof Unique ID Generator (Even during bulk imports or rapid taps) */
let _uidSeq = 0;
function uid(prefix){
  _uidSeq = (_uidSeq + 1) % 1000000;
  return (prefix || 'id') + '-' + Date.now() + '-' + _uidSeq.toString(36) + Math.random().toString(36).slice(2, 5);
}

/* 3. Safe HTML & Inline JS Attribute Escaping (Fixes buttons breaking when names contain ' or ") */
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escJs(s){
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, ' ');
}

/* 4. SHA-256 PIN Hashing & Brute-Force Protection */
function fallbackHashPin(pinStr){
  const s = 'xwallet_salt_v1:' + String(pinStr || '').trim();
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for(let i = 0, ch; i < s.length; i++){
    ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'h1:' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

async function hashPinString(pinStr){
  const clean = String(pinStr || '').trim();
  if(!clean) return '';
  try{
    if(window.crypto && window.crypto.subtle){
      const enc = new TextEncoder().encode('xwallet_pin_v1:' + clean);
      const buf = await window.crypto.subtle.digest('SHA-256', enc);
      return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }catch(_){}
  return fallbackHashPin(clean);
}

let _pinFailCount = Number(sessionStorage.getItem('xw_pin_fails') || 0);
let _pinLockUntil = Number(sessionStorage.getItem('xw_pin_lock_until') || 0);

function checkPinRateLimit(){
  const now = Date.now();
  if(_pinLockUntil > now){
    const sec = Math.ceil((_pinLockUntil - now) / 1000);
    toast(`تم قفل المحاولات مؤقتاً للأمان. حاول بعد ${sec} ثانية ⏳`);
    return false;
  }
  return true;
}

function recordPinAttemptResult(success){
  if(success){
    _pinFailCount = 0;
    _pinLockUntil = 0;
    sessionStorage.removeItem('xw_pin_fails');
    sessionStorage.removeItem('xw_pin_lock_until');
  } else {
    _pinFailCount += 1;
    sessionStorage.setItem('xw_pin_fails', String(_pinFailCount));
    if(_pinFailCount >= 3){
      const lockSec = Math.min(300, 30 * Math.pow(2, _pinFailCount - 3));
      _pinLockUntil = Date.now() + (lockSec * 1000);
      sessionStorage.setItem('xw_pin_lock_until', String(_pinLockUntil));
      toast(`محاولات خاطئة متكررة! تم القفل لمدة ${lockSec} ثانية 🔒`);
    } else {
      toast(`رمز المرور غير صحيح (محاولة ${_pinFailCount} من 3)`);
    }
  }
}

async function verifyEnteredPin(enteredPin, prefsObj){
  if(!checkPinRateLimit()) return false;
  const clean = String(enteredPin || '').trim();
  if(!clean){
    recordPinAttemptResult(false);
    return false;
  }
  const p = prefsObj || {};
  if(p.secPinHash){
    const computed = p.secPinHash.startsWith('sha256:') ? await hashPinString(clean) : fallbackHashPin(clean);
    const ok = (computed === p.secPinHash);
    recordPinAttemptResult(ok);
    return ok;
  }
  if(p.secPin){
    const ok = (clean === String(p.secPin).trim());
    recordPinAttemptResult(ok);
    return ok;
  }
  return true;
}

/* 5. Sanitized Export Payload (Strips tokens, secrets & nested snapshots so backup size is small & uniform) */
function getSanitizedStateForBackup(rawState){
  const copy = JSON.parse(JSON.stringify(rawState || {}));
  delete copy.autoSnapshots;
  if(copy.prefs){
    delete copy.prefs.secPin;
    delete copy.prefs.driveAccessToken;
    delete copy.prefs.driveWebhookUrl;
    delete copy.prefs.bioCredentialId;
  }
  return copy;
}


/* 6. VisualViewport Native Keyboard Guard (Prevents In-App Calculator from EVER overlapping Mobile Keyboard) */
(function initMobileKeyboardGuard(){
  function checkKeyboard(){
    const qm = document.getElementById('quickModal');
    if(!qm || !qm.classList.contains('show')) return;
    const activeEl = document.activeElement;
    const isTextFocused = activeEl && (activeEl.id === 'qmNote' || activeEl.id === 'qmDesc' || (activeEl.tagName === 'INPUT' && !activeEl.readOnly && activeEl.type !== 'date'));
    const vpHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const kbOpen = vpHeight < (window.screen.availHeight * 0.72) || isTextFocused;
    if(kbOpen){
      qm.classList.add('hide-bottom-dock');
    }
  }
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', checkKeyboard);
  }
  document.addEventListener('focusin', (e)=>{
    const t = e.target;
    if(t && (t.id === 'qmNote' || t.id === 'qmDesc')){
      document.getElementById('quickModal')?.classList.add('hide-bottom-dock');
    }
  });
})();

/* 5.1 Smooth Fluid Touch/Pointer Drag-to-Reorder Helper */
function initDragReorderContainer(containerEl, itemSelector, handleSelector, onReorderDone){
  if(!containerEl) return;
  containerEl.querySelectorAll(handleSelector).forEach(handle => {
    handle.style.touchAction = 'none';
    handle.onpointerdown = function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      const dragItem = handle.closest(itemSelector);
      if(!dragItem) return;
      const startY = ev.clientY;
      let lastTop = dragItem.getBoundingClientRect().top;
      dragItem.classList.add('dragging-cat-row');
      dragItem.style.position = 'relative';
      dragItem.style.zIndex = '20';
      dragItem.style.transition = 'none';
      try{ handle.setPointerCapture(ev.pointerId); }catch(_){}

      const onMove = (mev) => {
        const curY = mev.clientY;
        const delta = curY - startY;
        const currentRect = dragItem.getBoundingClientRect();
        const offsetAdjust = currentRect.top - lastTop;
        dragItem.style.transform = `translateY(${delta - (currentRect.top - lastTop - delta)}px)`;
        // Simpler, jitter-free swap + continuous finger tracking:
        const siblings = [...containerEl.querySelectorAll(':scope > ' + itemSelector)];
        for(const sib of siblings){
          if(sib === dragItem) continue;
          const rect = sib.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if(curY < midY && (dragItem.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_PRECEDING)){
            const prevTop = dragItem.getBoundingClientRect().top;
            containerEl.insertBefore(dragItem, sib);
            lastTop += (dragItem.getBoundingClientRect().top - prevTop);
            break;
          } else if(curY > midY && (dragItem.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING)){
            const prevTop = dragItem.getBoundingClientRect().top;
            containerEl.insertBefore(dragItem, sib.nextSibling);
            lastTop += (dragItem.getBoundingClientRect().top - prevTop);
            break;
          }
        }
        dragItem.style.transform = `translateY(${Math.max(-45, Math.min(45, (curY - startY) * 0.28))}px) scale(1.015)`;
      };

      const onUp = (uev) => {
        dragItem.classList.remove('dragging-cat-row');
        dragItem.style.position = '';
        dragItem.style.zIndex = '';
        dragItem.style.transform = '';
        dragItem.style.transition = '';
        try{ handle.releasePointerCapture(uev.pointerId); }catch(_){}
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        const orderedNames = [...containerEl.querySelectorAll(':scope > ' + itemSelector)].map(el => el.getAttribute('data-cat-name')).filter(Boolean);
        if(onReorderDone && orderedNames.length) onReorderDone(orderedNames);
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    };
  });
}
