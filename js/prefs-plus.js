// 帳小簿 V26.81 — 偏好補齊、相似交易提醒、每日記帳提醒、常用入口、搜尋歷史、批次改帳戶／日期／名稱／商家、隱藏類別.
// Bundled after js/acct-plus.js. Function declarations / var only.

function prefPlusDefs() {
  return [
    { k: 'fontSize', l: '字體大小', o: [['', '最佳'], ['l', '加大'], ['xl', '特大']] },
    { k: 'colorSwap', l: '支出／收入顏色', o: [['', '紅支出・綠收入'], ['1', '綠支出・紅收入']] },
    { k: 'dayOrder', l: '首頁記錄順序', o: [['', '新的在前'], ['asc', '舊的在前']] },
    { k: 'keypad', l: '數字鍵盤順序', o: [['', '計算機（789 在上）'], ['phone', '電話（123 在上）']] },
    { k: 'copyTime', l: '複製記錄帶入時間', o: [['', '選擇的日期與現在時間'], ['keep', '保留原本日期時間']] },
    { k: 'finishTime', l: '完成提醒入帳的時間', o: [['', '完成當下'], ['keep', '保留原記錄時間']] },
    { k: 'suggest', l: '自動建議記帳類別', b: true, d: true },
    { k: 'rewardSuggest', l: '自動建議紅利回饋', b: true, d: true },
    { k: 'similar', l: '相似交易提醒', b: true, d: true },
    { k: 'hideRewards', l: '首頁隱藏紅利回饋', b: true },
    { k: 'dailyRemind', l: '今天還沒記帳時在首頁提醒', b: true },
    { k: 'noAnim', l: '關閉動畫效果', b: true },
  ];
}
function prefOn(k) { const d = prefPlusDefs().find(x => x.k === k); return prefs()[k] === undefined ? !!d?.d : !!prefs()[k]; }
function renderPrefPlus() {
  const box = document.getElementById('prefPlus'); if (!box) return;
  box.innerHTML = prefPlusDefs().map(d => `<label class="setting"><span>${d.l}</span>${d.b ? `<input type="checkbox" data-pref-plus="${d.k}"${prefOn(d.k) ? ' checked' : ''}>` : `<select data-pref-plus="${d.k}">${d.o.map(([v, l]) => `<option value="${v}"${String(prefs()[d.k] || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`}</label>`).join('');
}
function applyPrefPlus() { const r = document.documentElement; if (!r?.dataset) return; const p = prefs(); r.dataset.font = p.fontSize || ''; r.dataset.swap = p.colorSwap ? '1' : ''; r.dataset.keypad = p.keypad || ''; r.dataset.noanim = p.noAnim ? '1' : ''; }
// Same day, kind / account / amount and same name or category, on the same day.
function similarTx(t) { return (state.transactions || []).find(x => x.id !== t.id && x.date === t.date && x.kind === t.kind && String(x.account) === String(t.account) && Math.abs(Number(x.amount)) === Math.abs(Number(t.amount)) && (x.name === t.name || String(x.category) === String(t.category)) && !x.installment) || null; }
function similarConfirm(t) { if (!prefOn('similar')) return true; const s = similarTx(t); return !s || confirm(`今天這個帳戶已經有一筆相似的記錄：\n${s.name} ${money(s.amount)} ${s.time || ''}\n\n仍要儲存嗎？`); }
function dailyRemindHTML(today) { if (!prefOn('dailyRemind')) return ''; const t = today || isoDate(new Date()); return (state.transactions || []).some(x => x.date === t && !x.autoPost && !x.recurringId) ? '' : '今天還沒有記帳'; }
// ---- quick access ----
function quickDefs() { return [['notice', '通知中心', '#noticeBtn'], ['cal', '月曆', '#fullCalBtn'], ['reports', '統計報表', '#openReports', 'analysis'], ['compare', '比較報表', '#openCompare', 'analysis'], ['recurring', '週期', '', 'recurring'], ['loans', '借還款', '', 'loans'], ['budgets', '預算', '', 'budgets'], ['projects', '專案', '', 'projects'], ['categories', '分類', '', 'categories'], ['accounts', '帳戶', '', 'accounts'], ['transfer', '轉帳', '[data-transfer="轉帳"]:not([data-account])'], ['withdraw', '提款', '[data-transfer="提款"]:not([data-account])'], ['privacy', '隱私模式', '#privacyBtn'], ['changelog', '版本記錄', '#openChangelog']]; }
function quickList() { const l = prefs().quickAccess; return (Array.isArray(l) ? l : ['recurring', 'loans', 'reports']).filter(k => quickDefs().some(d => d[0] === k)).slice(0, 8); }
function renderQuickAccess() {
  const host = document.querySelector('#view-overview .metrics'); let el = document.getElementById('quickAccess');
  if (host?.parentNode) { if (!el) { el = document.createElement('div'); el.id = 'quickAccess'; el.className = 'quick-access'; host.parentNode.insertBefore(el, host); } const dr = dailyRemindHTML(); el.innerHTML = quickList().map(k => { const d = quickDefs().find(x => x[0] === k); return `<button type="button" class="ghost" data-qa="${k}">${d[1]}</button>`; }).join('') + (dr ? `<button type="button" class="qa-remind" data-qa-add>✎ ${dr}，現在記一筆</button>` : ''); }
  const box = document.getElementById('quickAccessPref'); if (box) { const l = quickList(); box.innerHTML = l.map((k, i) => `<div class="setting"><span>${quickDefs().find(d => d[0] === k)[1]}</span><span><button type="button" class="ghost" data-qa-up="${k}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="ghost" data-qa-toggle="${k}">移除</button></span></div>`).join('') + `<div class="mode-checks">${quickDefs().filter(d => !l.includes(d[0])).map(d => `<button type="button" class="ghost" data-qa-toggle="${d[0]}" ${l.length >= 8 ? 'disabled' : ''}>＋ ${d[1]}</button>`).join('')}</div>`; }
}
// ---- search history ----
function searchRemember(q) { q = String(q || '').trim(); if (q.length < 2) return; setPref('searchHist', [q, ...(prefs().searchHist || []).filter(x => x !== q)].slice(0, 10)); searchHistFill(); }
function searchHistFill() { const s = document.getElementById('txSearch'); if (!s) return; let dl = document.getElementById('txSearchHist'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'txSearchHist'; s.after(dl); s.setAttribute('list', 'txSearchHist'); } dl.innerHTML = (prefs().searchHist || []).map(x => `<option value="${esc(x)}"></option>`).join(''); }
// ---- bulk ----
function bulkSetAccount(ids, aid) {
  const a = (state.accounts || []).find(x => String(x.id) === String(aid)); if (!a) return { changed: 0, skipped: ids.length }; let changed = 0, skipped = 0;
  for (const t of bulkPick(ids)) {
    const old = acct(t.account); if (!bulkEditable(t) || t.imported || t.stmtInst || t.cardPayment || (t.kind !== 'expense' && t.kind !== 'income') || acctCur(old) !== acctCur(a)) { skipped++; continue; }
    adjust(t, -1); t.account = a.id; delete t.recon; adjust(t, 1); changed++;
  }
  return { changed, skipped };
}
function bulkSetField(ids, k, v) { let changed = 0, skipped = 0; v = String(v || '').trim(); for (const t of bulkPick(ids)) { if (!bulkEditable(t) || t.stmtInst || (k !== 'merchant' && !v)) { skipped++; continue; } if (k === 'date') { adjust(t, -1); t[k] = v; adjust(t, 1); } else t[k] = v; changed++; } return { changed, skipped }; }
// ---- hidden categories ----
function catVisible(c) { if (!c || c.hidden) return false; const p = c.parentId ? (state.categories || []).find(x => String(x.id) === String(c.parentId)) : null; return !(p && p.hidden); }
document.addEventListener('change', e => {
  const t = e.target, k = t?.dataset?.prefPlus; if (k) { setPref(k, t.type === 'checkbox' ? t.checked : t.value); applyPrefPlus(); try { render(); } catch { } }
  if (t?.id === 'txSearch') searchRemember(t.value);
});
document.addEventListener('click', e => {
  const c = s => e.target.closest?.(s); let b;
  if (c('[data-qa-add]')) { openTx(); return; }
  if ((b = c('[data-qa]'))) { const d = quickDefs().find(x => x[0] === b.dataset.qa); if (d[3]) nav(d[3]); if (d[0] === 'transfer' || d[0] === 'withdraw') { openTransfer({ preset: d[1] }); return; } if (d[2]) setTimeout(() => document.querySelector(d[2])?.click(), d[3] ? 80 : 0); return; }
  if ((b = c('[data-qa-toggle]'))) { const l = quickList(), k = b.dataset.qaToggle; setPref('quickAccess', l.includes(k) ? l.filter(x => x !== k) : [...l, k].slice(0, 8)); renderQuickAccess(); return; }
  if ((b = c('[data-qa-up]'))) { const l = quickList(), i = l.indexOf(b.dataset.qaUp); if (i > 0) { [l[i - 1], l[i]] = [l[i], l[i - 1]]; setPref('quickAccess', l); renderQuickAccess(); } }
});

// ---- 離線模式 (js/sync.js checks the same key before every sync) ----
function offlineOn() { try { return localStorage.getItem('moze-offline-mode') === '1'; } catch { return false; } }
function offlineSet(on) { try { if (on) localStorage.setItem('moze-offline-mode', '1'); else localStorage.removeItem('moze-offline-mode'); } catch { } renderOffline(); }
function renderOffline() { const c = document.getElementById('offlineMode'), b = document.getElementById('offlineRevert'); if (c) c.checked = offlineOn(); if (b) b.hidden = !offlineOn(); }
document.addEventListener('change', e => { if (e.target?.id === 'offlineMode') { offlineSet(e.target.checked); window.MozeSync?.syncNow?.('auto'); } });
document.addEventListener('click', async e => {
  if (!e.target.closest?.('#offlineRevert') || !confirm('放棄離線期間的修改，回復到雲端最新資料？\n回復後會重新開啟同步。')) return;
  try { if (await window.MozeSync?.pullAllFromCloud?.()) offlineSet(false); } catch (x) { alert('回復失敗：' + (x?.message || x)); }
});
