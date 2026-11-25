// 帳小簿 V26.72 — 設定 → 版本記錄 (reads changelog.json, built by tools/gen-changelog.js).
// Bundled after js/notify.js. Function declarations / var only.

function changelogHTML(list, q) {
  const k = String(q || '').trim().toLowerCase();
  const l = (list || []).filter(x => !k || `v${x.v} ${x.items.join(' ')}`.toLowerCase().includes(k));
  return l.length ? l.map((x, i) => `<details class="cl-item"${i === 0 || k ? ' open' : ''}><summary><b>V${esc(x.v)}</b>${`V${x.v}` === appVersion() ? '<em>目前版本</em>' : ''}<span>${esc(String(x.date || '').replace(/-/g, '.'))}</span></summary><ul>${x.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`).join('') : '<div class="recon-empty">沒有符合的版本</div>';
}
async function openChangelog() {
  const el = sheetEl('clBg'); el.hidden = false;
  el.innerHTML = `<div class="recon-sheet">${sheetHead('版本記錄')}<div class="recon-search"><input id="clSearch" type="search" placeholder="搜尋版本或功能" autocomplete="off"></div><div class="recon-list cl-list" id="clList"><div class="recon-empty">載入中…</div></div></div>`;
  try {
    if (!window.__changelog) { const r = await fetch('./changelog.json'); if (!r.ok) throw new Error(r.status); window.__changelog = await r.json(); }
    document.getElementById('clList').innerHTML = changelogHTML(window.__changelog);
  } catch { const b = document.getElementById('clList'); if (b) b.innerHTML = '<div class="recon-empty">讀不到版本記錄，請連線後再試。</div>'; }
}
document.addEventListener('click', e => { if (e.target.closest?.('#openChangelog')) openChangelog(); });
document.addEventListener('input', e => { if (e.target?.id === 'clSearch') document.getElementById('clList').innerHTML = changelogHTML(window.__changelog, e.target.value); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const el = document.getElementById('clBg'); if (el) el.hidden = true; } });
