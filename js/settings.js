// 帳小簿 V26.12 — 偏好設定與 MOZE 格式 CSV 匯出（V26.27：關於／版本資訊）.
// Bundled after js/accounts.js; uses app.js / import-compatible globals (state, cat, acct, acctCur,
// ledgerEffects, isUnappliedPending, render, renderCalendar). Function declarations / var only.

// ---------- app version (keep in step with sw.js CACHE, index.html and manifest.json) ----------
function appVersion() { return 'V26.43'; }
function appReleaseDate() { return '2026-11-25'; }
function appVersionLabel() { const [y, m, d] = appReleaseDate().split('-').map(Number); return { version: appVersion(), date: `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}` }; }
// newest app shell cache ('moze-v26.26-shell-v1' → 'V26.26'), compared numerically so V26.26 beats V26.9
function appCacheLatest(keys) {
  const vs = (keys || []).map(k => /^moze-v(\d+(?:\.\d+)*)-/.exec(k)?.[1]).filter(Boolean);
  const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
  return vs.length ? 'V' + vs.sort(cmp).pop() : '';
}
function renderAppVersion() {
  const v = document.getElementById('appVersion'), d = document.getElementById('appVersionDate'), c = document.getElementById('appCacheVersion');
  const l = appVersionLabel(); if (v) v.textContent = l.version; if (d) d.textContent = l.date;
  if (c && typeof caches !== 'undefined' && caches.keys) caches.keys().then(ks => { c.textContent = appCacheLatest(ks) || '未安裝'; }).catch(() => { c.textContent = '—'; });
  else if (c) c.textContent = '—';
}

// ---------- preferences (per device, not synced) ----------
var prefsCache;
function prefsKey() { return 'moze-prefs-v1'; }
function prefsDefaults() { return { weekStart: 0, showQuick: true, jumpToTxDate: false, theme: 'dark', hiddenPanels: [], remindOn: true, remindDays: 3, remindSnooze: '' }; }
function prefs() {
  if (!prefsCache) { let p = {}; try { p = JSON.parse(localStorage.getItem(prefsKey()) || '{}') || {}; } catch { p = {}; } prefsCache = { ...prefsDefaults(), ...p }; }
  return prefsCache;
}
function setPref(k, v) { prefs()[k] = v; try { localStorage.setItem(prefsKey(), JSON.stringify(prefsCache)); } catch {} applyPrefs(); }
// 'system' follows the OS; the inline script in index.html applies the same rule before first paint.
function themeResolved(p = prefs()) { return p.theme === 'light' ? 'light' : p.theme === 'system' ? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : 'dark'; }
function applyTheme() {
  const t = themeResolved(), html = document.documentElement; if (html?.dataset) html.dataset.theme = t;
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.setAttribute('content', t === 'light' ? '#f3f5f8' : '#101820');
  try { renderChart(); } catch {}
}
function applyPrefs() {
  const p = prefs();
  applyTheme();
  const hidden = new Set(overviewHidden(p));
  document.querySelectorAll('[data-ov-panel]').forEach(el => { el.hidden = hidden.has(el.dataset.ovPanel); });
  document.querySelectorAll('[data-ov-pref]').forEach(cb => { cb.checked = !hidden.has(cb.dataset.ovPref); });
  const dow = document.querySelector('.calendar .dow');
  if (dow) { const names = ['日', '一', '二', '三', '四', '五', '六']; dow.innerHTML = names.map((_, i) => `<span>${names[(i + p.weekStart) % 7]}</span>`).join(''); }
}
// Overview sections that can be hidden (settings → 偏好). The old showQuick switch maps to 'quick'.
function overviewPanels() { return [['cards', '信用卡帳單'], ['pending', '待完成交易'], ['loans', '借還款追蹤'], ['budgets', '本月預算'], ['upcoming', '即將到來'], ['recent', '最近交易'], ['quick', '快速記帳']]; }
function overviewHidden(p = prefs()) { const h = Array.isArray(p.hiddenPanels) ? [...p.hiddenPanels] : []; if (p.showQuick === false && !h.includes('quick')) h.push('quick'); return h; }
// ---------- manual exchange rates ----------
// prefs().fx = { USD: 31.5 } means 1 USD = 31.5 TWD and overrides the fetched rate on this device.
function fxOverride(cur) { const v = Number(prefs().fx?.[String(cur || '').toUpperCase()]); return v > 0 ? v : null; }
function fxCurrencies() { return [...new Set((state?.accounts || []).map(a => acctCur(a)).filter(c => c !== 'TWD'))].sort(); }
function renderFxPrefs() {
  const box = document.getElementById('prefFx'); if (!box) return;
  const curs = fxCurrencies();
  if (!curs.length) { box.innerHTML = '<p class="hint">目前沒有外幣帳戶。</p>'; return; }
  box.innerHTML = curs.map(c => { const o = fxOverride(c), auto = fxCache?.rates?.[c] > 0 ? 1 / fxCache.rates[c] : null;
    return `<label class="fx-row"><span>1 ${esc(c)} =</span><input type="number" min="0" step="any" inputmode="decimal" data-fx-cur="${esc(c)}" value="${o ?? ''}" placeholder="${auto ? auto.toFixed(4) : '尚無匯率'}"><span>TWD</span><small>${o ? '手動' : auto ? `自動（${fxDateLabel()}）` : '尚無自動匯率'}</small></label>`; }).join('');
  box.querySelectorAll('[data-fx-cur]').forEach(inp => inp.onchange = () => { const fx = { ...(prefs().fx || {}) }, v = Number(inp.value); if (v > 0) fx[inp.dataset.fxCur] = v; else delete fx[inp.dataset.fxCur]; setPref('fx', fx); renderFxPrefs(); try { render(); } catch {} });
}

