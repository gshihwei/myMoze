// 帳小簿 V26.80 — 帳戶總額區塊、隱私模式、存摺式餘額、歷史統計、自動儲值、餘額不足即時提醒.
// Bundled after js/series.js. Function declarations / var only.
// Account fields: topUp = { from, below, mode: after|diff|before, amount }, cycleStart (1–28, first day of the account's month).

function privacyOn() { return typeof prefs === 'function' && !!prefs().privacy; }
function toast(msg) { const o = document.createElement('div'); o.className = 'app-toast'; o.textContent = msg; document.body.append(o); setTimeout(() => o.remove(), 4500); }

// ---- totals ----
function acctTotals(list, cur) {
  const rows = (list || state.accounts).filter(a => !a.excludeNet && (!cur || acctCur(a) === cur)).map(a => ({ a, twd: acctCur(a) === 'TWD' ? Number(a.balance || 0) : toTWD(a.balance, acctCur(a)) })), ok = rows.filter(r => r.twd !== null);
  const sum = l => Math.round(l.reduce((s, r) => s + r.twd, 0)), part = key => { const m = new Map(); for (const r of ok) { const k = key(r.a), x = m.get(k) || { key: k, assets: 0, debts: 0 }; if (r.twd >= 0) x.assets += r.twd; else x.debts -= r.twd; m.set(k, x); } return [...m.values()].map(x => ({ ...x, assets: Math.round(x.assets), debts: Math.round(x.debts) })).sort((a, b) => b.assets + b.debts - a.assets - a.debts); };
  return { total: sum(ok), assets: sum(ok.filter(r => r.twd > 0)), debts: -sum(ok.filter(r => r.twd < 0)), groups: part(a => acctTypeLabel(a)), curs: part(a => acctCur(a)), missing: rows.length - ok.length };
}
function acctTotalsHTML() {
  const cur = window.__acctCur || '', T = acctTotals(null, cur), tot = T.assets + T.debts || 1, rows = l => l.map(x => `<div class="at-row"><span>${esc(x.key)}</span><i style="width:${((x.assets + x.debts) / tot * 100).toFixed(1)}%"></i><b>${x.assets ? `<em class="income-text">${money(x.assets)}</em>` : ''}${x.debts ? ` <em class="expense-text">−${money(x.debts)}</em>` : ''}</b></div>`).join('');
  return `<div class="at-head"><div><small>總額${cur ? `（${esc(cur)}）` : ''}</small><strong>${T.total < 0 ? '−' : ''}${money(Math.abs(T.total))}</strong></div><div><small>總資產</small><b class="income-text">${money(T.assets)}</b></div><div><small>總負債</small><b class="expense-text">${money(T.debts)}</b></div><select id="acctCurPick" aria-label="指定幣種"><option value="">所有幣種</option>${[...new Set(state.accounts.map(acctCur))].map(c => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div><details><summary>各分組與幣種佔比</summary><h4>分組</h4>${rows(T.groups)}<h4>幣種（折合 TWD）</h4>${rows(T.curs)}</details>`;
}
function renderAcctTotals() {
  const g = document.getElementById('accountGrid'); if (!g?.parentNode) return; let el = document.getElementById('acctTotals');
  if (!el) { el = document.createElement('section'); el.id = 'acctTotals'; el.className = 'acct-totals'; g.prepend(el); }
  el.innerHTML = acctTotalsHTML(); if (g.firstChild !== el) g.prepend(el);
  const cur = window.__acctCur; if (cur) g.querySelectorAll('[data-open-account],[data-open-credit]').forEach(x => { const a = acct(x.dataset.openAccount || x.dataset.openCredit); x.hidden = acctCur(a) !== cur; });
}

