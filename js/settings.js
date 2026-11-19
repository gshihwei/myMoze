// 帳小簿 V26.12 — 偏好設定與 MOZE 格式 CSV 匯出.
// Bundled after js/accounts.js; uses app.js / import-compatible globals (state, cat, acct, acctCur,
// ledgerEffects, isUnappliedPending, render, renderCalendar). Function declarations / var only.

// ---------- preferences (per device, not synced) ----------
var prefsCache;
function prefsKey() { return 'moze-prefs-v1'; }
function prefsDefaults() { return { weekStart: 0, showQuick: true, jumpToTxDate: false, theme: 'dark', hiddenPanels: [] }; }
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
// Leading blank cells before day 1 for the configured first weekday (0 = Sunday, 1 = Monday).
function calendarLead(y, m) { return (new Date(y, m, 1).getDay() - (prefs().weekStart || 0) + 7) % 7; }
function settingsInit() {
  const p = prefs();
  const ws = document.getElementById('prefWeekStart'); if (ws) { ws.value = String(p.weekStart); ws.onchange = () => { setPref('weekStart', Number(ws.value) || 0); renderCalendar(); }; }
  const box = document.getElementById('prefOverviewPanels');
  if (box) {
    const hidden = new Set(overviewHidden(p));
    box.innerHTML = overviewPanels().map(([k, l]) => `<label><input type="checkbox" data-ov-pref="${k}" ${hidden.has(k) ? '' : 'checked'}> ${l}</label>`).join('');
    box.querySelectorAll('[data-ov-pref]').forEach(cb => cb.onchange = () => { const set = new Set(overviewHidden()); if (cb.checked) set.delete(cb.dataset.ovPref); else set.add(cb.dataset.ovPref); setPref('hiddenPanels', [...set]); });
  }
  const jd = document.getElementById('prefJumpToTxDate'); if (jd) { jd.checked = !!p.jumpToTxDate; jd.onchange = () => setPref('jumpToTxDate', jd.checked); }
  const th = document.getElementById('prefTheme'); if (th) { th.value = p.theme || 'dark'; th.onchange = () => setPref('theme', th.value); }
  if (typeof matchMedia === 'function') { const mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener?.('change', () => { if (prefs().theme === 'system') applyTheme(); }); }
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
