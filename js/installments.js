// 帳小簿 V26.14 — 分期付款.
// Bundled after js/entry-assist.js; uses app.js / recurring globals (state, id, addPeriod, money).
// Function declarations / var only.
//
// An installment purchase becomes N ordinary expense transactions, one per month starting on the
// purchase date, linked by { installment: { group, n, total, amount } }. Budgets, reports, card
// statements and reconciliation therefore see each month's share in its own month.

// o (V26.79): startNo = number of the first period kept here (the rest is already paid), int = whole amounts, rem = 'first' | 'last' gets the remainder.
function installmentPlan(t, countRaw, o) {
  const n = Math.floor(Number(countRaw) || 0);
  if (!t || t.kind !== 'expense' || n < 2) return null;
  if (n > 60) return { error: '分期最多 60 期' };
  if (Array.isArray(t.splits) && t.splits.length) return { error: '分期交易不能同時拆帳' };
  const total = Math.round(Math.abs(Number(t.amount || 0)) * 100);
  if (total < n) return { error: '金額太小，無法分期' };
  const unit = o?.int ? 100 : 1, no = Math.max(1, Math.floor(Number(o?.startNo) || 1)), all = n + no - 1, remAt = o?.rem === 'last' ? n : 1;
  const each = Math.floor(total / n / unit) * unit, first = total - each * (n - 1), group = id();
  const rule = { freq: 'month', interval: 1, start: t.date };
  // the fee / discount is already inside the total; the instalments carry only their own net share
  const base = { ...t }; for (const k of ['fee', 'discount', 'feeIncluded', 'feeName', 'discountName', 'attachments']) delete base[k];
  const out = [];
  let date = t.date;
  for (let i = 1; i <= n; i++) {
    const amount = (i === remAt ? first : each) / 100, k = no + i - 1;
    out.push({ ...base, id: i === 1 ? t.id : id(), date, amount, name: t.name + '（' + k + '/' + all + '）', installment: { group, n: k, total: all, amount: total / 100 } });
    date = addPeriod(date, rule);
  }
  return { list: out };
}

function installmentGroup(t) { return t?.installment?.group ? (state.transactions || []).filter(x => x.installment?.group === t.installment.group) : []; }

// Which transactions to delete for an installment: the whole group, only the upcoming ones, or just this one.
function installmentDeleteChoice(t) {
  const g = installmentGroup(t).sort((a, b) => a.installment.n - b.installment.n);
  if (g.length <= 1) return confirm(`確定刪除「${t.name}」${money(t.amount)}？`) ? [String(t.id)] : null;
  if (confirm(`這是分期交易（共 ${g.length} 期，總額 ${money(t.installment.amount)}）。\n\n要刪除「整組」${g.length} 期嗎？\n按「取消」可以選擇只刪除這一期。`)) return g.map(x => String(x.id));
  return confirm(`只刪除第 ${t.installment.n} 期「${t.name}」${money(t.amount)}？`) ? [String(t.id)] : null;
}

function installmentLabel(t) { return t?.installment ? `第 ${t.installment.n} / ${t.installment.total} 期 · 總額 ${money(t.installment.amount)}` : ''; }

function updateInstallmentUI() {
  const box = document.getElementById('installmentBox'); if (!box) return;
  const kind = document.querySelector('input[name=kind]:checked')?.value;
  box.hidden = kind !== 'expense' || !!editId;
  const on = document.querySelector('#txForm [name=instOn]')?.checked;
  const cnt = document.getElementById('instCountField'); if (cnt) cnt.hidden = !on;
  const hint = document.getElementById('instHint');
  if (hint) {
    const amt = Number(document.querySelector('#txForm [name=amount]')?.value || 0), n = Math.floor(Number(document.querySelector('#txForm [name=instCount]')?.value || 0));
    hint.textContent = on && amt > 0 && n >= 2 ? `每期約 ${money(Math.floor(amt * 100 / n) / 100)}，共 ${n} 期，第 1 期為交易日期，之後每月同一天。` : '';
  }
}
document.addEventListener('change', e => { if (e.target?.closest?.('#txForm') && ['kind', 'instOn', 'instCount'].includes(e.target.name)) updateInstallmentUI(); });
document.addEventListener('input', e => { if (e.target?.closest?.('#txForm') && ['amount', 'instCount'].includes(e.target.name)) updateInstallmentUI(); });
