// 帳小簿 V26.75 — 紅利回饋.
// Bundled after js/card-inst.js. Function declarations / var only.
// Rules live on the account (`rewards`), a transaction lists the rule ids it earns (`rewards`), and a paid-out reward is an
// income (分類 紅利回饋) with `rewardOf` = { rule, start, tx }.
// rule: { id, name, mode: pct|ratio|fixed, value, per, period: stmt|month|range, from, to, basis: date|post, timing: now|post|end|manual,
//   days, payMonth: 0|1, payDay, minTotal, minSingle, minCount, roundEach, roundTotal, cap, capGroup, base, account, project, start, end }

function rewardRules(a) { return Array.isArray(a?.rewards) ? a.rewards : []; }
function rewardRuleById(rid) { for (const a of (state.accounts || [])) { const r = rewardRules(a).find(x => x.id === rid); if (r) return { rule: r, acct: a }; } return null; }
function rewardActive(r, date) { return (!r.start || date >= r.start) && (!r.end || date <= r.end); }
function rewardRound(v, how, digits) {
  const p = 10 ** (digits || 0), e = 1e-9, f = { round: x => Math.round(x + e), floor: x => Math.floor(x + e), ceil: x => Math.ceil(x - e) };
  if (how === 'round' || how === 'floor' || how === 'ceil') return f[how](v * p) / p;
  if (how === 'roundInt' || how === 'floorInt' || how === 'ceilInt') return f[how.slice(0, -3)](v);
  return Math.round(v * 1e6) / 1e6;
}
function rewardTxDate(r, t) { return r.basis === 'post' || r.period === 'stmt' ? (t.postDate || t.date) : t.date; }
function rewardPeriod(r, a, date) {
  if (r.period === 'range') return { start: r.from || '0000-01-01', end: r.to || '9999-12-31' };
  if (r.period === 'stmt' && a.type === 'card') {
    const [y, m] = date.split('-').map(Number);
    for (const k of [0, 1]) { const p = stmtRange(a, y, m - 1 + k); if (date >= p.start && date <= p.end) return p; }
  }
  const [y, m] = date.split('-').map(Number); return { start: date.slice(0, 8) + '01', end: isoDate(new Date(y, m, 0)) };
}
function rewardSpendOf(t) { return Math.max(0, Math.abs(Number(t.amount || 0)) - (t.feeIncluded ? Number(t.fee || 0) : 0) - refundedAmount(t)); }
function rewardUnit(r, spend) {
  if (r.mode === 'ratio') return Number(r.per) > 0 ? spend / Number(r.per) * Number(r.value || 0) : 0;
  if (r.mode === 'fixed') return spend >= Number(r.minSingle || 0) ? Number(r.value || 0) : 0;
  return spend * Number(r.value || 0) / 100;
}
// One record's reward: rounded, then limited by 單筆上限.
function rewardOne(r, spend, digits) { const v = rewardRound(rewardUnit(r, spend), r.roundEach, digits); return Number(r.capEach) > 0 ? Math.min(v, Number(r.capEach)) : v; }
// Everything about one rule in one period.
function rewardStats(r, a, period) {
  const digits = curDigits(acctCur(acct(r.account || a.id))), items = [];
  for (const t of (state.transactions || [])) {
    if (String(t.account) !== String(a.id) || t.kind !== 'expense' || isUnappliedPending(t) || !(t.rewards || []).includes(r.id)) continue;
    const d = rewardTxDate(r, t); if (d < period.start || d > period.end) continue;
    const spend = rewardSpendOf(t), ok = spend > 0 && spend >= Number(r.minSingle || 0);
    items.push({ t, spend, ok, reward: ok ? rewardOne(r, spend, digits) : 0 });
  }
  items.sort((x, y) => (x.t.date + (x.t.time || '')).localeCompare(y.t.date + (y.t.time || '')));
  const good = items.filter(x => x.ok), spend = Math.round(good.reduce((s, x) => s + x.spend, 0) * 100) / 100, count = good.length;
  const minLeft = Math.max(0, Number(r.minTotal || 0) - spend), countLeft = Math.max(0, Number(r.minCount || 0) - count), met = !minLeft && !countLeft;
  let raw = rewardRound(good.reduce((s, x) => s + x.reward, 0), r.roundTotal, digits), cap = Number(r.cap || 0) > 0 ? Number(r.cap) : Infinity;
  if (cap < Infinity && r.capGroup) for (const o of rewardRules(a)) { if (o === r) break; if (o.capGroup === r.capGroup) cap = Math.max(0, cap - rewardStats(o, a, period).total); }
  const total = met ? Math.min(raw, cap) : 0, per = rewardUnit(r, 1);
  const capLeft = cap === Infinity ? null : Math.max(0, Math.round((cap - raw) * 1e6) / 1e6);
  const spendLeft = capLeft === null || r.mode === 'fixed' || !(per > 0) ? null : Math.ceil(capLeft / per - 1e-9);
  const got = rewardPaid(r.id, period.start);
  return { items, spend, count, raw, total: Math.round(total * 1e6) / 1e6, met, minLeft, countLeft, cap: cap === Infinity ? null : cap, capLeft, spendLeft, got, left: Math.max(0, Math.round((total - got) * 1e6) / 1e6) };
}
function rewardPaid(rid, start) { return Math.round((state.transactions || []).filter(t => t.rewardOf?.rule === rid && t.rewardOf.start === start).reduce((s, t) => s + Number(t.amount || 0), 0) * 1e6) / 1e6; }
function rewardPost(r, a, period, amount, o) {
  const target = (state.accounts || []).find(x => String(x.id) === String(r.account)) || a, c = entryEnsureCategory(state, '紅利回饋', 'income');
  const t = { id: o.id || id(), date: o.date, time: '', kind: 'income', amount, account: target.id, category: c.id, project: r.project || o.project || '', name: `${r.name} 回饋`, merchant: '', person: '', note: '', tags: [], rewardOf: { rule: r.id, start: period.start, ...(o.tx ? { tx: o.tx } : {}) } };
  state.transactions.push(t); adjust(t, 1); return t;
}
function addDaysIso(date, n) { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }
function rewardPayDate(r, period) {
  if (!(Number(r.payDay) > 0)) return addDaysIso(period.end, 1);
  const [y, m] = period.end.split('-').map(Number), k = Number(r.payMonth || 0), dim = new Date(y, m - 1 + k + 1, 0).getDate();
  const d = isoDate(new Date(y, m - 1 + k, Math.min(Number(r.payDay), dim))); return d > period.end ? d : addDaysIso(period.end, 1);
}
// Posts every automatic reward whose day has come (deterministic ids → safe on two devices).
function rewardRun(today) {
  const t0 = today || isoDate(new Date()); let n = 0;
  for (const a of (state?.accounts || [])) for (const r of rewardRules(a)) {
    if (r.timing === 'manual') continue;
    const periods = new Map();
    for (const t of (state.transactions || [])) if (t.kind === 'expense' && String(t.account) === String(a.id) && (t.rewards || []).includes(r.id)) { const p = rewardPeriod(r, a, rewardTxDate(r, t)); periods.set(p.start, p); }
    for (const p of periods.values()) {
      if (r.timing === 'end') {
        const date = rewardPayDate(r, p), tid = `rw-${r.id}-${p.start}`; if (date > t0 || p.end >= t0 || state.transactions.some(t => t.id === tid)) continue;
        const st = rewardStats(r, a, p); if (st.left > 0) { rewardPost(r, a, p, st.left, { id: tid, date }); n++; }
      } else {
        const st = rewardStats(r, a, p); if (!st.met) continue; let room = st.cap === null ? Infinity : Math.max(0, st.cap - st.got);
        for (const x of st.items) {
          const tid = `rw-${r.id}-${x.t.id}`, date = addDaysIso(r.timing === 'post' ? (x.t.postDate || x.t.date) : x.t.date, Math.max(0, Number(r.days || 0)));
          if (!x.ok || date > t0 || state.transactions.some(t => t.id === tid)) continue;
          const v = Math.round(Math.min(room, x.reward) * 1e6) / 1e6; if (!(v > 0)) continue;
          room -= v; rewardPost(r, a, p, v, { id: tid, date, project: x.t.project, tx: x.t.id }); n++;
        }
      }
    }
  }
  return n;
}
// Rules to preselect for a new record: base rules, plus the ones used last time with this category (pref rewardSuggest).
function rewardDefaults(a, cid, date) {
  const av = rewardRules(a).filter(r => rewardActive(r, date)), out = new Set(av.filter(r => r.base).map(r => r.id));
  if (prefs().rewardSuggest !== false) for (let i = (state.transactions || []).length - 1; i >= 0; i--) { const t = state.transactions[i]; if (t.kind === 'expense' && String(t.category) === String(cid) && String(t.account) === String(a.id)) { for (const x of (t.rewards || [])) if (av.some(r => r.id === x)) out.add(x); break; } }
  return [...out];
}
function rewardText(v, accId) { const a = acct(accId), c = acctCur(a); return customCur(c) ? curText(v, c) : c === 'TWD' ? `$${Number(v).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}` : acctMoney(v, a); }
function rewardRuleText(r) { return r.mode === 'ratio' ? `每 ${r.per} 得 ${r.value}` : r.mode === 'fixed' ? `每筆 ${r.value}` : `${r.value}%`; }

