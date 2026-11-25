// 帳小簿 V26.62 — MOZE-style entry sheet helpers: calculator, tab/preset tables, suggestions, loans from the entry form.
// Bundled before js/entry-ui.js (tools/build-bundle.js). Function declarations / var only (hoisted).

// Preset rows of the non-category tabs. System presets become a normal expense / income with a category of that name.
function entryPresets() { return {
  transfer: [{ name: '轉帳', icon: '⇄' }, { name: '提款', icon: '⬆' }, { name: '存款', icon: '⬇' }, { name: '退款', icon: '↩' }, { name: '兌換', icon: '⇋' }],
  receivable: [{ name: '借出', icon: '💰' }, { name: '代付', icon: '🤝' }, { name: '報帳', icon: '💼' }],
  payable: [{ name: '借入', icon: '💵' }, { name: '信貸', icon: '💳' }, { name: '車貸', icon: '🚗' }, { name: '房貸', icon: '🏠' }],
  system: [{ name: '手續費', icon: '＄', kind: 'expense' }, { name: '折扣', icon: '🏷️', kind: 'income' }, { name: '紅利回饋', icon: '🪙', kind: 'income' },
    { name: '利息支出', icon: '🏦', kind: 'expense' }, { name: '利息收入', icon: '🏦', kind: 'income' }]
}; }

// ---- calculator (expression uses + - * / internally) ----
function entryOps() { return '+-*/'; }
function entryCalcKey(expr, key) {
  expr = String(expr || '');
  if (key === 'clear') return '';
  if (key === 'back') return expr.slice(0, -1);
  if (entryOps().includes(key)) {
    if (!expr) return expr;
    const last = expr.slice(-1);
    if (entryOps().includes(last)) return expr.slice(0, -1) + key;
    if (last === '.') return expr.slice(0, -1) + key;
    return expr + key;
  }
  const cur = expr.split(/[+\-*/]/).pop();
  if (key === '.') { if (cur.includes('.')) return expr; return expr + (cur === '' ? '0.' : '.'); }
  if (!/^\d+$/.test(key)) return expr;
  if (key === '00' && cur === '') return expr;
  if (cur === '0') { if (key === '00') return expr; expr = expr.slice(0, -1); }
  if (cur.replace('.', '').length + key.length > 12) return expr;
  return expr + key;
}
// Evaluates the expression (a trailing operator is ignored). Returns a number, or null when empty / invalid.
function entryCalcEval(expr) {
  const s = String(expr || '').replace(/[+\-*/.]+$/, '');
  if (!s) return null;
  const parts = s.match(/\d+(?:\.\d+)?|[+\-*/]/g);
  if (!parts || !/^\d/.test(parts[0])) return null;
  const out = [Number(parts[0])];
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i], n = Number(parts[i + 1]);
    if (!Number.isFinite(n)) return null;
    if (op === '*') out[out.length - 1] *= n;
    else if (op === '/') { if (n === 0) return null; out[out.length - 1] /= n; }
    else if (op === '+') out.push(n);
    else out.push(-n);
  }
  const v = out.reduce((a, b) => a + b, 0);
  return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
}
function entryCalcDisplay(expr) {
  return String(expr || '').replace(/(\d+)(\.\d*)?/g, (m, i, d) => Number(i).toLocaleString('zh-TW') + (d || '')).replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
}
function entryHasOp(expr) { return /[+\-*/]/.test(String(expr || '')); }

// ---- suggestions & ordering ----
// Categories used most in the last `days` days (expense / income only), topped up with the first main categories.
function entrySuggest(st, today, n, days) {
  const d = new Date(String(today || '').slice(0, 10) + 'T00:00:00'); d.setDate(d.getDate() - (days || 90));
  const cutoff = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  const cnt = new Map(), cats = new Map((st.categories || []).map(c => [String(c.id), c]));
  for (const t of (st.transactions || [])) {
    if (!t || (t.kind !== 'expense' && t.kind !== 'income') || !t.category || String(t.date) < cutoff) continue;
    const k = String(t.category); if (cats.has(k)) cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  const used = [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => cats.get(k));
  const out = used.slice(0, n);
  for (const c of (st.categories || [])) { if (out.length >= n) break; if (!c.parentId && (c.kind || 'expense') === 'expense' && !out.includes(c)) out.push(c); }
  return out;
}
// Active accounts, most used first (as source or destination), original order as the tie-break.
function entryAccountsByUse(st) {
  const cnt = new Map();
  for (const t of (st.transactions || [])) for (const k of [t.account, t.toAccount]) if (k !== undefined && k !== null && k !== '') cnt.set(String(k), (cnt.get(String(k)) || 0) + 1);
  return (st.accounts || []).map((a, i) => ({ a, i, c: cnt.get(String(a.id)) || 0 })).filter(x => !x.a.archived)
    .sort((x, y) => y.c - x.c || x.i - y.i).map(x => x.a);
}
function entryDefaultName(kind, categoryName, preset) {
  return String(preset || categoryName || ({ expense: '支出', income: '收入', transfer: '轉帳' }[kind]) || '記錄');
}

// ---- categories for the 系統 presets ----
function entryEnsureCategory(st, name, kind) {
  let c = (st.categories || []).find(x => x.name === name && (x.kind || 'expense') === kind && !x.parentId);
  if (c) return c;
  c = { id: id(), name, icon: (typeof catIconTable === 'function' && catIconTable()[name]) || '🏷️', kind };
  (st.categories = st.categories || []).push(c);
  return c;
}

// ---- 應收 / 應付 款項 created from the entry form (same ledger effect as the 借還款 page) ----
function entryPostLoan(st, o) {
  const amount = Math.abs(Number(o.amount || 0));
  const account = (st.accounts || []).find(a => String(a.id) === String(o.account));
  if (!amount) return { error: '請輸入有效金額' };
  if (!account) return { error: '請選擇帳戶' };
  if (account.type === 'card') return { error: '應收／應付款項請選擇現金或銀行帳戶，不能用信用卡' };
  const direction = o.direction === 'payable' ? 'payable' : 'receivable';
  const date = o.date || new Date().toISOString().slice(0, 10), person = String(o.person || '').trim() || '未指定對象';
  const label = o.label || (direction === 'receivable' ? '借出' : '借入');
  const name = String(o.name || '').trim() || `${label}：${person}`;
  const loanId = id();
  const loan = { id: loanId, person, direction, amount, paid: 0, account: account.id, date, dueDate: '', name, note: o.note || '', label, payments: [], status: 'active' };
  (st.loans = st.loans || []).push(loan);
  account.balance = Math.round((Number(account.balance || 0) + (direction === 'receivable' ? -amount : amount)) * 100) / 100;
  st.transactions.push({ id: id(), date, name, amount, kind: 'loan', loanId, direction, loanAction: direction === 'receivable' ? 'lend' : 'borrow', account: account.id, note: loan.note, person, category: '', loanRecord: true, time: o.time || '' });
  return { loan };
}
