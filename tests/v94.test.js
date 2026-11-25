// 系統與偏好 tests (V26.94)
'use strict';
const { bundle, test, assert, fs, path, root } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: '玉山銀行', type: 'bank', balance: 0 }, { id: 'w', name: '錢包', type: 'cash', balance: 0 }], categories: [{ id: 'f', name: '飲食', kind: 'expense' }, { id: 'l', name: '午餐', kind: 'expense', parentId: 'f' }], projects: [{ id: 'p', name: '生活' }], budgets: [], loans: [], recurring: [], transactions: [{ id: 1, kind: 'expense', amount: 80, category: 'l', account: 'a', date: '2026-01-01' }, { id: 2, kind: 'expense', amount: 99, category: 'f', account: 'a', date: '2026-01-01' }, { id: 3, kind: 'expense', amount: 80, category: 'l', account: 'a', date: '2026-01-01' }] });
test('日期格式', () => { const b = bundle(st()); assert.equal(b.run("fmtDate('2025-10-06')"), '2025/10/06'); b.run("prefsCache={...prefsDefaults(),dateFmt:'dmy'}"); assert.equal(b.run("fmtDate('2025-10-06')"), '06/10/2025'); assert.equal(b.run("fmtDate('x')"), 'x'); });
test('金額建議：同類別優先、不重複', () => { const b = bundle(st()); assert.deepEqual(b.J("amountSuggest('l','expense',5)"), [80, 99]); });
test('複製時間四種', () => { const b = bundle(st()); b.run("nowTime=()=>'09:00';selectedDate='2026-11-25';var f=k=>{prefsCache={...prefsDefaults(),copyTime:k};return copyTimeApply({date:'2025-09-01',time:'10:30'},{date:'2025-09-01',time:'10:30'})}"); assert.deepEqual(b.J("['','nowDate','nowTime','keep'].map(f).map(x=>x.date+' '+x.time)"), ['2026-11-25 09:00', '2026-11-25 10:30', '2025-09-01 09:00', '2025-09-01 10:30']); });
test('捷徑網址只帶入欄位', () => {
  const b = bundle(st()); b.ctx.URLSearchParams = URLSearchParams; b.run("nowTime=()=>'09:00'");
  assert.equal(b.J("deepParse('?x=1')"), null); const t = b.J("deepTx(deepParse('?add=expense&amount=1,200&category=午餐&account=玉山&project=生活&tags=a%20b&save=1'))"); assert.deepEqual([t.amount, t.category, t.account, t.project, t.tags, t.id], [1200, 'l', 'a', 'p', ['a', 'b'], undefined]); assert.equal(b.run('state.transactions.length'), 3);
});
test('備份時段與 manifest', () => { const b = bundle(st()); assert.equal(b.run('backupSlot(new Date(2026,10,25,23,14))'), '2026-11-25 20:00'); const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')); assert.equal(m.shortcuts.length, 4); assert.equal(m.share_target.params.text, 'text'); });