// ---------- custom month start day (e.g. payday) ----------
// Period 'YYYY-MM' runs from day D of that month to day D-1 of the next month (D = 1 → calendar month).
function monthStartDay() { const d = Math.floor(Number(prefs().monthStart) || 1); return Math.min(28, Math.max(1, d)); }
function periodBounds(key, d = monthStartDay()) {
  const [y, m] = String(key).split('-').map(Number);
  if (d === 1) return { start: `${key}-01`, end: isoDate(new Date(y, m, 0)) };
  return { start: isoDate(new Date(y, m - 1, d)), end: isoDate(new Date(y, m, d - 1)) };
}
// The period key a date belongs to (a date before day D belongs to the previous month's period).
function periodKeyOf(date, d = monthStartDay()) { const dt = typeof date === 'string' ? new Date(date + 'T00:00:00') : date; const k = monthKey(new Date(dt.getFullYear(), dt.getMonth(), 1)); return dt.getDate() >= d ? k : addMonths(k, -1); }

// Leading blank cells before day 1 for the configured first weekday (0 = Sunday, 1 = Monday).
function calendarLead(y, m) { return (new Date(y, m, 1).getDay() - (prefs().weekStart || 0) + 7) % 7; }
function settingsInit() {
  const p = prefs();
  renderAppVersion();
  const ms = document.getElementById('prefMonthStart'); if (ms) { ms.innerHTML = Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1} 日</option>`).join(''); ms.value = String(monthStartDay()); ms.onchange = () => { setPref('monthStart', Number(ms.value) || 1); try { render(); } catch {} }; }
  const ws = document.getElementById('prefWeekStart'); if (ws) { ws.value = String(p.weekStart); ws.onchange = () => { setPref('weekStart', Number(ws.value) || 0); renderCalendar(); }; }
  const box = document.getElementById('prefOverviewPanels');
  if (box) {
    const hidden = new Set(overviewHidden(p));
    box.innerHTML = overviewPanels().map(([k, l]) => `<label><input type="checkbox" data-ov-pref="${k}" ${hidden.has(k) ? '' : 'checked'}> ${l}</label>`).join('');
    box.querySelectorAll('[data-ov-pref]').forEach(cb => cb.onchange = () => { const set = new Set(overviewHidden()); if (cb.checked) set.delete(cb.dataset.ovPref); else set.add(cb.dataset.ovPref); setPref('hiddenPanels', [...set]); });
  }
  const jd = document.getElementById('prefJumpToTxDate'); if (jd) { jd.checked = !!p.jumpToTxDate; jd.onchange = () => setPref('jumpToTxDate', jd.checked); }
  const ro = document.getElementById('prefRemindOn'); if (ro) { ro.checked = p.remindOn !== false; ro.onchange = () => { setPref('remindOn', ro.checked); renderReminders(); }; }
  const rd = document.getElementById('prefRemindDays'); if (rd) { rd.value = String(p.remindDays); rd.onchange = () => { setPref('remindDays', Number(rd.value)); renderReminders(); }; }
  const th = document.getElementById('prefTheme'); if (th) { th.value = p.theme || 'dark'; th.onchange = () => setPref('theme', th.value); }
  if (typeof matchMedia === 'function') { const mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener?.('change', () => { if (prefs().theme === 'system') applyTheme(); }); }
  renderFxPrefs();
  renderTemplates();
  lockSettingsRender();
  if (lockEnabled()) lockShow(); else delete document.documentElement.dataset.locked;
  const ex = document.getElementById('exportMozeCsv'); if (ex) ex.onclick = () => downloadMozeCsv();
  applyPrefs();
}

// ---------- MOZE-compatible CSV export ----------
// Same 16 columns js/import.js reads, so an export can be imported back (balances included:
// each account gets a「初始金額」row = current balance − Σ its transaction effects).
function mozeHeaders() { return ['帳戶', '幣種', '記錄類型＊', '主類別＊', '子類別＊', '金額＊', '手續費', '折扣', '名稱', '商家', '日期＊', '時間', '專案', '描述', '標籤', '對象']; }
function mozeDate(d) { const [y, m, dd] = String(d || '').split('-').map(Number); return y ? `${y}/${m}/${dd}` : ''; }
function mozeCats(t) {
  if (t.mainCategory || t.subcategory) return [t.mainCategory || t.subcategory, t.subcategory || t.mainCategory];
  const c = (state.categories || []).find(x => String(x.id) === String(t.category));
  if (!c) return ['其他', '其他'];
  const p = c.parentId ? (state.categories || []).find(x => String(x.id) === String(c.parentId)) : null;
  return p ? [p.name, c.name] : [c.name, c.name];
}
function mozeProject(t) { return t.project ? ((state.projects || []).find(p => String(p.id) === String(t.project))?.name || '') : ''; }

function mozeRows(st = state) {
  const out = [], accName = id => (st.accounts || []).find(a => String(a.id) === String(id));
  const row = (a, type, main, sub, amount, o = {}) => [a?.name || '', acctCur(a), type, main, sub, String(Math.round(amount * 100) / 100), o.fee ? String(o.fee) : '', o.discount ? String(o.discount) : '', o.name || '', o.merchant || '', o.date || '', o.time || '', o.project || '', o.note || '', o.tags || '', o.person || ''];
  // opening rows
  const effect = new Map();
  for (const t of (st.transactions || [])) for (const [id, v] of ledgerEffects(t)) effect.set(String(id), (effect.get(String(id)) || 0) + v);
  for (const a of (st.accounts || [])) out.push(row(a, '初始金額', '', '', Number(a.balance || 0) - (effect.get(String(a.id)) || 0)));
  const txs = (st.transactions || []).filter(t => !isUnappliedPending(t)).slice().sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.time || '').localeCompare(String(y.time || '')));
  for (const t of txs) {
    const a = accName(t.account), [main, sub] = mozeCats(t);
    const base = { name: t.name || '', merchant: t.merchant || '', date: mozeDate(t.date), time: t.time || '00:00', project: mozeProject(t), note: t.note || '', tags: Array.isArray(t.tags) ? t.tags.join(';') : '', person: t.person || '' };
    const amt = Math.abs(Number(t.amount || 0)), fee = Math.abs(Number(t.fee || 0)), disc = Math.abs(Number(t.discount || 0));
    if (t.kind === 'transfer') {
      const to = accName(t.toAccount);
      out.push(row(a, '轉出', '轉帳', '轉帳', -amt, { ...base, fee }));
      out.push(row(to, '轉入', '轉帳', '轉帳', Math.abs(Number(t.toAmount ?? amt)), base));
    } else if (t.kind === 'expense' || t.kind === 'income') {
      const sign = t.kind === 'expense' ? -1 : 1, type = t.recordType && ['支出', '收入', '退款'].includes(t.recordType) ? t.recordType : (t.kind === 'expense' ? '支出' : '收入');
      if (Array.isArray(t.splits) && t.splits.length) {
        t.splits.forEach((s, i) => { const [m2, s2] = mozeCats({ category: s.category }); out.push(row(a, type, m2, s2, sign * Math.abs(Number(s.amount || 0)), { ...base, fee: i ? 0 : fee, discount: i ? 0 : disc })); });
      } else out.push(row(a, type, main, sub, sign * amt, { ...base, fee, discount: disc }));
    } else if (t.kind === 'balance_adjustment') {
      out.push(row(a, '餘額調整', main === '其他' ? '其他' : main, sub === '其他' ? '餘額調整' : sub, Number(t.amount || 0), base));
    } else if (t.kind === 'loan') {
      const lend = t.loanAction === 'lend' || t.direction === 'receivable';
      out.push(row(a, lend ? '應收款項' : '應付款項', '借還款', lend ? '借出' : '借入', lend ? -amt : amt, { ...base, fee, discount: disc, person: t.person || '' }));
    } else if (t.kind === 'loanPayment') {
      const rec = t.loanDirection === 'receivable';
      out.push(row(a, rec ? '應收款項' : '應付款項', '借還款', rec ? '收款' : '還款', rec ? amt : -amt, { ...base, fee, discount: disc, person: t.person || '' }));
    }
  }
  return out;
}

function mozeCsv(st = state) {
  const cell = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [mozeHeaders(), ...mozeRows(st)].map(r => r.map(cell).join(',')).join('\r\n');
}
function downloadMozeCsv() {
  const a = document.createElement('a'), d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = URL.createObjectURL(new Blob([mozeCsv()], { type: 'text/csv;charset=utf-8' }));
  a.download = `帳小簿-MOZE格式-${stamp}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
