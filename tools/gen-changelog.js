// Builds changelog.json (設定 → 版本記錄) from CHANGELOG-V*.txt.  node tools/gen-changelog.js [--check]
// Dates come from the git tag (v26.71); known dates are kept; the current version without a tag gets appReleaseDate().
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), file = path.join(root, 'changelog.json');
const num = v => v.split('.').map(Number);
const cmp = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); return 0; };
function items(text) {
  const out = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
    const l = raw.trim(); if (!l || /^[=─—-]{3,}$/.test(l)) continue;
    const m = l.match(/^(?:[-*•・]|\d+[.、)])\s*(.+)$/);
    if (m) out.push(m[1]); else if (out.length && /^\s/.test(raw)) out[out.length - 1] += ' ' + l; else out.push(l);
  }
  return out;
}
function build() {
  let old = {}; try { old = Object.fromEntries(JSON.parse(fs.readFileSync(file, 'utf8')).map(x => [x.v, x.date])); } catch { }
  const cur = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8').match(/appReleaseDate\(\) \{ return '([\d-]+)'/)[1];
  const curV = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/moze-v([\d.]+)-shell/)[1];
  return fs.readdirSync(root).map(f => f.match(/^CHANGELOG-V([\d.]+)\.txt$/)).filter(Boolean).map(m => m[1]).sort(cmp).map(v => {
    let date = old[v] || '';
    if (!date && v === curV) date = cur;
    if (!date) try { date = cp.execSync(`git log -1 --format=%ad --date=format:%Y-%m-%d v${v}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { }
    return { v, date, items: items(fs.readFileSync(path.join(root, `CHANGELOG-V${v}.txt`), 'utf8')) };
  });
}
const strip = l => JSON.stringify(l.map(({ v, items }) => ({ v, items })));
const list = build();
if (process.argv.includes('--check')) {
  if (strip(JSON.parse(fs.readFileSync(file, 'utf8'))) !== strip(list)) { console.error('changelog.json is stale: run node tools/gen-changelog.js'); process.exit(1); }
} else { fs.writeFileSync(file, '[\n' + list.map(x => JSON.stringify(x)).join(',\n') + '\n]\n'); console.log(`wrote changelog.json (${list.length} versions)`); }
