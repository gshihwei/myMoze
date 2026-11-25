// 版本記錄 tests (V26.72)
'use strict';
const { bundle, test, assert, fs, path, root } = require('./_bundle.js');
const cp = require('node:child_process');
test('changelog.json 與 CHANGELOG-V*.txt 同步、最新在前且等於目前版本', () => {
  cp.execFileSync(process.execPath, [path.join(root, 'tools/gen-changelog.js'), '--check']);
  const l = JSON.parse(fs.readFileSync(path.join(root, 'changelog.json'), 'utf8')), { run } = bundle({ accounts: [], categories: [], transactions: [] });
  assert.equal('V' + l[0].v, run('appVersion()')); assert.ok(l.every(x => x.items.length), '每版都有內容'); assert.ok(fs.readFileSync(path.join(root, 'sw.js'), 'utf8').includes('./changelog.json'));
});
test('版本記錄畫面：搜尋、跳脫、標示目前版本', () => {
  const { run } = bundle({ accounts: [], categories: [], transactions: [] });
  const h = run("changelogHTML([{v:appVersion().slice(1),date:'2026-11-25',items:['<b>x</b>']},{v:'1.0',date:'',items:['舊功能']}])");
  assert.ok(h.includes('目前版本') && h.includes('2026.11.25') && h.includes('&lt;b&gt;')); assert.ok(!run("changelogHTML([{v:'1.0',items:['舊功能']}],'沒有')").includes('舊功能'));
});
