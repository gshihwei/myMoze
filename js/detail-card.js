// 帳小簿 V26.98 — 記錄明細卡片、專案總覽（週期切換、圖示、統計）、信用卡繳費提醒視窗.
// Bundled after js/invoice.js. Function declarations / var only.

function dcColor(t) {
  if (t.kind === 'transfer') return '#8a6a45'; if (isLoanTx(t)) return (t.direction || t.loanDirection) === 'payable' ? '#a33d5c' : '#4f9c8c'; if (Array.isArray(t.splits) && t.splits.length > 1) return catSpecialIcon('多類別', '').color || '#4f86a8';
  const c = cat(t.category), p = c.parentId ? cat(c.parentId) : c; return c.color || p.color || (t.kind === 'income' ? '#8a7a3f' : ['#b5885a', '#3f70b8', '#8357ab', '#b35d5b', '#6f7a5f', '#a85050', '#4a6688', '#a3709b'][Math.max(0, (state.categories || []).findIndex(x => x.id === p.id)) % 8]);
}
function dcMain(t) {
  if (t.kind === 'transfer') return '轉帳'; if (isLoanTx(t)) return (t.direction || t.loanDirection) === 'payable' ? '應付款項' : '應收款項'; if (t.kind === 'balance_adjustment') return '餘額調整'; if (Array.isArray(t.splits) && t.splits.length > 1) return '多類別';
  const c = cat(t.category), p = c.parentId ? cat(c.parentId) : c; return p.name || '未分類';
}
function dcEvent(t) { if (t.pending) return '提醒入帳'; if (t.installment) return '分期'; if (t.recurringId) return '週期'; if (t.stmtInst) return '帳單分期'; if (t.depositOf) return '尾款'; if (t.balanceTx && depositBalance(t)) return '訂金'; if (t.loanExisting) return (t.direction === 'payable') ? '既有欠款' : '既有應收'; return t.offsetKey ? '帳單折抵' : t.postDate ? '延後入帳' : '單次'; }
function dcLines(t) {
  const l = []; if (t.recurringId) { const r = seriesRule(t); l.push(`週期：#${t.recurringSeq || '—'} / ${r ? (r.end?.type === 'count' ? r.end.value : r.end?.type === 'date' ? `至 ${fmtDate(r.end.value)}` : '無限期') + `（${freqText(normRecurring(r))}）` : '已結束'}`); }
  if (t.installment) l.push(`${t.installment.prepay ? '提前償還本金' : `分期：#${t.installment.n} / ${t.installment.total}`}（${money(t.installment.amount)}）`);
  if (t.pending && !t.autoPost) l.push(t.dateTbd ? '日期未定，完成後才會入帳' : `這筆記錄將會在 ${fmtDate(t.date)} 詢問你是否完成入帳`); if (t.pending && pendingLow(t)) l.push('⚠ 扣款時帳戶餘額不足');
  if (t.created) l.push(`建立時間：${t.created}`); return l;
}
function dcRewards(t) {
  return (t.rewards || []).map(x => { const f = rewardRuleById(x); if (!f) return ''; const r = f.rule, v = rewardOne(r, rewardSpendOf(t), curDigits(acctCur(acct(r.account || t.account)))); return `${esc(r.name)} ${esc(rewardRuleText(r))} ➤ ${esc(rewardText(v, r.account || t.account))}`; }).filter(Boolean);
}
function detailCardHTML(t) {
  const a = acct(t.account), img = attachList(t)[0], c = cat(t.category), e = txEffect(t), multi = Array.isArray(t.splits) && t.splits.length > 1, ico = multi ? catSpecialIcon('多類別', '🗂️') : c, p = c.parentId ? cat(c.parentId) : c, proj = x => (state.projects || []).find(y => String(y.id) === String(x))?.name || '無專案', chip = (i, v) => `<div class="dc-item"><span>${i}</span><b>${v}</b></div>`, fee = [t.fee ? `手續費 ${acctMoney(t.fee, a)}` : '', t.discount ? `折扣 ${acctMoney(t.discount, a)}` : ''].filter(Boolean).join('、');
  const btn = (k, i, l, on) => on ? `<button type="button" data-dc="${k}" aria-label="${l}" title="${l}">${i}</button>` : '';
  return `<div class="dc-hero" style="background:${img ? '#fff' : `linear-gradient(135deg, ${dcColor(t)}, ${dcColor(t)}bb)`}">${img ? `<img src="${img}" alt="附件" class="dc-photo" data-attach-view>` : `<div class="dc-big">${catIconHTML(multi ? ico : p)}</div><div class="dc-main">${esc(dcMain(t))}</div>`}<div class="dc-tools">${btn('inv', '🧾', '發票', invOfTx(t).length)}${btn('refund', '↩', '退款', refundable(t))}${btn('del', '🗑', '刪除', true)}${btn('copy', '⧉', '複製', !isLoanTx(t))}${btn('edit', '✎', '編輯', true)}</div>${t.note ? `<div class="dc-note">${esc(String(t.note).split('\n')[0])}</div>` : ''}<span class="dc-sub" style="background:${dcColor(t)}">${catIconHTML(ico)}</span></div>
  <div class="dc-body"><div class="dc-tags">${(t.tags || []).map(x => `#${esc(x)}`).join('　')}</div><div class="dc-title"><b>${esc(t.name)}</b><strong class="${e < 0 ? 'expense-text' : e > 0 ? 'income-text' : ''}">${e > 0 ? '+' : e < 0 ? '−' : ''}${acctMoney(Math.abs(e || t.amount || 0), a)}</strong>${t.orig ? '<button type="button" class="dc-fx" data-dc-fx aria-label="切換外幣金額">⇌</button>' : ''}</div>${fee && t.kind !== 'transfer' ? `<small class="dc-fee">（內含${fee}）</small>` : ''}
  <div class="dc-grid">${chip('💳', t.loanExisting ? '無帳戶' : acctName(a))}${t.kind === 'transfer' ? chip('➜', acctName(acct(t.toAccount))) : chip('🏷', isLoanTx(t) ? esc(t.person || '未指定對象') : esc(proj(t.project)))}${chip('🏪', esc(t.merchant || (isLoanTx(t) ? dcMain(t) : t.person) || '---'))}${chip('📋', dcEvent(t))}${chip('📅', fmtDate(t.date))}${chip('🕒', esc(t.time || '—'))}</div>
  ${dcLines(t).map(x => `<small class="dc-line">${esc(x)}</small>`).join('')}${dcRewards(t).length ? `<small class="dc-line">紅利回饋：<br>${dcRewards(t).map(x => '◉ ' + x).join('<br>')}</small>` : ''}${t.kind === 'transfer' && (t.project || t.toProject) ? `<small class="dc-line">專案：${esc(proj(t.project))} → ${esc(proj(t.toProject))}</small>` : ''}${t.note && String(t.note).includes('\n') ? `<small class="dc-line dc-pre">${esc(t.note)}</small>` : ''}</div>
  ${multi ? `<div class="dc-kids">${t.splits.map(s => `<div class="notice-row"><div class="notice-ico">${catIconHTML(cat(s.category))}</div><div class="day-main"><b>${esc(cat(s.category).name)}</b><small>${esc(t.merchant || '')}</small></div><div class="day-side"><b class="expense-text">${acctMoney(s.amount, a)}</b></div></div>`).join('')}</div>` : ''}`;
}
// Called first by txDetailExtra(): the card replaces the old boxes.
function detailCard(t) { const g = document.getElementById('detailGrid'); if (!g) return; g.innerHTML = detailCardHTML(t); g.closest('.modal')?.classList.add('dc-modal'); }
// ---- projects ----
function projIconHTML(p) { return p?.image && acctImageValid(p.image) ? `<img class="cat-img" src="${p.image}" alt="">` : esc(p?.icon || '▣'); }
function projSt() { return window.__proj || (window.__proj = { off: 0, id: null }); }
// The period `off` cycles away from today (off 0 = current).
function projPeriodAt(p, off, today) {
  const t = today || isoDate(new Date()), n = Number(off || 0), [y, m, d] = t.split('-').map(Number);
  if (p.cycle === 'month') { const k = Math.min(28, Math.max(1, Number(p.startDay || 0) || 0)); return k ? periodBounds(addMonths(periodKeyOf(t, k), n), k) : periodBounds(addMonths(periodKeyOf(t), n)); }
  if (p.cycle === 'week') { const ws = Number(p.startDay ?? prefs().weekStart ?? 0) % 7, k = (new Date(y, m - 1, d).getDay() - ws + 7) % 7; return { start: isoDate(new Date(y, m - 1, d - k + 7 * n)), end: isoDate(new Date(y, m - 1, d - k + 6 + 7 * n)) }; }
  if (p.cycle === 'year') return { start: `${y + n}-01-01`, end: `${y + n}-12-31` };
  return null;
}
function projDetailExtra(p, s) {
  const st = projSt(), pr = p.cycle ? projPeriodAt(p, st.off) : null, rows = s.txs, by = k => rows.filter(t => t.kind === k), sum = l => Math.round(l.reduce((a, t) => a + anValue(t), 0)), list = [['支出', 'expense', -1, '#ff7188'], ['收入', 'income', 1, '#a9cf89'], ['轉帳', 'transfer', 0, '#b57cf0']].map(([n, k, sg, c]) => ({ n, l: by(k), sg, c })).filter(x => x.l.length), max = Math.max(1, ...list.map(x => sum(x.l)));
  return `${pr ? `<div class="credit-period"><button type="button" data-proj-off="-1" aria-label="上一期">‹</button><strong>${fmtDate(pr.start)} ～ ${fmtDate(pr.end)}</strong><button type="button" data-proj-off="1" aria-label="下一期">›</button></div>` : ''}${list.map(x => `<div class="ap-stat"><span>${x.n}</span><i style="background:${x.c}">${x.l.length}</i><em><u style="width:${Math.max(2, sum(x.l) / max * 100)}%;background:${x.c}"></u></em><b>${x.sg < 0 ? '−' : x.sg > 0 ? '+' : ''}${money(sum(x.l))}</b></div>`).join('')}${list.length ? `<div class="ap-stat"><span>總計</span><i style="background:#2f8fd0">${rows.length}</i><em></em><b>${money(s.income - s.spent)}</b></div>` : ''}`;
}
function projTodayText(p) { const b = (state.budgets || []).map(budgetNorm).find(x => x.scope === 'project' && String(x.project) === String(p.id)), d = b ? budgetDaily(b, isoDate(new Date())) : null; return d ? (d.left < 0 ? `今日預算超支 ${money(-d.left)}` : `今日剩餘預算 ${money(d.left)}`) : ''; }
// ---- daily bill reminder ----
function billRemindList() { const n = Number(prefs().remindDays || 3); return prefs().billRemind === false ? [] : billNotices().filter(b => b.days <= n); }
function billRemindShow(force) {
  const t0 = isoDate(new Date()); if (!force && prefs().billRemindDay === t0) return; const l = billRemindList(); if (!l.length || document.querySelector('.modal-bg.open') || document.getElementById('appLock')) return;
  setPref('billRemindDay', t0); window.__br = { l, i: 0 }; renderBillRemind();
}
function renderBillRemind() {
  const s = window.__br; if (!s?.l.length) return; const b = s.l[s.i], el = sheetEl('brBg'); el.hidden = false; el.style.background = '#0009'; el.style.alignItems = 'center'; el.style.zIndex = 40;
  el.innerHTML = `<div class="br-card"><button type="button" class="icon" data-sheet-close aria-label="關閉">×</button><h3>信用卡繳費提醒</h3><div class="br-ico">${svgForAccount(b.card)}</div><span class="due-pill${b.days < 0 ? ' over' : ''}">${b.card.autoPay ? (b.days < 0 ? '自動扣繳日已過' : `將於 ${Number(b.due.slice(5, 7))}/${Number(b.due.slice(8))} 自動扣繳`) : `${Number(b.due.slice(5, 7))}/${Number(b.due.slice(8))} ${b.days < 0 ? '繳費期限已過' : '繳費截止'}`}</span><b>${esc(b.card.name)}</b><strong class="expense-text">${acctMoney(b.owed, b.card)}</strong><p class="hint">${b.card.autoPay && !b.reconDone ? '在自動扣繳之前需要先完成對帳' : '尚未繳清的金額，銀行可能會依循環利率計算利息'}</p><div class="form-actions"><button type="button" class="secondary" data-br="recon">立即對帳</button><button type="button" class="primary" data-br="pay">立即繳款</button></div><div class="br-dots">${s.l.map((_, i) => `<button type="button" class="${i === s.i ? 'on' : ''}" data-br-i="${i}" aria-label="第 ${i + 1} 筆"></button>`).join('')}</div></div>`;
}
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s); let b;
  if ((b = c('[data-dc]'))) { const k = b.dataset.dc; if (k === 'inv') { document.querySelector('.dc-inv')?.scrollIntoView(); const t = txById(window.detailId), i = invOfTx(t)[0]; if (i) { detailBg.classList.remove('open'); const s = invSt(); s.period = invPeriod(i.date || t.date); s.tab = 'ok'; s.open = i.no; openInvoices(); } return; } if (k === 'refund') { document.querySelector('[data-refund]')?.click(); document.getElementById('refundBox')?.scrollIntoView({ block: 'center' }); return; } document.getElementById({ del: 'detailDelete', copy: 'detailCopy', edit: 'detailEdit' }[k])?.click(); return; }
  if ((b = c('[data-proj-off]'))) { projSt().off += Number(b.dataset.projOff); renderProjectPage(); return; }
  if (c('[data-proj-open]')) projSt().off = 0;
  if ((b = c('[data-br-i]'))) { window.__br.i = Number(b.dataset.brI); renderBillRemind(); return; }
  if ((b = c('[data-br]'))) { const x = window.__br.l[window.__br.i]; document.getElementById('brBg').hidden = true; gotoBill(x.card.id, x.offset); if (b.dataset.br === 'recon') openReconMode(x.card.id); else setTimeout(() => document.querySelector('[data-inline-payment]')?.click(), 80); }
});
setTimeout(() => { try { if (state) billRemindShow(); } catch { } }, 5000);
