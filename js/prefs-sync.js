// 帳小簿 V26.84 — 偏好同步（選用）.
// Bundled after js/split-plus.js. Function declarations / var only.
// The cloud table only accepts the seven existing entities, so the shared preferences travel as one hidden record in
// `categories` ({ id: '__prefs__', kind: 'prefs', hidden: true, data, at }). catMains / catOrdered skip kind 'prefs'.
// Device-only things (theme, font, lock, privacy, carrier, current mode, search history) are never shared.

function prefSyncKeys() { return ['templates', 'modes', 'reports', 'compares', 'quickAccess', 'favCur', 'curCfg', 'curCustom', 'fx', 'weekStart', 'monthStart', 'hiddenPanels', 'jumpToTxDate', 'remindOn', 'remindDays', 'colorSwap', 'dayOrder', 'keypad', 'copyTime', 'finishTime', 'suggest', 'rewardSuggest', 'similar', 'hideRewards', 'dailyRemind', 'dateFmt', 'bigUnit', 'multiName', 'multiMer', 'invNote', 'mainTotal', 'groupTotal', 'noAnim']; }
function prefSyncUser() { try { return String(localStorage.getItem('moze-sync-last-user-v25') || ''); } catch { return ''; } }
// tied to the signed-in account, so another person's account on the same device never receives these preferences
function prefSyncOn() { return !!prefs().prefSync && String(prefs().prefSyncOwner ?? prefSyncUser()) === prefSyncUser(); }
function prefSyncHost() { return (state?.categories || []).find(c => c.id === '__prefs__') || null; }
function prefSyncData() { const o = {}; for (const k of prefSyncKeys()) if (prefs()[k] !== undefined) o[k] = JSON.parse(JSON.stringify(prefs()[k])); return o; }
// Writes this device's preferences into the shared record. Returns true when something changed.
function prefSyncPush(now) {
  if (!prefSyncOn() || !state) return false;
  const d = prefSyncData(), h = prefSyncHost(); if (h && JSON.stringify(h.data) === JSON.stringify(d)) return false;
  const at = now || Date.now(), rec = { id: '__prefs__', kind: 'prefs', name: '偏好設定（同步用）', icon: '⚙', hidden: true, order: 1e9, data: d, at };
  if (h) Object.assign(h, rec); else (state.categories = state.categories || []).push(rec);
  prefSyncSetAt(at); return true;
}
function prefSyncSetAt(at) { prefs().prefSyncAt = at; try { localStorage.setItem(prefsKey(), JSON.stringify(prefsCache)); } catch { } }
// Takes over a newer shared record. Returns true when applied.
function prefSyncPull() {
  const h = prefSyncHost(); if (!prefSyncOn() || !h?.data || !(Number(h.at) > Number(prefs().prefSyncAt || 0))) return false;
  for (const k of prefSyncKeys()) if (h.data[k] !== undefined) prefs()[k] = JSON.parse(JSON.stringify(h.data[k]));
  prefSyncSetAt(Number(h.at)); return true;
}
// Switching on for the first time keeps both sides: lists are merged by id, single settings follow the shared record.
function prefSyncEnable() {
  prefs().prefSync = true; prefs().prefSyncOwner = prefSyncUser(); const h = prefSyncHost();
  if (h?.data) for (const k of prefSyncKeys()) {
    const a = prefs()[k], b = h.data[k]; if (b === undefined) continue;
    if (Array.isArray(a) && Array.isArray(b) && ['templates', 'modes', 'reports', 'compares'].includes(k)) { const ids = new Set(b.map(x => String(x?.id))); prefs()[k] = [...JSON.parse(JSON.stringify(b)), ...a.filter(x => !ids.has(String(x?.id)))]; }
    else prefs()[k] = JSON.parse(JSON.stringify(b));
  }
  prefSyncPush(); if (typeof inboxPull === 'function') { inboxPull(); inboxPush(); } setPref('prefSync', true);
}
function prefSyncTouch(k) {
  if (!prefSyncOn() || !prefSyncKeys().includes(k)) return;
  clearTimeout(window.__prefSyncTimer);
  window.__prefSyncTimer = setTimeout(async () => { if (prefSyncPush()) await save(); }, 800);
}
function renderPrefSync() { const c = document.getElementById('prefSync'); if (c) c.checked = prefSyncOn(); if (typeof renderInvSyncPref === 'function') renderInvSyncPref(); }
document.addEventListener('change', async e => {
  if (e.target?.id !== 'prefSync') return;
  if (e.target.checked) { prefSyncEnable(); await save(); } else setPref('prefSync', false);
  render();
});
