// 帳小簿 V26.90 — 多類別（拆帳）純函式：記帳頁上方的「＋」.
// Bundled after js/entry-fields.js; the interactive part lives in js/entry-ui.js. Function declarations / var only.
// item = { id?, tab, kind, category, preset, expr, fee, discount, account, project, person, name, cur, rewards, locked }

function itemBase(it) { const v = entryCalcEval(it.expr); return v > 0 ? v : 0; }
function itemNet(it) { const fee = Math.max(0, Number(it.fee) || 0), d = Math.max(0, Number(it.discount) || 0); return Math.round((itemBase(it) + (it.kind === 'income' ? d - fee : fee - d)) * 1e4) / 1e4; }
function itemLoan(it) { return it.tab === 'receivable' || it.tab === 'payable'; }
// What the item does to your money: −1 out, +1 in.
function itemSign(it) { return it.tab === 'payable' ? 1 : it.tab === 'receivable' ? -1 : it.kind === 'income' ? 1 : -1; }
function itemTWD(it) { const a = acct(it.account), v = itemNet(it), c = it.cur || acctCur(a), r = c === 'TWD' ? v : toTWD(v, c); return itemSign(it) * (r ?? v); }
function itemsTotal(list) { return Math.round(list.reduce((s, it) => s + itemTWD(it), 0) * 100) / 100; }
// True when every line can live in one transaction (only the category / amount / fee differ).
function itemsUniform(list) {
  const a = list[0]; if (!a || itemLoan(a)) return false;
  return list.every(x => !itemLoan(x) && !x.locked && x.kind === a.kind && String(x.account) === String(a.account) && String(x.project || '') === String(a.project || '') && (x.cur || '') === (a.cur || '') && !x.invoiceNo && (!x.name || x.name === (a.name || x.name)) && JSON.stringify(x.rewards || []) === JSON.stringify(a.rewards || [])) && !list.slice(1).some(x => x.name && x.name !== a.name);
}
function itemsCheck(list) {
  for (let i = 0; i < list.length; i++) { const it = list[i]; if (it.locked) continue; if (it.tab === 'transfer' || it.kind === 'transfer') return { error: '多類別不能包含轉帳', i }; if (!(itemBase(it) > 0)) return { error: `第 ${i + 1} 項還沒有金額`, i }; if (!(itemNet(it) > 0)) return { error: `第 ${i + 1} 項的折扣不能大於金額`, i }; if (it.tab === 'payable' && acct(it.account).type === 'card') return { error: '應付款項請選擇現金或銀行帳戶', i }; }
  return {};
}
// Items of a saved record: its split group, its inner splits, or null for a plain record.
function itemsOfTx(t) {
  if (!t || t.kind === 'transfer') return null;
  const base = x => ({ kind: x.kind === 'income' ? 'income' : 'expense', tab: isLoanTx(x) ? (x.direction === 'payable' ? 'payable' : 'receivable') : x.kind === 'income' ? 'income' : 'expense', category: x.category, account: x.account, project: x.project || '', person: x.person || '', name: x.name || '', note: x.note || '', rewards: x.rewards || [], cur: x.orig?.cur || '', invoiceNo: x.invoiceNo || '', invoiceCode: x.invoiceCode || '' });
  const g = t.id ? splitGroupOf(t) : [];
  if (g.length > 1) return g.map(x => ({ ...base(x), id: x.id, expr: String(x.orig ? x.orig.amount : entryBaseAmount(x)), fee: x.feeIncluded ? x.fee : 0, discount: x.feeIncluded ? x.discount : 0, conv: x.orig ? { auto: !!x.orig.auto, amount: entryBaseAmount(x) } : null, locked: isLoanTx(x) }));
  if (!Array.isArray(t.splits) || t.splits.length < 2) return null;
  const typed = t.splits.map(s => Number(s.base ?? s.amount)), cur = acctCur(acct(t.account)), fees = t.feeIncluded ? splitShare(typed, Number(t.fee || 0), cur) : [], disc = t.feeIncluded ? splitShare(typed, Number(t.discount || 0), cur) : [];
  return t.splits.map((s, i) => ({ ...base(t), id: i ? undefined : t.id, category: s.category, expr: String(typed[i]), fee: fees[i] || 0, discount: disc[i] || 0, cur: '', invoiceNo: i ? '' : t.invoiceNo || '', invoiceCode: i ? '' : t.invoiceCode || '' }));
}
function itemsStripHTML(list, ci, bubble, names) {
  const tot = itemsTotal(list), amt = it => itemNet(it) ? `${itemSign(it) > 0 ? '' : ''}${acctMoney(itemNet(it), it.cur ? { currency: it.cur } : acct(it.account))}` : '';
  return `<button type="button" class="entry-cat small ef-multi" data-item-all><span class="entry-bubble" style="background:${esc(catSpecialIcon('多類別', '🗂️').color || '#4f9fc0')}"><span class="emoji">${catIconHTML(catSpecialIcon('多類別', '🗂️'))}</span><i>${list.length}</i></span><span class="entry-cat-name">多類別</span><small class="${tot < 0 ? 'expense-text' : 'income-text'}">${money(Math.abs(tot))}</small></button>` + list.map((it, i) => `<button type="button" class="entry-cat small${i === ci ? ' active' : ''}" data-item="${i}">${bubble(it)}${i === ci && !it.locked ? '' : ''}<span class="entry-cat-name">${esc(names(it))}</span><small class="${itemSign(it) < 0 ? 'expense-text' : 'income-text'}">${amt(it)}</small></button>`).join('');
}
