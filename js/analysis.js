// 帳小簿 V26.4 — 報表分析頁.
// Concatenated into js/app.bundle.js right after js/app.js (tools/build-bundle.js), so it shares
// app.js globals: state, esc, money, cat, acct, acctName, txTWD, isoDate, pad2, isUnappliedPending,
// netWorthAt, addMonths, monthKey, compactNum, niceMax, netWorth, openDetail.
//
// Chart rules (dataviz): one y-axis per chart, thin marks (bars <= 24px, 4px rounded data-end,
// square baseline, 2px gap), 2px lines, >= 8px markers with a surface ring, recessive hairline grid,
// a legend for 2+ series, hover tooltips built with textContent, and every value also readable
// without hovering (ranked lists carry their figures; charts have a table view).

// Function declarations / var only: this file runs after app.js inside one script, and hoisted
// declarations stay usable even if something calls into it before this point is evaluated.
function anColors() { return { inc: '#3987e5', out: '#d95926', nw: '#199e70' }; } // validated on #1a2a3b, all pairs
function anRanges() { return [['thisMonth', '本月'], ['lastMonth', '上個月'], ['3m', '近 3 個月'], ['ytd', '今年'], ['12m', '近 12 個月'], ['custom', '自訂']]; }
var anState;
function anGetState() { if (!anState) anState = { range: 'thisMonth', from: '', to: '', kind: 'expense', account: 'all', drill: null }; return anState; }

// ---------- pure calculations (covered by tests/analysis.test.js) ----------

function anDate(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
function anDays(a, b) { return Math.round((anDate(b) - anDate(a)) / 864e5) + 1; }

// Returns the selected period and the comparison period of the same length right before it.
function anRange(preset, from, to, today = new Date()) {
  // month-based presets follow the custom month start day (settings → 每月起始日)
  const cur = periodKeyOf(today), span = (a, b) => [anDate(periodBounds(a).start), anDate(periodBounds(b).end)];
  let s, e, months = 0;
  if (preset === 'lastMonth') { [s, e] = span(addMonths(cur, -1), addMonths(cur, -1)); months = 1; }
  else if (preset === '3m') { [s, e] = span(addMonths(cur, -2), cur); months = 3; }
  else if (preset === 'ytd') { const y = cur.slice(0, 4); [s, e] = span(`${y}-01`, `${y}-12`); months = 12; }
  else if (preset === '12m') { [s, e] = span(addMonths(cur, -11), cur); months = 12; }
  else if (preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(from || '') && /^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
    s = anDate(from); e = anDate(to); if (s > e) [s, e] = [e, s];
  } else { [s, e] = span(cur, cur); months = 1; preset = preset === 'custom' ? 'custom' : 'thisMonth'; }
  const start = isoDate(s), end = isoDate(e), days = anDays(start, end);
  let prevStart, prevEnd;
  if (months) { const k0 = periodKeyOf(s); prevStart = periodBounds(addMonths(k0, -months)).start; prevEnd = periodBounds(addMonths(k0, -1)).end; }
  else { const pe = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1); prevEnd = isoDate(pe); prevStart = isoDate(new Date(pe.getFullYear(), pe.getMonth(), pe.getDate() - days + 1)); }
  const todayIso = isoDate(today);
  // days elapsed in the period (for "per day" averages of a period that is still running)
  const elapsed = todayIso < start ? 0 : todayIso >= end ? days : anDays(start, todayIso);
  return { preset, start, end, days, elapsed, prevStart, prevEnd };
}

function anValue(t, v) { const n = Math.abs(Number(v ?? t.amount ?? 0)); return txTWD(n, t.account) ?? n; }

// Income / expense transactions in [start, end], optionally limited to one account.
function anTxs(start, end, account = 'all') {
  return (state.transactions || []).filter(t =>
    (t.kind === 'expense' || t.kind === 'income') && !isUnappliedPending(t) &&
    t.date >= start && t.date <= end && (account === 'all' || String(t.account) === String(account)));
}

