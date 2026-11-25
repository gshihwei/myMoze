// 帳小簿 V26.94 — 標記顏色、日期格式、金額建議、每 4 小時備份與分享、App 圖示數字、捷徑網址、生物辨識解鎖.
// Bundled after js/loan-more.js. Function declarations / var only.

// ---- display ----
function fmtDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return String(d || ''); const k = typeof prefs === 'function' ? prefs().dateFmt : '';
  return k === 'mdy' ? `${m[2]}/${m[3]}/${m[1]}` : k === 'dmy' ? `${m[3]}/${m[2]}/${m[1]}` : `${m[1]}/${m[2]}/${m[3]}`;
}
function applyAccent() { const r = document.documentElement, c = prefs().accent; if (!r?.style) return; if (/^#[0-9a-f]{6}$/i.test(c || '')) { r.style.setProperty('--purple', c); r.style.setProperty('--blue', c); r.dataset.accent = '1'; } else { r.style.removeProperty('--purple'); r.style.removeProperty('--blue'); delete r.dataset.accent; } }
// Recent amounts: the same category first, then everything else.
function amountSuggest(cid, kind, n) {
  const seen = new Set(), a = [], b = [];
  for (let i = (state.transactions || []).length - 1, k = 0; i >= 0 && k < 1500; i--, k++) { const t = state.transactions[i]; if (t.kind !== kind || t.imported && k > 800) continue; const v = t.orig ? t.orig.amount : entryBaseAmount(t); if (!(v > 0) || seen.has(v)) continue; (String(t.category) === String(cid) ? a : b).push(v); if (String(t.category) === String(cid)) seen.add(v); if (a.length >= n) break; }
  return [...a, ...b.filter(v => !a.includes(v))].slice(0, n);
}
function renderAmountSug() {
  const box = document.getElementById('amountSug'); if (!box) return; const kind = document.querySelector('input[name=kind]:checked')?.value;
  box.innerHTML = prefs().amountSug === false || kind === 'transfer' ? '' : amountSuggest(efEl('category')?.value, kind, 8).map(v => `<button type="button" data-amt-sug="${v}">${Number(v).toLocaleString('zh-TW')}</button>`).join('');
}
// ---- copy time: '' now date+time | 'keep' original date+time | 'nowDate' today + original time | 'nowTime' original date + now ----
function copyTimeApply(c, t) { const k = prefs().copyTime || '', today = selectedDate || isoDate(new Date()); if (k === 'keep') return c; if (k !== 'nowTime') c.date = today; if (k !== 'nowDate') c.time = nowTime(); else c.time = t.time || ''; return c; }
// ---- app icon badge ----
function appBadge() { try { const n = noticeCount(); if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge?.(); } catch { } }
// ---- backups ----
function backupSlot(d) { const x = d || new Date(); return `${isoDate(x)} ${String(Math.floor(x.getHours() / 4) * 4).padStart(2, '0')}:00`; }
async function backupNow() {
  const x = new Date(), key = `${isoDate(x)} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')} 手動`, db = await backupOpen();
  await backupTx(db, 'readwrite', store => { store.put({ day: key, at: x.toISOString(), summary: backupSummary(state), data: JSON.stringify(state) }); });
  const days = await backupTx(db, 'readonly', (store, done) => { const r = store.getAllKeys(); r.onsuccess = () => done(r.result || []); });
  for (const day of backupPrune(days)) await backupTx(db, 'readwrite', store => { store.delete(day); });
  return key;
}
async function backupShare() {
  const name = `帳小簿-備份-${isoDate(new Date())}.json`, text = JSON.stringify(state), file = typeof File === 'function' ? new File([text], name, { type: 'application/json' }) : null;
  try { if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  backupDownload(name, text);
}
// ---- deep links / shortcuts: index.html?add=expense&amount=120&name=… (fills the form; nothing is saved without you) ----
function deepParse(q) {
  const p = new URLSearchParams(q || ''), o = {}; for (const k of ['add', 'tpl', 'notify', 'text', 'title', 'say', 'go']) if (p.get(k)) o[k] = String(p.get(k)).slice(0, 2000);
  if (!o.add && !o.tpl && !o.notify && !o.text && !o.title && !o.say && !o.go) return null;
  for (const k of ['amount', 'name', 'merchant', 'note', 'tags', 'date', 'time', 'category', 'account', 'to', 'project', 'person', 'cur']) if (p.get(k)) o[k] = String(p.get(k)).slice(0, 300);
  return o;
}
// Finds an account / category / project by id, exact name, then partial name.
function deepFind(list, v) { if (!v) return null; const s = String(v).trim().toLowerCase(), l = list || []; return l.find(x => String(x.id) === String(v)) || l.find(x => String(x.name).toLowerCase() === s) || l.find(x => String(x.name).toLowerCase().includes(s)) || null; }
function deepTx(o) {
  const kind = ['expense', 'income', 'transfer'].includes(o.add) ? o.add : 'expense', amount = Number(String(o.amount || '').replace(/,/g, '')), t = { kind, name: o.name || '', merchant: o.merchant || '', note: o.note || '', person: o.person || '', tags: parseTags(o.tags || ''), date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : isoDate(new Date()), time: /^\d{2}:\d{2}$/.test(o.time || '') ? o.time : nowTime() };
  if (amount > 0) t.amount = amount; const c = deepFind((state.categories || []).filter(x => (x.kind || 'expense') === kind && x.kind !== 'prefs'), o.category), a = deepFind((state.accounts || []).filter(x => !x.archived), o.account), p = deepFind(state.projects, o.project), b = deepFind(state.accounts, o.to);
  if (c) t.category = c.id; if (a) t.account = a.id; if (p) t.project = p.id; if (b && kind === 'transfer') t.toAccount = b.id; return t;
}
function deepRun(o) {
  if (!o || !state) return; if (o.go) { nav(o.go); return; }
  if (o.notify || o.text || o.title) { if (typeof draftAdd === 'function') { const d = draftAdd([o.title, o.notify || o.text].filter(Boolean).join(' ')); openDrafts(); if (d.error) alert(d.error); } return; }
  if (o.say) { if (typeof sayOpen === 'function') sayOpen(o.say); return; }
  if (o.tpl) { const x = tplList().find(y => y.name === o.tpl) || tplList().find(y => y.name.includes(o.tpl)); if (x) window.openTx(x.data.kind, { ...JSON.parse(JSON.stringify(x.data)), date: isoDate(new Date()), time: nowTime() }); else alert(`找不到範本「${o.tpl}」`); return; }
  if (o.add === 'receivable' || o.add === 'payable' || o.add === 'transfer' && !o.amount && !o.account) { window.openTx(o.add === 'transfer' ? 'transfer' : 'expense'); if (o.add !== 'transfer') setTimeout(() => document.querySelector(`[data-etab-btn="${o.add}"]`)?.click(), 120); return; }
  const t = deepTx(o); window.openTx(t.kind, Object.keys(o).length > 1 ? t : undefined);
}
function deepStart() {
  let o = null; try { o = deepParse(location.search); } catch { } if (!o) return; try { history.replaceState(null, '', location.pathname + location.hash); } catch { }
  let n = 0; const tick = () => { if (state?.accounts && document.getElementById('txForm') && !document.getElementById('appLock')) deepRun(o); else if (n++ < 600) setTimeout(tick, 300); }; setTimeout(tick, 600);
}
// ---- biometrics (WebAuthn): a screen-lock shortcut for the PIN, kept on this device only ----
function bioAvailable() { return typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials?.create; }
function b64u(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(s) { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function bioRegister() {
  const c = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: '帳小簿' }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: '帳小簿', displayName: '帳小簿' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, timeout: 60000 } });
  if (!c) throw new Error('沒有建立成功'); setPref('lockBio', b64u(c.rawId));
}
async function bioUnlock() {
  const i = prefs().lockBio; if (!i || !bioAvailable()) return false;
  try { const r = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64u(i), transports: ['internal'] }], userVerification: 'required', timeout: 60000 } }); if (r && b64u(r.rawId) === i) { lockHide(); return true; } } catch { } return false;
}
function bioSettingsHTML() { return !lockEnabled() || !bioAvailable() ? '' : `<label class="setting"><span>用 Face ID／指紋／Windows Hello 解鎖</span><input type="checkbox" id="lockBioOn"${prefs().lockBio ? ' checked' : ''}></label>`; }
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s); let b;
  if ((b = c('[data-amt-sug]'))) { window.entrySetAmount?.(b.dataset.amtSug); return; }
  if (c('[data-backup-now]')) { try { const k = await backupNow(); toast(`已備份 ${k}`); renderBackups(); } catch (x) { alert('備份失敗：' + (x?.message || x)); } return; }
  if (c('[data-backup-share]')) { backupShare(); return; }
  if (c('[data-lock-bio]')) { bioUnlock(); }
});
document.addEventListener('change', async e => {
  if (e.target?.id === 'prefAccent') { setPref('accent', e.target.value); applyAccent(); }
  if (e.target?.id === 'lockBioOn') { if (e.target.checked) { try { await bioRegister(); toast('已開啟生物辨識解鎖'); } catch (x) { e.target.checked = false; alert('無法開啟：' + (x?.message || x)); } } else setPref('lockBio', ''); }
});
document.addEventListener('click', e => { if (e.target.closest?.('[data-accent-reset]')) { setPref('accent', ''); applyAccent(); } });
deepStart();
