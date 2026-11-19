// 帳小簿 V26.22 — App 密碼鎖（PIN）.
// Bundled after js/health.js; uses settings.js prefs()/setPref(). Function declarations / var only.
//
// A 4–6 digit PIN hides the app on open and after it has been in the background for the chosen time.
// The PIN is stored only as a salted PBKDF2-SHA-256 hash on this device. This is a privacy screen,
// not encryption: the data itself stays readable to anyone with access to the browser profile.

var lockHiddenAt = 0, lockEntry = '';

function lockBytesToHex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function lockHash(pin, saltHex) {
  const enc = new TextEncoder(), salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  return lockBytesToHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256));
}
function lockNewSalt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return lockBytesToHex(a); }
function lockAvailable() { return typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function'; }
function lockValidPin(pin) { return /^\d{4,6}$/.test(String(pin || '')); }
function lockEnabled() { const p = prefs(); return !!(p.lockHash && p.lockSalt); }

async function lockSetPin(pin) {
  if (!lockValidPin(pin)) throw new Error('PIN 必須是 4 到 6 位數字');
  const salt = lockNewSalt(), hash = await lockHash(pin, salt);
  setPref('lockSalt', salt); setPref('lockHash', hash);
  if (prefs().lockAfter === undefined) setPref('lockAfter', 1);
}
async function lockVerify(pin) { const p = prefs(); if (!p.lockHash || !p.lockSalt) return true; return (await lockHash(pin, p.lockSalt)) === p.lockHash; }
function lockClear() { setPref('lockHash', ''); setPref('lockSalt', ''); }

// minutes in the background before locking again (0 = every time the app is reopened)
function lockShouldRelock(hiddenAt, now, afterMin) { if (!hiddenAt) return false; return now - hiddenAt >= Math.max(0, Number(afterMin) || 0) * 60000; }

function lockShow() {
  if (!lockEnabled()) return;
  document.documentElement.dataset.locked = '1';
  let el = document.getElementById('appLock');
  if (!el && document.body) {
    el = document.createElement('div'); el.id = 'appLock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '輸入密碼解鎖');
    el.innerHTML = `<div class="lock-card"><div class="lock-title">帳小簿已鎖定</div><div class="lock-dots" id="lockDots"></div><div class="lock-msg" id="lockMsg">輸入 PIN 解鎖</div><div class="lock-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button type="button" data-lock-key="${k}">${k}</button>` : '<span></span>').join('')}</div><button type="button" class="lock-forgot" data-lock-forgot>忘記 PIN？</button></div>`;
    document.body.appendChild(el);
  }
  lockEntry = ''; lockRenderDots();
}
function lockRenderDots() { const d = document.getElementById('lockDots'); if (d) d.innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < lockEntry.length ? 'on' : ''}"></i>`).join(''); }
function lockHide() { delete document.documentElement.dataset.locked; document.getElementById('appLock')?.remove(); lockEntry = ''; }

async function lockTry() {
  if (lockEntry.length < 4) return;
  if (await lockVerify(lockEntry)) { lockHide(); return; }
  if (lockEntry.length >= 6) { const m = document.getElementById('lockMsg'); if (m) m.textContent = 'PIN 錯誤，請再試一次'; lockEntry = ''; lockRenderDots(); }
}

function lockSettingsRender() {
  const box = document.getElementById('lockSettings'); if (!box) return;
  if (!lockAvailable()) { box.innerHTML = '<p class="hint">這個瀏覽器不支援密碼鎖（需要 HTTPS）。</p>'; return; }
  const on = lockEnabled(), after = prefs().lockAfter ?? 1;
  box.innerHTML = on
    ? `<label class="setting"><span>離開多久後重新鎖定</span><select id="lockAfter">${[[0, '每次開啟'], [1, '1 分鐘'], [5, '5 分鐘'], [15, '15 分鐘'], [60, '1 小時']].map(([v, l]) => `<option value="${v}" ${Number(after) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><div class="lock-actions"><button type="button" class="secondary" data-lock-change>變更 PIN</button><button type="button" class="secondary danger-btn" data-lock-off>關閉密碼鎖</button><button type="button" class="secondary" data-lock-now>立即鎖定</button></div>`
    : '<div class="lock-actions"><button type="button" class="secondary" data-lock-on>設定 PIN 密碼鎖</button></div>';
  document.getElementById('lockAfter')?.addEventListener('change', e => setPref('lockAfter', Number(e.target.value) || 0));
}

async function lockAskNewPin() {
  const a = prompt('輸入新的 PIN（4–6 位數字）'); if (a === null) return false;
  if (!lockValidPin(a)) { alert('PIN 必須是 4 到 6 位數字'); return false; }
  const b = prompt('再輸入一次新的 PIN'); if (b === null) return false;
  if (a !== b) { alert('兩次輸入的 PIN 不同'); return false; }
  await lockSetPin(a); return true;
}

document.addEventListener('click', async e => {
  const k = e.target.closest?.('[data-lock-key]');
  if (k) { const v = k.dataset.lockKey; if (v === '⌫') lockEntry = lockEntry.slice(0, -1); else if (lockEntry.length < 6) lockEntry += v; lockRenderDots(); await lockTry(); return; }
  if (e.target.closest?.('[data-lock-forgot]')) { alert('PIN 只存在這台裝置，無法找回。\n\n如果有登入雲端同步，可以在瀏覽器的網站設定中清除這個網站的資料，重新開啟後登入雲端帳號即可取回資料（本機尚未同步的變更會遺失）。'); return; }
  if (e.target.closest?.('[data-lock-on]')) { if (await lockAskNewPin()) { alert('已開啟密碼鎖。'); lockSettingsRender(); } return; }
  if (e.target.closest?.('[data-lock-change]')) { const cur = prompt('輸入目前的 PIN'); if (cur === null) return; if (!(await lockVerify(cur))) return alert('PIN 錯誤'); if (await lockAskNewPin()) alert('已變更 PIN。'); return; }
  if (e.target.closest?.('[data-lock-off]')) { const cur = prompt('輸入目前的 PIN 以關閉密碼鎖'); if (cur === null) return; if (!(await lockVerify(cur))) return alert('PIN 錯誤'); lockClear(); lockSettingsRender(); return; }
  if (e.target.closest?.('[data-lock-now]')) { lockShow(); }
});
document.addEventListener('keydown', async e => {
  if (!document.getElementById('appLock')) return;
  if (/^\d$/.test(e.key) && lockEntry.length < 6) { lockEntry += e.key; lockRenderDots(); await lockTry(); }
  else if (e.key === 'Backspace') { lockEntry = lockEntry.slice(0, -1); lockRenderDots(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') lockHiddenAt = Date.now();
  else if (lockEnabled() && lockShouldRelock(lockHiddenAt, Date.now(), prefs().lockAfter)) lockShow();
});