function anTotals(start, end, account = 'all', elapsedDays = 0) {
  let out = 0, inc = 0, nOut = 0, nInc = 0;
  for (const t of anTxs(start, end, account)) {
    if (t.kind === 'expense') { out += anValue(t); nOut++; } else { inc += anValue(t); nInc++; }
  }
  const days = elapsedDays || anDays(start, end);
  return { out: Math.round(out), inc: Math.round(inc), net: Math.round(inc - out), nOut, nInc, perDay: days ? Math.round(out / days) : 0 };
}

// A transaction's amount per category (splits respected), in TWD.
function anParts(t) {
  if (Array.isArray(t.splits) && t.splits.length) return t.splits.map(s => [s.category, anValue(t, s.amount)]);
  return [[t.category, anValue(t)]];
}
function anTopCategory(id) { const c = (state.categories || []).find(x => String(x.id) === String(id)); return c?.parentId ? String(c.parentId) : String(id ?? ''); }

// Ranked rows; the tail past `limit` folds into one "其他" row.
function anRank(map, limit = 10) {
  const total = [...map.values()].reduce((s, r) => s + r.amount, 0);
  let rows = [...map.values()].filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);
  if (rows.length > limit) {
    const rest = rows.slice(limit - 1);
    rows = rows.slice(0, limit - 1);
    rows.push({ id: '__other', name: `其他（${rest.length} 項）`, icon: '…', amount: rest.reduce((s, r) => s + r.amount, 0), count: rest.reduce((s, r) => s + r.count, 0), other: true });
  }
  return { total: Math.round(total), rows: rows.map(r => ({ ...r, amount: Math.round(r.amount), share: total ? r.amount / total : 0 })) };
}
function anAdd(map, key, base, v) { const r = map.get(key) || { ...base, amount: 0, count: 0 }; r.amount += v; r.count += 1; map.set(key, r); }

// Category ranking. drill = a main category id → its subcategories (the main itself as "（未分子類）").
function anByCategory(start, end, kind, account = 'all', drill = null, limit = 10) {
  const map = new Map();
  for (const t of anTxs(start, end, account)) {
    if (t.kind !== kind) continue;
    for (const [cid, v] of anParts(t)) {
      const top = anTopCategory(cid);
      if (drill && top !== String(drill)) continue;
      const key = drill ? String(cid) : top;
      const c = cat(key);
      const name = drill && key === String(drill) ? c.name + '（未分子類）' : c.name;
      const hasChildren = !drill && (state.categories || []).some(x => String(x.parentId) === key);
      anAdd(map, key, { id: key, name, icon: c.icon, drillable: hasChildren }, v);
    }
  }
  return anRank(map, limit);
}

function anByKey(start, end, kind, account, keyOf, limit = 8) {
  const map = new Map();
  for (const t of anTxs(start, end, account)) {
    if (t.kind !== kind) continue;
    for (const k of keyOf(t)) if (k) anAdd(map, k, { id: k, name: k }, anValue(t));
  }
  return anRank(map, limit);
}
function anMerchants(s, e, k, a) { return anByKey(s, e, k, a, t => [t.merchant || '']); }
function anTags(s, e, k, a) { return anByKey(s, e, k, a, t => (Array.isArray(t.tags) ? t.tags : []).map(x => '#' + x)); }
function anAccounts(s, e, k, a) { return anByKey(s, e, k, a, t => [acct(t.account).name || '未知帳戶']); }
function anPersons(s, e, k, a) { return anByKey(s, e, k, a, t => [t.person && t.person !== '不限定對象' ? t.person : '']); }
function anProjects(s, e, k, a) { return anByKey(s, e, k, a, t => [t.project ? (state.projects.find(p => String(p.id) === String(t.project))?.name || '') : '']); }