// ---- entry form ----
function rewardSync(reset) {
  const box = document.getElementById('rewardPick'), el = txForm?.elements; if (!box || !el) return;
  const a = acct(el.account?.value), kind = document.querySelector('input[name=kind]:checked')?.value, date = el.date?.value || isoDate(new Date());
  const list = kind === 'expense' ? rewardRules(a).filter(r => rewardActive(r, date) || (box.dataset.keep || '').split(',').includes(r.id)) : [];
  let sel = reset !== undefined ? reset : box.dataset.user === '1' ? [...box.querySelectorAll('input:checked')].map(i => i.value) : editId ? (box.dataset.keep || '').split(',') : rewardDefaults(a, el.category?.value, date);
  if (box.dataset.acct !== String(a.id || '') && reset === undefined && !editId) { box.dataset.user = ''; sel = rewardDefaults(a, el.category?.value, date); }
  box.dataset.acct = String(a.id || '');
  const n = Number((document.getElementById('fxRow')?.hidden === false ? el.convAmount?.value : el.amount?.value) || 0) - Math.max(0, Number(el.discount?.value || 0));
  box.innerHTML = list.length ? `${list.map(r => `<label class="reward-tag"><input type="checkbox" value="${esc(r.id)}"${sel.includes(r.id) ? ' checked' : ''}> ${esc(r.name)} ${esc(rewardRuleText(r))}${sel.includes(r.id) && n > 0 && n >= Number(r.minSingle || 0) ? `<em>約 ${esc(rewardText(rewardRound(rewardUnit(r, n), r.roundEach || 'round', curDigits(acctCur(acct(r.account || a.id)))), r.account || a.id))}</em>` : ''}</label>`).join('')}` : '';
}
function rewardOpen(t) { const box = document.getElementById('rewardPick'); if (!box) return; box.dataset.user = ''; box.dataset.keep = (t?.rewards || []).join(','); box.dataset.acct = t ? String(t.account) : ''; rewardSync(t ? (t.rewards || []) : undefined); if (t && !t.id && t.rewards?.length) box.dataset.user = '1'; }
function rewardApply(t) {
  const ids = t.kind === 'expense' ? [...document.querySelectorAll('#rewardPick input:checked')].map(i => i.value) : [];
  if (ids.length) t.rewards = ids; else delete t.rewards;
}

