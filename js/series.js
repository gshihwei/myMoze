// 帳小簿 V26.79 — 週期與分期進階：起始期數、每週多天、週期轉帳、修改／終止未來、提前繳清.
// Bundled after js/loan-plus.js. Function declarations / var only.

// Next date of a weekly rule that runs on several weekdays (r.days = [0..6], 0 = Sunday).
function nextWeekdays(date, r) {
  const days = r.days.map(Number), n = r.interval || 1, [y, m, d] = date.split('-').map(Number), wd = new Date(y, m - 1, d).getDay();
  for (let k = 1; wd + k < 7; k++) if (days.includes(wd + k)) return isoDate(new Date(y, m - 1, d + k));
  const first = Math.min(...days); return isoDate(new Date(y, m - 1, d - wd + 7 * n + first));
}
function recurringOptsHTML(r) {
  const accs = state.accounts.map(a => `<option value="${esc(a.id)}"${String(a.id) === String(r.toAccount) ? ' selected' : ''}>${acctName(a)}</option>`).join('');
  return `<div class="form-grid"><label class="rc-to"${r.kind === 'transfer' ? '' : ' hidden'}>轉入帳戶<select name="rto">${accs}</select></label>${r.id ? '' : '<label>起始期數（已扣過幾期就填下一期）<input name="rstartno" type="number" min="1" step="1" value="1"></label>'}</div><div class="rc-days"${r.freq === 'week' ? '' : ' hidden'}><span class="hint">每週哪幾天（不選＝依開始日期）</span>${'日一二三四五六'.split('').map((l, i) => `<label><input type="checkbox" name="rdays" value="${i}"${(r.days || []).map(Number).includes(i) ? ' checked' : ''}>${l}</label>`).join('')}</div>`;
}
// Adds the extra fields to a rule just built by submitEntity. Returns an error text or ''.
function recurringFromForm(r, f, isNew) {
  if (f.get('rkind') === 'transfer') { r.kind = 'transfer'; r.toAccount = f.get('rto') || ''; if (!r.toAccount || String(r.toAccount) === String(r.account)) return '轉出與轉入帳戶不能相同'; if (transferNeedsFx(r.account, r.toAccount)) return '週期轉帳只支援相同幣別的帳戶'; } else delete r.toAccount;
  const days = r.freq === 'week' ? f.getAll('rdays').map(Number) : [];
  if (days.length) { r.days = days; const wd = new Date(r.start + 'T00:00:00').getDay(); if (!days.includes(wd) && r.next === r.start) r.next = nextWeekdays(r.start, { ...r, interval: 1 }); } else delete r.days;
  const no = isNew ? Math.max(1, Math.floor(Number(f.get('rstartno') || 1))) : 1;
  if (no > 1) { if (r.days) return '一週多天的週期不支援起始期數'; r.startNo = no; r.seq = no - 1; if (r.end.type === 'count') r.end.value = Number(r.end.value) + no - 1; }
  return '';
}
function seriesRule(t) { return t?.recurringId ? (state.recurring || []).find(r => String(r.id) === String(t.recurringId)) : null; }
function recurringApplyFrom(t) { const r = seriesRule(t); if (!r) return false; for (const k of ['name', 'amount', 'category', 'account', 'merchant']) r[k] = t[k] ?? r[k]; if (t.kind === 'transfer') r.toAccount = t.toAccount; return true; }
function recurringStop(t) { const r = seriesRule(t); if (!r) return 0; r.ended = true; const l = state.transactions.filter(x => String(x.recurringId) === String(r.id) && x.date > t.date); for (const x of l) adjust(x, -1); const ids = new Set(l.map(x => x.id)); state.transactions = state.transactions.filter(x => !ids.has(x.id)); return l.length; }
function instFuture(t) { return installmentGroup(t).filter(x => x.installment.n > t.installment.n).sort((a, b) => a.installment.n - b.installment.n); }
function instStop(t) { const l = instFuture(t), ids = new Set(l.map(x => x.id)); for (const x of l) adjust(x, -1); state.transactions = state.transactions.filter(x => !ids.has(x.id)); return l; }
// 提前繳清: all later periods become one payment on `date`.
function instPayoff(t, date) {
  const l = instStop(t); if (!l.length) return null; const sum = Math.round(l.reduce((s, x) => s + Number(x.amount), 0) * 100) / 100;
  const x = { ...l[0], id: id(), date, amount: sum, name: l[0].name.replace(/（\d+\/\d+）$/, '') + '（提前繳清）', installment: { ...l[0].installment } }; delete x.postDate; delete x.recon;
  state.transactions.push(x); adjust(x, 1); return x;
}
function instApply(t) { const l = instFuture(t), base = t.name.replace(/（\d+\/\d+）$/, ''); for (const x of l) { const same = String(x.account) === String(t.account); if (!same) adjust(x, -1); Object.assign(x, { category: t.category, project: t.project, merchant: t.merchant, account: t.account, name: `${base}（${x.installment.n}/${x.installment.total}）` }); if (!same) adjust(x, 1); } return l.length; }
function seriesButtons(t) {
  if (t.installment && instFuture(t).length) return '<button type="button" class="secondary" data-series="instApply">套用到未來分期</button><button type="button" class="secondary" data-series="payoff">提前繳清</button><button type="button" class="secondary" data-series="instStop">終止未來分期</button>';
  const r = seriesRule(t); return r && !recurringEnded(normRecurring(r)) ? '<button type="button" class="secondary" data-series="recApply">套用到未來週期</button><button type="button" class="secondary" data-series="recStop">終止未來週期</button>' : '';
}
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-series]'); if (!b) return; const t = txById(window.detailId), a = b.dataset.series; if (!t) return;
  if (a === 'instApply') { if (!confirm('把這一期的名稱、類別、專案、商家、帳戶套用到之後所有期？（金額不變）')) return; instApply(t); }
  if (a === 'payoff') { const l = instFuture(t); if (!confirm(`把剩餘 ${l.length} 期共 ${money(l.reduce((s, x) => s + Number(x.amount), 0))} 併成今天一筆？`)) return; instPayoff(t, isoDate(new Date())); }
  if (a === 'instStop') { if (!confirm(`刪除之後的 ${instFuture(t).length} 期？`)) return; instStop(t); }
  if (a === 'recApply') { if (!confirm('把這筆的名稱、金額、類別、帳戶、商家套用到之後的週期？')) return; recurringApplyFrom(t); }
  if (a === 'recStop') { if (!confirm('終止這個週期？這一期之後的記錄會一併刪除。')) return; recurringStop(t); }
  await save(); render(); if (txById(t.id)) openDetail(t.id);
});
document.addEventListener('change', e => { const t = e.target; if (!t?.closest?.('#entityForm')) return; if (t.name === 'freq') { const d = document.querySelector('.rc-days'); if (d) d.hidden = t.value !== 'week'; } if (t.name === 'rkind') { const d = document.querySelector('.rc-to'); if (d) d.hidden = t.value !== 'transfer'; } });