// Buckets for the columns chart: daily for periods up to 62 days, monthly otherwise.
function anBuckets(start, end, account = 'all') {
  const daily = anDays(start, end) <= 62, map = new Map(), keys = [];
  if (daily) { for (let d = anDate(start); isoDate(d) <= end; d.setDate(d.getDate() + 1)) keys.push(isoDate(d)); }
  else { for (let k = start.slice(0, 7); k <= end.slice(0, 7); k = addMonths(k, 1)) keys.push(k); }
  for (const k of keys) map.set(k, { key: k, out: 0, inc: 0 });
  for (const t of anTxs(start, end, account)) {
    const b = map.get(daily ? t.date : t.date.slice(0, 7)); if (!b) continue;
    b[t.kind === 'expense' ? 'out' : 'inc'] += anValue(t);
  }
  return { daily, rows: keys.map(k => { const b = map.get(k); return { key: k, out: Math.round(b.out), inc: Math.round(b.inc) }; }) };
}

// Month-end net worth for every month touched by the period (at least 6 points).
function anNetWorth(start, end) {
  let first = start.slice(0, 7); const last = end.slice(0, 7);
  const keys = []; for (let k = first; k <= last; k = addMonths(k, 1)) keys.push(k);
  while (keys.length < 6) keys.unshift(addMonths(keys[0], -1));
  const nw = netWorthAt(keys);
  return keys.map((k, i) => ({ key: k, nw: nw[i] }));
}

// ---------- rendering ----------

function anBucketLabel(key, daily) { if (daily) { const [, m, d] = key.split('-'); return `${Number(m)}/${Number(d)}`; } const [y, m] = key.split('-'); return m === '01' ? `${y}` : `${Number(m)}月`; }
function anBucketTitle(key, daily) { if (daily) { const [y, m, d] = key.split('-'); return `${y}/${m}/${d}`; } const [y, m] = key.split('-'); return `${y} 年 ${Number(m)} 月`; }