// ---- account page ----
function rewardUi() { return window.__rewardUi || (window.__rewardUi = { edit: null, open: null, off: 0 }); }
function rewardFormHTML(a, r) {
  const o = (k, opts) => `<select data-rw="${k}">${opts.map(([v, l]) => `<option value="${v}"${String(r[k] ?? '') === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`, i = (k, t, ph) => `<input data-rw="${k}" type="${t || 'number'}" ${t ? '' : 'min="0" step="any"'} value="${esc(r[k] ?? '')}" placeholder="${ph || ''}">`;
  const rounds = [['', '保留小數'], ['round', '四捨五入'], ['floor', '無條件捨去'], ['ceil', '無條件進位'], ['roundInt', '四捨五入至整數'], ['floorInt', '捨去至整數'], ['ceilInt', '進位至整數']];
  return `<div class="reward-form" data-reward-form="${esc(a.id)}" data-rule="${esc(r.id || '')}"><div class="form-grid"><label>名稱<input data-rw="name" maxlength="20" value="${esc(r.name || '')}" placeholder="例如：網購 2%"></label><label>回饋方式${o('mode', [['pct', '按照 %'], ['ratio', '按照比例'], ['fixed', '固定金額']])}</label><label>回饋值（% 或數量）${i('value')}</label><label>比例：每消費多少${i('per', '', '例如 15')}</label>
  <label>計算區間${o('period', [['stmt', '依照帳單區間'], ['month', '整月計算'], ['range', '指定活動區間']])}</label><label>活動開始${i('from', 'date')}</label><label>活動結束${i('to', 'date')}</label><label>統計基準（整月）${o('basis', [['date', '消費日'], ['post', '入帳日']])}</label>
  <label>入帳時機${o('timing', [['end', '區間結束後'], ['now', '當下交易後'], ['post', '依照入帳日'], ['manual', '手動指定']])}</label><label>交易／入帳後幾天${i('days')}</label><label>區間結束的${o('payMonth', [['0', '當月'], ['1', '次月']])}</label><label>幾號回饋（空白＝隔天）${i('payDay')}</label>
  <label>最低累積消費${i('minTotal')}</label><label>單筆低消${i('minSingle')}</label><label>消費次數門檻${i('minCount')}</label><label>單筆進位${o('roundEach', rounds)}</label><label>總額進位${o('roundTotal', rounds)}</label><label>單筆回饋上限${i('capEach')}</label><label>總額回饋上限${i('cap')}</label><label>共同上限群組${i('capGroup', 'text', '同名者共用上限')}</label>
  <label>回饋帳戶<select data-rw="account"><option value="">${esc(a.name)}（原帳戶）</option>${acctActive(acctOrdered(state.accounts), r.account).filter(x => x.id !== a.id).map(x => `<option value="${esc(x.id)}"${String(r.account || '') === String(x.id) ? ' selected' : ''}>${acctName(x)}</option>`).join('')}</select></label><label>回饋專案<select data-rw="project"><option value="">原記錄的專案</option>${(state.projects || []).map(p => `<option value="${esc(p.id)}"${String(r.project || '') === String(p.id) ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label>可用日期起${i('start', 'date')}</label><label>可用日期迄${i('end', 'date')}</label></div><label class="check"><input type="checkbox" data-rw="base"${r.base ? ' checked' : ''}> 基本回饋（記帳選到此帳戶自動帶入）</label><p class="hint">回饋趴數變更時請新增一筆，不要改舊的，以免影響既有記錄。</p><div class="form-actions"><button type="button" class="secondary" data-reward-cancel>取消</button><button type="button" class="primary" data-reward-save>儲存</button></div></div>`;
}
function rewardFromForm(root) {
  const r = {}; root.querySelectorAll('[data-rw]').forEach(x => { const k = x.dataset.rw; if (x.type === 'checkbox') { if (x.checked) r[k] = true; } else { const v = String(x.value).trim(); if (v !== '') r[k] = x.type === 'number' ? Number(v) : v; } });
  return rewardValidate(r);
}
function rewardValidate(r) {
  if (!r.name) return { error: '請輸入回饋名稱' }; if (!(Number(r.value) > 0)) return { error: '請輸入回饋值' };
  if (r.mode === 'ratio' && !(Number(r.per) > 0)) return { error: '按照比例請輸入每消費多少' };
  if (r.period === 'range' && !(r.from && r.to && r.from <= r.to)) return { error: '請輸入正確的活動區間' };
  return { rule: r };
}
function rewardSectionHTML(a) {
  const ui = rewardUi(), t0 = isoDate(new Date()), every = rewardRules(a), ended = every.filter(r => r.end && r.end < t0), list = ui.ended ? every : every.filter(r => !(r.end && r.end < t0));
  const rows = list.map(r => {
    const cur = rewardPeriod(r, a, t0); let p = cur; for (let k = 0; k < -ui.off && r.period !== 'range'; k++) p = rewardPeriod(r, a, addDaysIso(p.start, -1));
    const s = rewardStats(r, a, p), tg = r.account || a.id, dead = !rewardActive(r, t0), bits = [`消費 ${money(s.spend)}（${s.count} 筆）`];
    if (s.minLeft) bits.push(`還差 ${money(s.minLeft)} 達門檻`); if (s.countLeft) bits.push(`還差 ${s.countLeft} 次`); if (s.cap !== null) bits.push(s.spendLeft ? `再消費 ${money(s.spendLeft)} 達上限 ${s.cap}` : s.capLeft === 0 ? '已達上限' : `上限 ${s.cap}`); if (s.got) bits.push(`已入帳 ${rewardText(s.got, tg)}`);
    return `<div class="reward-row${dead ? ' dead' : ''}"><div class="day-main"><b>${esc(r.name)}${r.base ? '（基本）' : ''}</b><small>${esc(rewardRuleText(r))} · ${p.start} ～ ${p.end}</small><small>${esc(bits.join(' · '))}</small></div><div class="day-side"><b class="income-text">${esc(rewardText(s.total, tg))}</b><span class="notice-act">${r.timing === 'manual' && s.left > 0 ? `<button type="button" class="primary" data-reward-take="${esc(r.id)}" data-start="${p.start}">取得回饋</button>` : ''}<button type="button" class="ghost" data-reward-list="${esc(r.id)}">明細</button><button type="button" class="ghost" data-reward-edit="${esc(r.id)}" data-acct="${esc(a.id)}">編輯</button></span></div></div>${ui.open === r.id ? `<div class="reward-items">${s.items.map(x => `<button type="button" class="notice-row" data-tx-open="${esc(x.t.id)}"><span>${x.t.date.slice(5)}</span><span>${esc(x.t.name)}</span><b>${x.ok ? esc(rewardText(x.reward, tg)) : '未達單筆門檻'}</b></button>`).join('') || '<div class="hint">這個區間沒有套用的消費</div>'}<div class="form-actions"><button type="button" class="ghost" data-reward-up="${esc(r.id)}" aria-label="往前移">↑</button><button type="button" class="secondary" data-reward-copy="${esc(r.id)}">複製</button>${dead ? '' : `<button type="button" class="secondary" data-reward-end="${esc(r.id)}">終止</button>`}<button type="button" class="secondary danger-btn" data-reward-del="${esc(r.id)}">刪除</button></div></div>` : ''}`;
  }).join('');
  const ed = ui.edit && ui.edit.acct === String(a.id) ? rewardFormHTML(a, list.find(r => r.id === ui.edit.rule) || { mode: 'pct', period: a.type === 'card' ? 'stmt' : 'month', timing: 'end', payMonth: 0 }) : '';
  return `<section class="detail-sec"><h4>紅利回饋 <span>${list.length ? '<button type="button" class="ghost" data-reward-off="-1">‹ 上期</button><button type="button" class="ghost" data-reward-off="1">下期 ›</button>' : ''}<button type="button" class="ghost" data-reward-edit="" data-acct="${esc(a.id)}">＋ 新增</button></span></h4>${rows || '<div class="hint">還沒有設定回饋。</div>'}${ended.length ? `<button type="button" class="ghost" data-reward-ended>${ui.ended ? '隱藏' : '顯示'}已結束（${ended.length}）</button>` : ''}${ed}</section>`;
}
document.addEventListener('click', async e => {
  const c = s => e.target.closest?.(s), ui = rewardUi(), again = () => { renderAccounts(); };
  if (c('[data-reward-ended]')) { ui.ended = !ui.ended; again(); return; }
  const mvr = c('[data-reward-up]'); if (mvr) { const f = rewardRuleById(mvr.dataset.rewardUp); if (f) { const l = [...rewardRules(f.acct)], k = l.indexOf(f.rule); if (k > 0) { [l[k - 1], l[k]] = [l[k], l[k - 1]]; f.acct.rewards = l; await save(); render(); } } return; }
  const of = c('[data-reward-off]'); if (of) { ui.off = Math.min(0, ui.off + Number(of.dataset.rewardOff)); again(); return; }
  const ed = c('[data-reward-edit]'); if (ed) { ui.edit = { acct: ed.dataset.acct, rule: ed.dataset.rewardEdit }; again(); document.querySelector('.reward-form')?.scrollIntoView({ block: 'center' }); return; }
  if (c('[data-reward-cancel]')) { ui.edit = null; again(); return; }
  const ls = c('[data-reward-list]'); if (ls) { ui.open = ui.open === ls.dataset.rewardList ? null : ls.dataset.rewardList; again(); return; }
  if (c('[data-reward-save]')) {
    const root = c('[data-reward-form]'), a = acct(root.dataset.rewardForm), v = rewardFromForm(root); if (v.error) { alert(v.error); return; }
    const rid = root.dataset.rule, old = rewardRules(a).find(r => r.id === rid); a.rewards = old ? rewardRules(a).map(r => r === old ? { ...v.rule, id: rid } : r) : [...rewardRules(a), { ...v.rule, id: id() }];
    ui.edit = null; await save(); render(); return;
  }
  const b = c('[data-reward-copy],[data-reward-end],[data-reward-del],[data-reward-take]'); if (!b) return;
  const rid = b.dataset.rewardCopy || b.dataset.rewardEnd || b.dataset.rewardDel || b.dataset.rewardTake, f = rewardRuleById(rid); if (!f) return;
  if (b.dataset.rewardCopy) f.acct.rewards = [...rewardRules(f.acct), { ...f.rule, id: id(), name: `${f.rule.name} 複製`.slice(0, 20) }];
  else if (b.dataset.rewardEnd) f.rule.end = addDaysIso(isoDate(new Date()), -1);
  else if (b.dataset.rewardTake) { const p = rewardPeriod(f.rule, f.acct, b.dataset.start), s = rewardStats(f.rule, f.acct, p); if (!(s.left > 0) || !confirm(`取得「${f.rule.name}」回饋 ${rewardText(s.left, f.rule.account || f.acct.id)}？`)) return; rewardPost(f.rule, f.acct, p, s.left, { date: isoDate(new Date()) }); }
  else { if (!confirm(`刪除「${f.rule.name}」？記錄上的這個回饋標籤會一併移除（已入帳的回饋記錄保留）。`)) return; f.acct.rewards = rewardRules(f.acct).filter(r => r.id !== rid); if (!f.acct.rewards.length) delete f.acct.rewards; for (const t of state.transactions) if (t.rewards?.includes(rid)) { t.rewards = t.rewards.filter(x => x !== rid); if (!t.rewards.length) delete t.rewards; } }
  await save(); render();
});
document.addEventListener('change', e => {
  const t = e.target; if (!t?.closest?.('#txForm')) return;
  if (t.closest('#rewardPick')) { document.getElementById('rewardPick').dataset.user = '1'; rewardSync(); } else if (['account', 'category', 'date', 'kind'].includes(t.name)) rewardSync();
});
document.addEventListener('input', e => { if (e.target?.closest?.('#txForm') && ['amount', 'discount', 'convAmount'].includes(e.target.name)) rewardSync(); });