// ---- passbook ----
// Transactions touching account `aid`, newest first: { t, effect, after } where `after` is the balance right after it.
function passbook(aid) {
  const a = acct(aid), key = t => `${t.date} ${t.time || ''}`, l = [];
  (state.transactions || []).forEach((t, i) => { let e = 0, hit = false; for (const [k, v] of ledgerEffects(t)) if (String(k) === String(aid)) { e += v; hit = true; } if (hit) l.push({ t, i, effect: e }); });
  l.sort((x, y) => key(y.t).localeCompare(key(x.t)) || y.i - x.i);
  let bal = Number(a.balance || 0); for (const r of l) { r.after = Math.round(bal * 100) / 100; bal -= r.effect; } return l;
}
// Monthly end balance / in / out for the last n periods (oldest first).
function acctHistory(aid, n, today) {
  const a = acct(aid), d = Math.min(28, Math.max(1, Number(a.cycleStart || 1))), k0 = periodKeyOf(today || isoDate(new Date()), d), pb = passbook(aid), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = addMonths(k0, -i), p = periodBounds(key, d), last = pb.find(r => r.t.date <= p.end), inP = pb.filter(r => r.t.date >= p.start && r.t.date <= p.end);
    const first = pb.at(-1), end = last ? last.after : first ? Math.round((first.after - first.effect) * 100) / 100 : Number(a.balance || 0);
    out.push({ key, ...p, end, inc: Math.round(inP.filter(r => r.effect > 0).reduce((s, r) => s + r.effect, 0) * 100) / 100, out: Math.abs(Math.round(inP.filter(r => r.effect < 0).reduce((s, r) => s + r.effect, 0) * 100) / 100) });
  }
  return out.map((r, i) => ({ ...r, diff: i ? Math.round((r.end - out[i - 1].end) * 100) / 100 : null }));
}
function openAcctHistory(aid) {
  const a = acct(aid), el = sheetEl('ahBg'); el.hidden = false; const s = window.__ah = { id: aid, from: '', to: '' }; renderAcctHistory(s);
}
function renderAcctHistory(s) {
  const el = document.getElementById('ahBg'), a = acct(s.id), card = a.type === 'card'; let top;
  if (card) {
    const l = []; for (let k = -11; k <= 0; k++) { const st = creditStmt(a, new Date(), k); l.push(st); }
    top = `${anLineSVG(l.map(x => ({ v: x.spend, label: x.period.end.slice(2, 7).replace('-', '/') })), '#3f86e6', 700)}<div class="cmp-wrap"><table class="cmp"><thead><tr><th>帳單</th><th>消費</th><th>已繳</th><th>狀態</th></tr></thead><tbody>${[...l].reverse().map(x => `<tr><th>${x.period.start.slice(5)} ～ ${x.period.end}</th><td>${acctMoney(x.spend, a)}</td><td>${acctMoney(x.paid, a)}</td><td class="${x.owed > 0 ? 'expense-text' : 'income-text'}">${x.owed > 0 ? `剩 ${acctMoney(x.owed, a)}` : '已繳清'}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    const l = acctHistory(s.id, 12); top = `${anLineSVG(l.map(x => ({ v: x.end, label: x.key.slice(2).replace('-', '/') })), '#3f86e6', 700)}<div class="cmp-wrap"><table class="cmp"><thead><tr><th>月份</th><th>期末餘額</th><th>流入</th><th>流出</th><th>較上期</th></tr></thead><tbody>${[...l].reverse().map(x => `<tr><th>${x.key}</th><td>${acctMoney(x.end, a)}</td><td class="income-text">${acctMoney(x.inc, a)}</td><td class="expense-text">${acctMoney(x.out, a)}</td><td>${x.diff === null ? '—' : acctMoney(x.diff, a)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const pb = passbook(s.id).filter(r => (!s.from || r.t.date >= s.from) && (!s.to || r.t.date <= s.to));
  el.innerHTML = `<div class="recon-sheet fc-sheet">${sheetHead(`${acctName(a)} 歷史統計`)}<div class="recon-list notice-list">${top}<h3 class="notice-h">所有交易（${pb.length} 筆）</h3><div class="form-grid"><label>起<input type="date" id="ahFrom" value="${s.from}"></label><label>迄<input type="date" id="ahTo" value="${s.to}"></label></div>${pb.slice(0, 500).map(r => `<button type="button" class="notice-row" data-tx-open="${esc(r.t.id)}"><div class="notice-ico">${esc(cat(r.t.category).icon)}</div><div class="day-main"><b>${esc(r.t.name)}</b><small>${r.t.date} ${esc(r.t.merchant || '')}</small></div><div class="day-side"><b class="${r.effect < 0 ? 'expense-text' : 'income-text'}">${acctMoney(r.effect, a)}</b><small>餘額 ${acctMoney(r.after, a)}</small></div></button>`).join('')}${pb.length > 500 ? '<p class="hint">只列出 500 筆，請縮小日期範圍。</p>' : ''}</div></div>`;
}

// ---- 自動儲值 ----
// Transfers to make for account `a` (already at `balance`): [] when none.
function topUpAmount(a, balance) {
  const u = a?.topUp; if (!u || !(Number(u.below) > 0) || !(balance < Number(u.below))) return 0;
  if (u.mode === 'diff') return Math.round((Number(u.below) - balance) * 100) / 100;
  const amt = Number(u.amount || 0); if (!(amt > 0)) return 0; if (u.mode === 'before') return amt;
  return amt * Math.max(1, Math.ceil((Number(u.below) - balance) / amt - 1e-9));
}
function topUpPost(a, amount, date, time) {
  const src = (state.accounts || []).find(x => String(x.id) === String(a.topUp.from)); if (!src || src.id === a.id || !(amount > 0) || acctCur(src) !== acctCur(a)) return null;
  const t = { id: id(), date, time: time || '', kind: 'transfer', amount, account: src.id, toAccount: a.id, category: '', name: `自動儲值 · ${a.name}`, merchant: '', project: '', person: '', note: '', tags: [], autoTopUp: true }; state.transactions.push(t); adjust(t, 1); return t;
}
function topUpHook(t, when) {
  if (!t || t.kind !== 'expense' || isUnappliedPending(t)) return null; const a = (state.accounts || []).find(x => String(x.id) === String(t.account)), u = a?.topUp; if (!u) return null;
  if ((when === 'before') !== (u.mode === 'before')) return null;
  return topUpPost(a, topUpAmount(a, Number(a.balance || 0)), t.date, t.time);
}
function acctPlusFieldsHTML(a) {
  if (a.type === 'card') return ''; const u = a.topUp || {}, src = (state.accounts || []).filter(x => x.id !== a.id && acctCur(x) === acctCur(a));
  return `<div class="form-grid"><label>每月統計起始日（例如發薪日）<input name="acycle" type="number" min="1" max="28" value="${esc(a.cycleStart || 1)}"></label></div><details class="acct-customcur"${u.from ? ' open' : ''}><summary>自動儲值</summary><div class="form-grid"><label>儲值來源<select name="atufrom"><option value="">不使用</option>${src.map(x => `<option value="${esc(x.id)}"${String(u.from || '') === String(x.id) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label><label>餘額低於<input name="atubelow" type="number" min="0" step="any" value="${esc(u.below ?? '')}"></label><label>方式<select name="atumode">${[['after', '消費後儲值（固定金額）'], ['diff', '補足差額'], ['before', '消費前儲值（固定金額）']].map(([v, l]) => `<option value="${v}"${u.mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>儲值金額<input name="atuamount" type="number" min="0" step="any" value="${esc(u.amount ?? '')}"></label></div></details>`;
}
function acctPlusFromForm(a, f) {
  delete a.topUp; delete a.cycleStart; if (a.type === 'card') return;
  const d = Math.floor(Number(f.get('acycle') || 1)); if (d > 1 && d <= 28) a.cycleStart = d;
  const from = String(f.get('atufrom') || ''), below = Number(f.get('atubelow') || 0), mode = ['after', 'diff', 'before'].includes(f.get('atumode')) ? f.get('atumode') : 'after', amount = Number(f.get('atuamount') || 0);
  if (from && below > 0 && (mode === 'diff' || amount > 0)) a.topUp = { from, below, mode, ...(mode === 'diff' ? {} : { amount }) };
}
// After saving: warn at once when a spend pushed an account / card under its threshold.
function lowAfterSave(t, before) {
  const a = (state.accounts || []).find(x => String(x.id) === String(t?.account)); if (!a || isUnappliedPending(t)) return '';
  if (a.type !== 'card' && lowBalanceHit(a) && before.low === false) return `${a.name} 餘額不足：${acctMoney(a.balance, a)}（低於 ${a.lowBalance}）`;
  if (a.type === 'card' && creditLowAvailHit(a) && before.low === false) return `${a.name} 可用額度不足：${money(creditUsage(a).available)}`;
  return '';
}
function lowState(aid) { const a = (state.accounts || []).find(x => String(x.id) === String(aid)); return { low: a ? (a.type === 'card' ? creditLowAvailHit(a) : lowBalanceHit(a)) : false }; }
// ⚠️ a pending record that would push its account under the threshold
function pendingLow(t) { const a = (state.accounts || []).find(x => String(x.id) === String(t.account)); if (!a || t.kind !== 'expense' || t.pendingApplied !== false) return false; const v = Number(t.amount || 0); return a.type === 'card' ? Number.isFinite(Number(a.lowAvail)) && a.lowAvail !== '' && a.lowAvail !== undefined && a.limit > 0 && creditUsage(a).available - v < Number(a.lowAvail) : Number.isFinite(Number(a.lowBalance)) && a.lowBalance !== undefined && Number(a.balance || 0) - v < Number(a.lowBalance); }
document.addEventListener('click', e => {
  const h = e.target.closest?.('[data-acct-history]'); if (h) { openAcctHistory(h.dataset.acctHistory); return; }
  if (e.target.closest?.('#privacyBtn')) { setPref('privacy', !prefs().privacy); document.getElementById('privacyBtn').textContent = privacyOn() ? '🙈' : '👁'; render(); renderAnalysis(); }
});
document.addEventListener('change', e => {
  if (e.target?.id === 'acctCurPick') { window.__acctCur = e.target.value; renderAccounts(); }
  if (e.target?.id === 'ahFrom' || e.target?.id === 'ahTo') { const s = window.__ah; s[e.target.id === 'ahFrom' ? 'from' : 'to'] = e.target.value; renderAcctHistory(s); }
});