// Column path: square at the baseline, 4px rounded at the data end.
function anColPath(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// Grouped columns with one y-axis. series: [{key,label,color}]
function anColumnsSVG(rows, series, daily, width = 720) {
  const W = Math.max(280, Math.round(width) || 720), H = W < 520 ? 180 : 220, L = W < 520 ? 40 : 48, R = 12, T = 10, B = 24, iw = W - L - R, ih = H - T - B, n = rows.length || 1, slot = iw / n;
  const ticks = niceTicks(0, Math.max(0, ...rows.flatMap(r => series.map(s => r[s.key])))), max = ticks.hi;
  const y = v => T + ih - (v / max) * ih;
  const bw = Math.max(2, Math.min(24, (slot - 6 - 2 * (series.length - 1)) / series.length));
  const every = Math.max(1, Math.ceil(n * 40 / iw));
  let g = '';
  for (const v of ticks.ticks) { const yy = y(v); g += `<line class="cg-grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="cg-axis" x="${L - 6}" y="${yy + 4}" text-anchor="end">${compactNum(v)}</text>`; }
  g += `<line class="cg-base" x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}"/>`;
  rows.forEach((r, i) => {
    const groupW = series.length * bw + (series.length - 1) * 2, x0 = L + slot * i + (slot - groupW) / 2;
    series.forEach((s, j) => { const v = r[s.key]; g += `<path fill="${s.color}" d="${anColPath(x0 + j * (bw + 2), y(v), bw, T + ih - y(v))}"/>`; });
    if ((n - 1 - i) % every === 0) g += `<text class="cg-label" x="${L + slot * i + slot / 2}" y="${H - 7}" text-anchor="middle">${anBucketLabel(r.key, daily)}</text>`;
    g += `<rect class="cg-hit" data-i="${i}" tabindex="0" x="${L + slot * i}" y="${T}" width="${slot}" height="${ih}"/>`;
  });
  return `<svg class="cg an-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${series.map(s => s.label).join('、')}長條圖">${g}</svg>`;
}

// Single-series line with a 10% area wash, markers r=4 with a 2px surface ring.
function anLineSVG(points, color, width = 720) {
  const W = Math.max(280, Math.round(width) || 720), H = W < 520 ? 140 : 180, L = W < 520 ? 44 : 56, R = 12, T = 12, B = 24, iw = W - L - R, ih = H - T - B, n = points.length || 1, slot = iw / n;
  const vals = points.map(p => p.v), lt = niceTicks(Math.min(...vals), Math.max(...vals), 3), a = lt.lo, b = lt.hi;
  const x = i => L + slot * i + slot / 2, y = v => T + ih - ((v - a) / (b - a)) * ih;
  const every = Math.max(1, Math.ceil(n * 40 / iw));
  let g = '';
  for (const v of lt.ticks) { const yy = y(v); g += `<line class="cg-grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="cg-axis" x="${L - 6}" y="${yy + 4}" text-anchor="end">${compactNum(v)}</text>`; }
  if (points.length) {
    const pts = points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ');
    g += `<polygon fill="${color}" fill-opacity=".10" points="${x(0)},${T + ih} ${pts} ${x(points.length - 1)},${T + ih}"/><polyline class="cg-line2" stroke="${color}" points="${pts}"/>`;
    points.forEach((p, i) => { g += `<circle class="cg-mark" fill="${color}" cx="${x(i)}" cy="${y(p.v)}" r="4"/>${(points.length - 1 - i) % every === 0 ? `<text class="cg-label" x="${x(i)}" y="${H - 7}" text-anchor="middle">${esc(p.label)}</text>` : ''}<rect class="cg-hit" data-i="${i}" tabindex="0" x="${L + slot * i}" y="${T}" width="${slot}" height="${ih + B}"/>`; });
  }
  return `<svg class="cg an-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="淨資產走勢">${g}</svg>`;
}

// One floating tooltip; contents are built with textContent (names can come from CSV).
function anTooltip() {
  let tip = document.getElementById('anTip');
  if (!tip && document.body) { tip = document.createElement('div'); tip.id = 'anTip'; tip.className = 'an-tip'; tip.hidden = true; document.body.appendChild(tip); }
  return tip;
}
function anBindTip(el, readout) {
  if (!el) return;
  const show = e => {
    const hit = e.target.closest?.('.cg-hit'); const tip = anTooltip(); if (!tip) return;
    if (!hit) { tip.hidden = true; return; }
    const info = readout(Number(hit.dataset.i)); if (!info) return;
    tip.textContent = '';
    const head = document.createElement('div'); head.className = 'an-tip-head'; head.textContent = info.title; tip.appendChild(head);
    for (const row of info.rows) {
      const line = document.createElement('div'); line.className = 'an-tip-row';
      const key = document.createElement('i'); key.style.background = row.color; line.appendChild(key);
      const val = document.createElement('b'); val.textContent = row.value; line.appendChild(val);
      const lab = document.createElement('span'); lab.textContent = row.label; line.appendChild(lab);
      tip.appendChild(line);
    }
    const r = hit.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = `${Math.min(window.innerWidth - 200, Math.max(8, r.left + r.width / 2 - 90))}px`;
    tip.style.top = `${Math.max(8, r.top + window.scrollY - tip.offsetHeight - 8)}px`;
    el.querySelectorAll('.cg-hit').forEach(x => x.classList.toggle('active', x === hit));
  };
  el.onpointermove = show; el.onfocusin = show;
  el.onpointerleave = () => { const tip = anTooltip(); if (tip) tip.hidden = true; el.querySelectorAll('.cg-hit.active').forEach(x => x.classList.remove('active')); };
}

function anRankHTML(rank, { drill = false, empty = '這段期間沒有資料' } = {}) {
  if (!rank.rows.length) return `<div class="empty">${empty}</div>`;
  const max = rank.rows[0].amount || 1;
  return `<div class="an-rank">${rank.rows.map(r => `<${drill && r.drillable ? `button type="button" data-an-drill="${esc(r.id)}"` : 'div'} class="an-rank-row">
    <span class="an-rank-name">${r.icon ? `<span class="an-rank-icon">${esc(r.icon)}</span>` : ''}<b>${esc(r.name)}</b>${drill && r.drillable ? '<span class="an-rank-more">›</span>' : ''}</span>
    <span class="an-rank-bar"><i style="width:${Math.max(1.5, r.amount / max * 100).toFixed(1)}%"></i></span>
    <span class="an-rank-fig"><b>${money(r.amount)}</b><small>${(r.share * 100).toFixed(1)}% · ${r.count} 筆</small></span>
  </${drill && r.drillable ? 'button' : 'div'}>`).join('')}</div>`;
}

function anDeltaHTML(cur, prev, upIsGood) {
  const p = pctChange(cur, prev);
  if (p === null) return '<span class="an-delta">上期無資料</span>';
  const d = cur - prev, good = d === 0 ? null : (d > 0) === upIsGood;
  return `<span class="an-delta ${good === null ? '' : good ? 'good' : 'bad'}">${d >= 0 ? '↑' : '↓'} ${Math.abs(p).toFixed(1)}% <small>vs 上期 ${money(prev)}</small></span>`;
}

function anTableHTML(rows, cols) {
  return `<details class="an-table"><summary>以表格檢視</summary><table><thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${c.value(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

function renderAnalysis() {
  const root = document.getElementById('analysisRoot'); if (!root) return;
  const cw = Math.max(0, (root.clientWidth || 0) - 38); // chart width inside a panel (18px padding each side)
  const AN_COLORS = anColors(), st = anGetState(), R = anRange(st.range, st.from, st.to);
  const cur = anTotals(R.start, R.end, st.account, R.elapsed), prev = anTotals(R.prevStart, R.prevEnd, st.account);
  const kindLabel = st.kind === 'expense' ? '支出' : '收入';
  const cats = anByCategory(R.start, R.end, st.kind, st.account, st.drill);
  const drillCat = st.drill ? cat(st.drill) : null;
  const buckets = anBuckets(R.start, R.end, st.account);
  const series = buckets.daily
    ? [{ key: st.kind === 'expense' ? 'out' : 'inc', label: kindLabel, color: st.kind === 'expense' ? AN_COLORS.out : AN_COLORS.inc }]
    : [{ key: 'out', label: '支出', color: AN_COLORS.out }, { key: 'inc', label: '收入', color: AN_COLORS.inc }];
  const nw = anNetWorth(R.start, R.end);
  const accOpts = `<option value="all">全部帳戶</option>${state.accounts.map(a => `<option value="${esc(a.id)}" ${String(a.id) === String(st.account) ? 'selected' : ''}>${acctName(a)}</option>`).join('')}`;
  const legend = series.length > 1 ? `<div class="an-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>` : '';
  const side = (title, rank) => `<div class="panel"><div class="panel-head"><div><h2>${title}</h2><p>${kindLabel} · 合計 ${money(rank.total)}</p></div></div>${anRankHTML(rank, { empty: `沒有${title.replace('排行', '')}資料` })}</div>`;

  root.innerHTML = `
    <div class="an-filters" role="group" aria-label="報表篩選">
      <select id="anRange" aria-label="期間">${anRanges().map(([v, l]) => `<option value="${v}" ${v === st.range ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="an-custom" ${st.range === 'custom' ? '' : 'hidden'}><input type="date" id="anFrom" value="${esc(st.from || R.start)}" aria-label="開始日期"> – <input type="date" id="anTo" value="${esc(st.to || R.end)}" aria-label="結束日期"></span>
      <div class="seg an-kind"><label><input type="radio" name="anKind" value="expense" ${st.kind === 'expense' ? 'checked' : ''}>支出</label><label><input type="radio" name="anKind" value="income" ${st.kind === 'income' ? 'checked' : ''}>收入</label></div>
      <select id="anAccount" aria-label="帳戶">${accOpts}</select>
      <span class="hint an-period">${R.start.replace(/-/g, '/')} – ${R.end.replace(/-/g, '/')}</span>
    </div>
    <div class="metrics an-kpis">
      <article class="metric"><small>支出</small><strong>${money(cur.out)}</strong>${anDeltaHTML(cur.out, prev.out, false)}</article>
      <article class="metric"><small>收入</small><strong>${money(cur.inc)}</strong>${anDeltaHTML(cur.inc, prev.inc, true)}</article>
      <article class="metric"><small>結餘</small><strong>${cur.net < 0 ? '−' : ''}${money(Math.abs(cur.net))}</strong>${anDeltaHTML(cur.net, prev.net, true)}</article>
      <article class="metric"><small>日均支出</small><strong>${money(cur.perDay)}</strong><span class="an-delta">${R.elapsed || R.days} 天 · ${cur.nOut} 筆支出</span></article>
    </div>
    <div class="an-grid">
      <div class="panel an-wide">
        <div class="panel-head"><div><h2>${drillCat ? `${esc(drillCat.name)} · 子分類` : `${kindLabel}分類排行`}</h2><p>合計 ${money(cats.total)}${drillCat ? '' : ' · 點有「›」的分類查看子分類'}</p></div>${drillCat ? '<button type="button" class="ghost" data-an-drill="">‹ 全部分類</button>' : ''}</div>
        ${anRankHTML(cats, { drill: !drillCat, empty: `這段期間沒有${kindLabel}` })}
      </div>
      <div class="panel an-wide">
        <div class="panel-head"><div><h2>${buckets.daily ? `每日${kindLabel}` : '每月收支'}</h2><p>${buckets.daily ? '期間 62 天以內以每日顯示' : '支出與收入'}</p></div>${legend}</div>
        <div class="an-chart" id="anColumns">${anColumnsSVG(buckets.rows, series, buckets.daily, cw || 720)}</div>
        ${anTableHTML(buckets.rows.filter(r => r.out || r.inc), [{ label: buckets.daily ? '日期' : '月份', value: r => anBucketTitle(r.key, buckets.daily) }, ...series.map(s => ({ label: s.label, value: r => money(r[s.key]) }))])}
      </div>
      <div class="panel an-wide">
        <div class="panel-head"><div><h2>淨資產走勢</h2><p>每月月底淨資產（外幣依目前匯率換算）</p></div></div>
        <div class="an-chart" id="anNetWorth">${anLineSVG(nw.map(p => ({ v: p.nw, label: anBucketLabel(p.key, false) })), AN_COLORS.nw, cw || 720)}</div>
        ${anTableHTML(nw, [{ label: '月份', value: r => anBucketTitle(r.key, false) }, { label: '月底淨資產', value: r => money(r.nw) }])}
      </div>
      ${side('商家排行', anMerchants(R.start, R.end, st.kind, st.account))}
      ${side('標籤排行', anTags(R.start, R.end, st.kind, st.account))}
      ${side('帳戶排行', anAccounts(R.start, R.end, st.kind, st.account))}
      ${side('專案排行', anProjects(R.start, R.end, st.kind, st.account))}
      ${side('對象排行', anPersons(R.start, R.end, st.kind, st.account))}
    </div>`;

  anBindTip(document.getElementById('anColumns'), i => { const r = buckets.rows[i]; return r && { title: anBucketTitle(r.key, buckets.daily), rows: series.map(s => ({ color: s.color, value: money(r[s.key]), label: s.label })) }; });
  anBindTip(document.getElementById('anNetWorth'), i => { const r = nw[i]; return r && { title: anBucketTitle(r.key, false), rows: [{ color: AN_COLORS.nw, value: money(r.nw), label: '月底淨資產' }] }; });
  const set = patch => { anState = { ...anGetState(), ...patch }; renderAnalysis(); };
  root.querySelector('#anRange').onchange = e => set({ range: e.target.value, drill: null });
  root.querySelector('#anFrom').onchange = e => set({ from: e.target.value });
  root.querySelector('#anTo').onchange = e => set({ to: e.target.value });
  root.querySelector('#anAccount').onchange = e => set({ account: e.target.value });
  root.querySelectorAll('input[name=anKind]').forEach(r => r.onchange = () => set({ kind: r.value, drill: null }));
  root.querySelectorAll('[data-an-drill]').forEach(b => b.onclick = () => set({ drill: b.dataset.anDrill || null }));
}
