// 帳小簿 V26.120 — 從財政部下載電子發票（經由自己 Supabase 專案的 Edge Function「einvoice」）.
// Bundled after js/ov-order.js. Function declarations / var only.
// Account data stays on this device and never syncs: the password is encrypted with a non-extractable AES-GCM key kept in
// IndexedDB (this stops someone who copies the browser storage; it cannot stop code running inside this page).
// Downloads the current and the previous invoice period into the 未歸帳 pool (js/invoice.js), which syncs as usual.

function einvLs(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } }
function einvOwner() { return typeof prefSyncUser === 'function' ? prefSyncUser() : ''; }
// Saved account of the signed-in user only; another account's data on this device is removed.
function einvCred() { const c = einvLs('moze-einv-cred-v1'); if (c && String(c.owner || '') !== einvOwner()) { einvForget(); return null; } return c; }
function einvSessGet() { const s = einvLs('moze-einv-sess-v1'); return s && String(s.owner || '') === einvOwner() ? s.session : null; }
function einvSessSet(session) { einvLs('moze-einv-sess-v1', session ? { owner: einvOwner(), session } : null); }
function einvForget() { einvLs('moze-einv-cred-v1', null); einvLs('moze-einv-sess-v1', null); }
// ---- password encryption ----
function einvIdb(mode, fn) {
  return new Promise((ok, no) => { const r = indexedDB.open('moze-einv', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onerror = () => no(r.error);
    r.onsuccess = () => { const tx = r.result.transaction('k', mode), q = fn(tx.objectStore('k')); tx.oncomplete = () => { ok(q?.result); r.result.close(); }; tx.onerror = () => no(tx.error); }; });
}
async function einvKey() {
  let k = await einvIdb('readonly', s => s.get('key')); if (k) return k;
  k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await einvIdb('readwrite', s => s.put(k, 'key')); return k;
}
function einvB64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
async function einvSeal(text) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await einvKey(), new TextEncoder().encode(text))); return { iv: einvB64(iv), ct: einvB64(ct) }; }
async function einvOpen(c) { const d = s => Uint8Array.from(atob(s), x => x.charCodeAt(0)); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: d(c.iv) }, await einvKey(), d(c.ct))); }
async function einvSaveCred(mobile, password, carrier, auto) {
  const c = { owner: einvOwner(), mobile: String(mobile).replace(/\D/g, ''), carrier: String(carrier || '').trim().toUpperCase(), auto: auto !== false, ...(await einvSeal(String(password))) };
  einvLs('moze-einv-cred-v1', c); einvSessSet(null); return c;
}
// ---- calls through the Edge Function ----
async function einvCall(body) {
  if (!window.MozeSync?.invoke) throw new Error('雲端同步尚未載入');
  const r = await window.MozeSync.invoke('einvoice', body); if (r.error) throw new Error(r.error);
  if (r.data?.error) throw Object.assign(new Error(r.data.error), { code: r.data.code }); return r.data || {};
}
// Saved session → token login → password login (each at most once per run).
async function einvSession(fresh) {
  const c = einvCred(); if (!c) throw Object.assign(new Error('尚未設定財政部帳號'), { nocred: true });
  const old = einvSessGet(); if (old && !fresh) return old; let s = null;
  if (old?.ltoken) try { s = (await einvCall({ action: 'logintoken', session: old })).session; } catch { s = null; }
  if (!s) s = (await einvCall({ action: 'login', mobile: c.mobile, password: await einvOpen(c), carrier: c.carrier })).session;
  if (!s?.loginSsMe) throw new Error('登入失敗'); if (!s.carrierCode && c.carrier) s.carrierCode = c.carrier; einvSessSet(s); return s;
}
// Current and previous invoice period, the current one capped at today. Same rule as the Edge Function.
function einvPeriods(now) {
  const d = now || new Date(), ymd = x => `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}`, cur = d.getFullYear() * 6 + Math.floor(d.getMonth() / 2);
  return [0, 1].map(i => { const ix = cur - i, y = Math.floor(ix / 6), m = (ix % 6) * 2, e = new Date(y, m + 2, 0); return { startDate: ymd(new Date(y, m, 1)), endDate: ymd(e > d ? d : e) }; });
}
async function einvPool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); })); }
function einvProgress(text) { window.__einvMsg = text || ''; const el = document.getElementById('einvProgress'); if (el) { el.textContent = window.__einvMsg; el.hidden = !text; } }
function einvFill(e, h) { let ch = false; for (const k of ['sellerName', 'sellerAddr', 'time', 'code', 'seller']) if (h[k] && !e[k]) { e[k] = h[k]; ch = true; } if (!e.carrier) { e.carrier = '手機條碼'; ch = true; } if (ch) e.mt = Date.now(); return ch; }
// → { added, filled, skipped, failed, total }
async function einvDownload() {
  if (window.__einvBusy) return { busy: true }; window.__einvBusy = true;
  try {
    let s = await einvSession(), retried = false; const heads = new Map(), periods = einvPeriods();
    einvProgress('正在登入並取得發票清單…');
    for (const p of periods) for (let page = 1; page <= 10; page++) {
      let l; try { l = (await einvCall({ action: 'headers', session: s, startDate: p.startDate, endDate: p.endDate, page })).invoices || []; }
      catch (e) { if (retried) throw e; retried = true; s = await einvSession(true); page--; continue; }
      const fresh = l.filter(x => x?.no && !heads.has(x.no)); fresh.forEach(x => heads.set(x.no, x)); if (!fresh.length) break;
    }
    const db = invDb(), gone = new Set(prefs().inboxGone || []), todo = [], res = { added: 0, filled: 0, skipped: 0, failed: 0, total: heads.size };
    for (const h of heads.values()) {
      if (invKnown(h.no) || gone.has('i' + h.no)) { res.skipped++; continue; }
      const e = db.list.find(i => i.no === h.no); if (e?.items?.length) { if (einvFill(e, h)) res.filled++; else res.skipped++; continue; } todo.push(h);
    }
    let done = 0; const got = new Map();
    await einvPool(todo, 3, async h => { try { got.set(h.no, (await einvCall({ action: 'detail', session: s, invNum: h.no, invDate: h.api })).items || []); } catch { res.failed++; } einvProgress(`下載發票明細 ${++done}/${todo.length}`); });
    for (const h of todo) {
      const items = got.get(h.no) || [], e = db.list.find(i => i.no === h.no);
      if (e) { if (items.length) e.items = items; einvFill(e, h); e.mt = Date.now(); res.filled++; continue; }
      const r = invAdd({ no: h.no, code: h.code || '', date: h.date, total: Number(h.total) || 0, seller: h.seller || '', count: items.length, items });
      if (r.error || r.dup) { res.skipped++; continue; } const n = db.list.find(i => i.no === h.no); if (n) einvFill(n, h); res.added++;
    }
    invStore(); einvLs('moze-einv-last', isoDate(new Date())); return res;
  } finally { window.__einvBusy = false; einvProgress(''); if (typeof renderInvoices === 'function') renderInvoices(); }
}
function einvResultText(r) { return [`新增 ${r.added} 張`, r.filled && `補上 ${r.filled} 張明細`, r.skipped && `${r.skipped} 張已有`, r.failed && `${r.failed} 張明細下載失敗（下次會再試）`].filter(Boolean).join('，'); }
async function einvRun(quiet) {
  try { const r = await einvDownload(); if (r.busy) return; if (!quiet || r.added) toast(`財政部發票：${einvResultText(r)}`); }
  catch (e) { if (e.nocred) { if (!quiet) einvOpenSetup(); return; } if (!quiet) alert('下載發票失敗：' + e.message); else console.warn('einvoice', e.message); }
}
// Once a day when the app opens (after sync has had time to sign in).
function einvAutoCheck() { const c = einvCred(); if (!c || c.auto === false || einvLs('moze-einv-last') === isoDate(new Date()) || !window.MozeSync?.isLoggedIn?.()) return false; einvRun(true); return true; }
// ---- setup sheet ----
function einvOpenSetup() {
  const el = sheetEl('einvBg'), c = einvCred(); el.style.zIndex = 75; el.hidden = false;
  el.innerHTML = `<div class="recon-sheet einv-sheet">${sheetHead('財政部帳號')}<div class="recon-list"><p class="hint">用財政部電子發票平台的帳號，下載本期與上一期手機條碼的發票與明細。需要先登入雲端同步，並在 Supabase 部署「einvoice」Edge Function（見 supabase/functions/einvoice/README.md）。</p>
  <form id="einvForm" class="form-grid"><label>手機號碼<input name="mobile" inputmode="tel" autocomplete="username" required value="${esc(c?.mobile || '')}" placeholder="09xxxxxxxx"></label><label>驗證碼（密碼）<input name="password" type="password" autocomplete="current-password" ${c ? 'placeholder="已儲存，不改請留空"' : 'required'}></label><label>手機條碼<input name="carrier" maxlength="8" autocapitalize="characters" value="${esc(c?.carrier || prefs().carrier || '')}" placeholder="/ABC1234"></label><label class="check"><input type="checkbox" name="auto" ${c?.auto === false ? '' : 'checked'}> 每天第一次開 App 自動下載</label></form>
  <p class="hint">帳號只存在這台裝置、不會同步；密碼以瀏覽器內不可匯出的金鑰加密保存。這不是財政部公開的 API，App 改版後可能失效。</p><p class="hint" id="einvSetupMsg"></p>
  <div class="form-actions">${c ? '<button type="button" class="secondary danger-btn" data-einv-forget>刪除帳號資料</button>' : ''}<button type="button" class="primary" data-einv-save>儲存並測試登入</button></div></div></div>`;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s);
  if (c('[data-einv-dl]')) { const s = invSt?.(); if (s) { s.menu = false; renderInvoices(); } if (!einvCred()) { einvOpenSetup(); return; } einvProgress('準備下載…'); einvRun(false); return; }
  if (c('[data-einv-setup]')) { const s = invSt?.(); if (s?.menu) { s.menu = false; renderInvoices(); } einvOpenSetup(); return; }
  if (c('[data-einv-forget]')) { if (confirm('刪除這台裝置上的財政部帳號、密碼與登入憑證？')) { einvForget(); document.getElementById('einvBg').hidden = true; toast('已刪除'); } return; }
  if (c('[data-einv-save]')) {
    const f = document.getElementById('einvForm'), d = new FormData(f), msg = document.getElementById('einvSetupMsg'), old = einvCred(), mobile = String(d.get('mobile') || '').replace(/\D/g, ''), carrier = String(d.get('carrier') || '').trim().toUpperCase();
    if (!/^09\d{8}$/.test(mobile)) { alert('請輸入 10 碼手機號碼'); return; } if (carrier && !/^\/[0-9A-Z.+-]{7}$/.test(carrier)) { alert('手機條碼格式是 / 加 7 個字元，例如 /ABC1234'); return; }
    let pw = String(d.get('password') || ''); if (!pw && old) pw = await einvOpen(old); if (!pw) { alert('請輸入驗證碼（密碼）'); return; }
    const b = e.target.closest('button'); b.disabled = true; msg.textContent = '登入中…';
    try { await einvSaveCred(mobile, pw, carrier, !!d.get('auto')); await einvSession(true); msg.textContent = '登入成功，開始下載…'; document.getElementById('einvBg').hidden = true; einvRun(false); }
    catch (x) { msg.textContent = '登入失敗：' + x.message; } finally { b.disabled = false; }
  }
});
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('load', () => setTimeout(() => { if (!einvAutoCheck()) setTimeout(einvAutoCheck, 20000); }, 8000));
