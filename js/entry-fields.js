// 帳小簿 V26.89 — 記帳欄位 (依 MOZE「記帳欄位介紹」)：收合類別、帳戶／專案選單、進階設定（單次／週期／分期）、標籤 chips、底部提示列.
// Bundled after js/inst-plus.js. Function declarations / var only. The real form controls stay where submitTx reads them;
// everything here only mirrors them.

function efEl(n) { return txForm?.elements?.[n]; }
function efTab() { return document.getElementById('modalBg')?.dataset.etab || 'expense'; }
function efLoanTab() { const t = efTab(); return t === 'receivable' || t === 'payable'; }
// ---- labels ----
function efDateText(d, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return '日期';
  const t0 = today || isoDate(new Date()), n = Math.round((new Date(d + 'T00:00:00') - new Date(t0 + 'T00:00:00')) / 864e5), wk = '週' + '日一二三四五六'[new Date(d + 'T00:00:00').getDay()];
  const w = { 0: '今天', '-1': '昨天', 1: '明天', '-2': '前天', 2: '後天' }[n]; return w ? `${w} (${wk})` : `${d.replace(/-/g, '/')} (${wk})`;
}
function efEventText() {
  const ev = efEl('evType')?.value || 'single', mode = efEl('postMode')?.value;
  if (ev === 'recurring') return '週期'; if (ev === 'inst') return '分期';
  if (efEl('depOn')?.checked) return '訂金'; const t = editId ? txById(editId) : null; if (t?.depositOf) return '尾款'; if (t?.installment) return `分期 ${t.installment.n}/${t.installment.total}`; if (t?.recurringId) return '週期';
  if (efLoanTab() && efEl('loanExisting')?.checked) return efTab() === 'payable' ? '既有欠款' : '既有應收';
  return mode === 'remind' ? '提醒入帳' : mode === 'postpone' ? '延後入帳' : '單次';
}
// 起始期數 + 剩餘次數 → r.end value (total periods)
function efRecEnd(type, value, startNo) {
  if (type === 'count') { const n = Math.floor(Number(value)); return n >= 1 ? { type: 'count', value: n + Math.max(1, startNo) - 1 } : null; }
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? { type: 'date', value } : null;
  return { type: 'never' };
}
// Builds a recurring rule from a transaction that is about to be saved. o = { freq, interval, days, startNo, endType, endValue, auto, adjust }
function recurringFromTx(t, o) {
  if (t.kind === 'transfer' && transferNeedsFx(t.account, t.toAccount)) return { error: '週期轉帳只支援相同幣別的帳戶' };
  if (t.splits?.length) return { error: '週期記錄不能拆帳' };
  const freq = ['day', 'week', 'month', 'year'].includes(o.freq) ? o.freq : 'month', days = freq === 'week' ? (o.days || []).map(Number) : [], startNo = days.length ? 1 : Math.max(1, Math.floor(Number(o.startNo) || 1));
  const end = efRecEnd(o.endType, o.endValue, startNo); if (!end) return { error: o.endType === 'date' ? '請選擇結束日期' : '請輸入次數（至少 1）' };
  const r = { id: id(), seq: startNo - 1, posted: 0, auto: !!o.auto, name: t.name, amount: Math.abs(Number(t.amount || 0)), kind: t.kind, category: t.category || '', account: t.account, merchant: t.merchant || '', freq, interval: Math.max(1, Math.floor(Number(o.interval) || 1)), start: t.date, next: t.date, end };
  if (startNo > 1) r.startNo = startNo; if (days.length) { r.days = days; const wd = new Date(t.date + 'T00:00:00').getDay(); if (!days.includes(wd)) r.next = nextWeekdays(t.date, { ...r, interval: 1 }); }
  if (t.kind === 'transfer') r.toAccount = t.toAccount;
  if (o.adjust === 'next' || o.adjust === 'prev') r.adjust = o.adjust;
  const ex = {}; for (const k of ['project', 'toProject', 'note', 'person', 'time', 'tags', 'rewards', 'fee', 'discount', 'feeIncluded', 'feeName', 'discountName', 'balanceEffect', 'toBalanceEffect', 'toFee', 'toDiscount']) if (t[k] !== undefined && t[k] !== '' && !(Array.isArray(t[k]) && !t[k].length)) ex[k] = t[k];
  if (Object.keys(ex).length) r.extra = ex;
  return { rule: r };
}
// The day a period is really posted (遇非工作日入帳).
function recurringPostDate(r, date) { return r.adjust ? isoDate(cardAdjustDate({ useHoliday: true }, new Date(date + 'T00:00:00'), r.adjust)) : date; }
function efRecOptions(f) { return { freq: f.get('rcFreq'), interval: f.get('rcInterval'), days: f.getAll ? f.getAll('rcDays') : [], startNo: f.get('rcStartNo'), endType: f.get('rcEndType'), endValue: f.get('rcEndType') === 'date' ? f.get('rcEndDate') : f.get('rcEndCount'), auto: f.get('rcPost') !== 'remind', adjust: f.get('rcAdjust') }; }
function efBarText() {
  const el = txForm?.elements; if (!el) return ''; const ev = el.evType?.value, n = Number(el.amount?.value || 0);
  if (ev === 'recurring') { const no = Math.max(1, Number(el.rcStartNo.value) || 1), k = el.rcEndType.value, tot = k === 'count' ? (Number(el.rcEndCount.value) || 0) + no - 1 : k === 'date' ? `至 ${el.rcEndDate.value || '—'}` : '無限期'; return `週期：#${no} / ${tot}（${freqText(normRecurring({ freq: el.rcFreq.value, interval: el.rcInterval.value, start: el.date.value, days: [...txForm.querySelectorAll('[name=rcDays]:checked')].map(x => Number(x.value)), end: { type: 'never' } }))}）`; }
  if (ev === 'inst') { const c = Number(el.instCount.value) || 0, s = Math.max(1, Number(el.instStart.value) || 1); return `分期：#${s} / ${c + s - 1}（${money(n)}）`; }
  const dep = document.getElementById('depositSum')?.textContent; if (el.depOn?.checked && dep) return dep;
  const t = editId ? txById(editId) : null; if (t?.depositOf) { const d = txById(t.depositOf); if (d) return `含訂金 ${money(d.amount)}，交易總計 ${money(Number(d.amount) + n)}`; }
  const rw = [...document.querySelectorAll('#rewardPick input:checked')].map(i => i.closest('label')?.querySelector('em')?.textContent.replace('約 ', '')).filter(Boolean);
  return rw.length ? `預計可獲得回饋：${rw.join(' / ')}` : '';
}
// ---- mirror everything ----
function efSync() {
  const el = txForm?.elements; if (!el?.evType) return;
  const set = (i, v, on) => { const x = document.getElementById(i); if (x) { x.textContent = v; x.classList.toggle('filled', !!on); } };
  const a = (state.accounts || []).find(x => String(x.id) === String(el.account?.value)), noAcc = efLoanTab() && el.loanExisting?.checked;
  set('efAccount', noAcc ? '無帳戶' : a ? a.name + (acctCur(a) !== 'TWD' ? `（${acctCur(a)}）` : '') : '帳戶', a && !noAcc);
  const p = (state.projects || []).find(x => String(x.id) === String(el.project?.value)); set('efProject', p ? p.name : '無專案', p);
  set('efDate', efDateText(el.date?.value), true); set('efTime', el.time?.value || '時間', el.time?.value);
  set('efAdv', efEventText(), true); set('efBar', efBarText()); const bar = document.getElementById('efBar'); if (bar) bar.hidden = !bar.textContent;
  const pl = document.querySelector('.loan-field'); if (pl) pl.style.display = !efLoanTab() && efTab() !== 'transfer' && el.person?.value ? 'flex' : '';
  efTagsRender(); efStrip();
}
function efStrip() {
  const box = document.getElementById('entryItems'), bg = document.getElementById('modalBg'); if (!box || !bg) return;
  const src = document.querySelector('#entryPresets .entry-cat.active .entry-bubble') && !['suggest', 'expense', 'income'].includes(efTab()) ? document.querySelector('#entryPresets .entry-cat.active') : null;
  const c = (state.categories || []).find(x => String(x.id) === String(efEl('category')?.value)); let name, bub;
  if (src) { name = src.querySelector('.entry-cat-name')?.textContent || ''; bub = src.querySelector('.entry-bubble').outerHTML; }
  else if (efLoanTab()) { name = efTab() === 'payable' ? '應付款項' : '應收款項'; bub = '<span class="entry-bubble" style="background:#4b8f84"><span class="emoji">🤝</span></span>'; }
  else { name = c?.name || '類別'; const on = document.querySelector('#categoryChoices .entry-cat.active .entry-bubble,#categorySubs .entry-cat.active .entry-bubble'), par = c?.parentId ? state.categories.find(x => String(x.id) === String(c.parentId)) : null; bub = [...document.querySelectorAll('#categorySubs .entry-cat.active .entry-bubble')][0]?.outerHTML || on?.outerHTML || `<span class="entry-bubble" style="background:${esc(c?.color || par?.color || '#3f86e6')}"><span class="emoji">${esc(c?.icon || '🏷️')}</span></span>`; }
  const n = Number(efEl('amount')?.value || 0);
  box.innerHTML = `<button type="button" class="entry-cat small active" data-ef-change>${bub}<span class="entry-cat-name">${esc(name)}</span><small class="${efTab() === 'income' ? 'income-text' : 'expense-text'}">${n ? money(n) : ''}</small></button><button type="button" class="ghost ef-change" data-ef-change>‹ 更換類別／類型</button>`;
}
function efPicked(on) { document.getElementById('modalBg')?.classList.toggle('picked', !!on); }
function efOpen(t) {
  const el = txForm?.elements; if (!el?.evType) return;
  el.evType.value = 'single'; efAdvTab('single'); const sh = document.getElementById('advSheet'); if (sh) sh.hidden = true;
  efPicked(!!t); setTimeout(efSync, 30); setTimeout(efSync, 250);
}
// ---- 進階設定 ----
function efAdvTabs() { const k = document.querySelector('input[name=kind]:checked')?.value, t = editId ? txById(editId) : null; if (efLoanTab()) return ['single']; if (editId) return instEditable(t) ? ['single', 'inst'] : ['single']; return k === 'expense' ? ['single', 'recurring', 'inst'] : ['single', 'recurring']; }
function efAdvTab(k) {
  const el = txForm?.elements; if (!el?.evType) return; if (!efAdvTabs().includes(k)) k = 'single';
  if (k !== 'single' && el.depOn?.checked) { alert('訂金尾款追蹤開著時不能改成週期或分期'); k = 'single'; }
  el.evType.value = k; if (el.instOn && el.instOn.checked !== (k === 'inst')) { el.instOn.checked = k === 'inst'; el.instOn.dispatchEvent(new Event('change', { bubbles: true })); }
  document.querySelectorAll('[data-adv-tab]').forEach(b => { b.classList.toggle('active', b.dataset.advTab === k); b.hidden = !efAdvTabs().includes(b.dataset.advTab); });
  document.querySelectorAll('[data-adv-pane]').forEach(x => { x.hidden = x.dataset.advPane !== k; });
  efRecUI();
}
function efRecUI() {
  const el = txForm?.elements; if (!el?.rcFreq) return; const show = (i, on) => { const x = document.getElementById(i); if (x) x.hidden = !on; };
  const days = txForm.querySelectorAll('[name=rcDays]:checked').length > 0 && el.rcFreq.value === 'week', no = Number(el.rcStartNo.value) > 1;
  show('rcDaysBox', el.rcFreq.value === 'week'); show('rcStartRow', !days); show('rcCountRow', el.rcEndType.value === 'count'); show('rcDateRow', el.rcEndType.value === 'date');
  const l = document.getElementById('rcCountLabel'); if (l) l.textContent = no ? '剩餘次數' : '次數'; const d = document.getElementById('rcDayText'); if (d) d.textContent = el.rcFreq.value === 'month' ? `每月 ${Number(String(el.date.value).slice(8))} 號（依日期欄位）` : el.rcFreq.value === 'year' ? `每年 ${String(el.date.value).slice(5).replace('-', '/')}` : el.rcFreq.value === 'day' ? '依間隔' : days ? '勾選的星期' : '依日期的星期';
}
// ---- pickers ----
function efPickHTML(kind) {
  const el = txForm.elements, row = (idv, ico, name, side, cls, on) => `<button type="button" class="ef-row${on ? ' on' : ''}" data-ef-pick="${esc(idv)}"><span class="entry-acct-ico">${ico}</span><span class="ef-name">${esc(name)}</span><b class="${cls || ''}">${side}</b></button>`;
  if (kind === 'account') {
    const ok = new Set([...el.account.options].map(o => o.value)), g = new Map();
    for (const a of acctOrdered(state.accounts || [])) if (ok.has(String(a.id)) && modeAllows('accounts', a.id) && !(efTab() === 'payable' && a.type === 'card')) { const k = a.group || acctTypeLabel(a); if (!g.has(k)) g.set(k, []); g.get(k).push(a); }
    return [...g].map(([k, l]) => `<h4>— ${esc(k)}</h4>${l.map(a => row(a.id, svgForAccount(a), a.name, acctMoney(a.balance, a), a.balance < 0 ? 'expense-text' : 'income-text', String(el.account.value) === String(a.id))).join('')}`).join('');
  }
  const t0 = isoDate(new Date()), list = (state.projects || []).filter(p => !p.archived && !p.rules && modeAllows('projects', p.id)), later = p => !p.cycle && p.start && p.start > t0, side = p => { if (!p.budget) return ['無預算', 'hint']; const s = projStats(p).spent, v = p.budget - s; return [money(v), v < 0 ? 'expense-text' : 'income-text']; };
  const sec = (h, l) => l.length ? `<h4>— ${h}</h4>${l.map(p => { const [v, c] = side(p); return row(p.id, '▣', p.name, v, c, String(el.project.value) === String(p.id)); }).join('')}` : '';
  return `<h4>— 進行中</h4>${row('', '⊖', '無專案', '', '', !el.project.value)}${list.filter(p => !later(p) && !projEnded(p)).map(p => { const [v, c] = side(p); return row(p.id, '▣', p.name, v, c, String(el.project.value) === String(p.id)); }).join('')}${sec('未開始', list.filter(later))}${sec('已結束', list.filter(p => !later(p) && projEnded(p)))}`;
}
function efPick(kind) { const el = sheetEl('efPickBg'); el.style.zIndex = 400; el.dataset.kind = kind; el.hidden = false; el.innerHTML = `<div class="recon-sheet">${sheetHead(kind === 'account' ? '帳戶' : '專案')}<div class="recon-list ef-list">${efPickHTML(kind)}</div></div>`; }
// ---- tags ----
function efTagList() { return parseTags(efEl('tags')?.value || ''); }
function efTagSet(l) { const e = efEl('tags'); if (e) { e.value = l.join(' '); e.dispatchEvent(new Event('change', { bubbles: true })); } efTagsRender(); }
function efTagAdd(v) { const add = parseTags(v); if (add.length) efTagSet([...new Set([...efTagList(), ...add])]); }
function efTagSuggest(q) {
  const m = new Map(); for (let i = (state.transactions || []).length - 1, k = 0; i >= 0 && k < 3000; i--, k++) for (const t of (state.transactions[i].tags || [])) m.set(t, (m.get(t) || 0) + 1);
  const cur = new Set(efTagList()), s = String(q || '').replace(/^#/, '').toLowerCase(); return [...m].filter(([t]) => !cur.has(t) && (!s || t.toLowerCase().includes(s))).sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0]);
}
function efTagsRender() {
  const box = document.getElementById('efTags'); if (!box) return; const l = efTagList(), inp = document.getElementById('efTagInput');
  box.querySelectorAll('.ef-tag').forEach(x => x.remove()); box.insertAdjacentHTML('afterbegin', l.map(t => `<span class="ef-tag">#${esc(t)}<button type="button" data-ef-untag="${esc(t)}" aria-label="移除標籤">×</button></span>`).join(''));
  const sg = document.getElementById('efTagSug'); if (sg) sg.innerHTML = document.activeElement === inp || inp?.value ? efTagSuggest(inp?.value).map(t => `<button type="button" class="ef-tag sug" data-ef-tag="${esc(t)}">#${esc(t)}</button>`).join('') : '';
}
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s); let b;
  if (c('[data-ef-change]')) { efPicked(false); document.querySelector('.entry-scroll')?.scrollTo?.(0, 0); return; }
  if ((b = c('#categoryChoices [data-cat],#categorySubs [data-cat],#entryPresets [data-preset]'))) {
    const x = b.dataset.cat ? state.categories.find(k => String(k.id) === b.dataset.cat) : null, subs = x && !x.parentId && state.categories.some(k => String(k.parentId) === String(x.id) && catVisible(k));
    setTimeout(() => { if (!subs) efPicked(true); efSync(); }, 40); return;
  }
  if (c('#entryTabs [data-etab-btn]') || c('#entryBack')) { setTimeout(() => { if (efEl('evType')?.value !== 'single') efAdvTab(efEl('evType').value); efSync(); }, 40); return; }
  if (c('#efAccount')) { if (!(efLoanTab() && efEl('loanExisting')?.checked)) efPick('account'); return; }
  if (c('#efProject')) { efPick('project'); return; }
  if ((b = c('[data-ef-pick]'))) { const bg = document.getElementById('efPickBg'), s = efEl(bg.dataset.kind); if (s) { s.value = b.dataset.efPick; s.dataset.userSet = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); } bg.hidden = true; efSync(); return; }
  if (window.innerWidth < 900 && c('#efAdv,#efAccount,#efProject')) document.getElementById('entrySide')?.classList.remove('open');
  if (c('#efAdv')) { efAdvTab(efEl('evType').value); window.__advKeep = new FormData(txForm); document.getElementById('advSheet').hidden = false; return; }
  if ((b = c('[data-adv-tab]'))) { efAdvTab(b.dataset.advTab); efSync(); return; }
  if (c('[data-adv-ok]') || e.target.id === 'advSheet') { document.getElementById('advSheet').hidden = true; updateInstallmentUI(); efSync(); return; }
  if (c('[data-adv-cancel]')) { const k = window.__advKeep; if (k) { for (const n of ['postMode', 'postOn', 'depAmount', 'depDate', 'instCount', 'instStart', 'instRem', 'instRate', 'instMethod', 'instGrace', 'instDaily', 'rcFreq', 'rcInterval', 'rcStartNo', 'rcEndType', 'rcEndCount', 'rcEndDate', 'rcPost', 'rcAdjust', 'person']) if (k.has(n) && efEl(n)) efEl(n).value = k.get(n); efEl('depOn').checked = k.has('depOn'); if (efEl('loanExisting')) efEl('loanExisting').checked = k.has('loanExisting'); efAdvTab(k.get('evType') || 'single'); } txPostSyncUI(); document.getElementById('advSheet').hidden = true; efSync(); return; }
  if ((b = c('[data-ef-untag]'))) { efTagSet(efTagList().filter(t => t !== b.dataset.efUntag)); return; }
  if ((b = c('[data-ef-tag]'))) { efTagAdd(b.dataset.efTag); const i = document.getElementById('efTagInput'); if (i) { i.value = ''; i.focus(); } efTagsRender(); return; }
  if (c('#efTags')) { document.getElementById('efTagInput')?.focus(); return; }
  if (c('#efFeeBtn')) { document.getElementById('entrySide')?.classList.add('open'); document.getElementById('entryFee')?.focus(); e.stopPropagation(); return; }
  if ((b = c('.ef-pick-native'))) { const i = b.querySelector('input'); try { i.showPicker?.(); } catch { } }
});
document.addEventListener('keydown', e => {
  const i = e.target; if (i?.id !== 'efTagInput') return;
  if (['Enter', ' ', ',', '，', '、'].includes(e.key) && !e.isComposing) { e.preventDefault(); efTagAdd(i.value); i.value = ''; efTagsRender(); }
  else if (e.key === 'Backspace' && !i.value) efTagSet(efTagList().slice(0, -1));
});
document.addEventListener('input', e => { const t = e.target; if (t?.id === 'efTagInput') { efTagsRender(); return; } if (t?.closest?.('#txForm')) { if (['rcFreq', 'rcInterval', 'rcStartNo', 'rcEndType', 'rcDays'].includes(t.name)) efRecUI(); setTimeout(efSync, 0); } });
document.addEventListener('change', e => { const t = e.target; if (t?.id === 'efTagInput') return; if (t?.closest?.('#txForm')) { if (['rcFreq', 'rcEndType', 'rcDays', 'rcStartNo', 'date'].includes(t.name)) efRecUI(); setTimeout(efSync, 0); } });
// Phones: the keypad makes room as soon as another field is used; tapping the amount brings it back.
document.addEventListener('focusin', e => { const t = e.target; if (window.innerWidth < 900 && t?.closest?.('#txForm .entry-scroll') && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.id !== 'tfRate') document.getElementById('entrySide')?.classList.remove('open'); });
document.addEventListener('focusin', e => { if (e.target?.id === 'efTagInput') efTagsRender(); });
document.addEventListener('focusout', e => { const i = e.target; if (i?.id === 'efTagInput') setTimeout(() => { if (document.activeElement !== i) { if (i.value.trim()) { efTagAdd(i.value); i.value = ''; } efTagsRender(); } }, 150); });
