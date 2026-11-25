// 電子發票 tests (V26.97)
'use strict';
const { bundle, test, assert, fs, path, root } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 0 }], categories: [{ id: 'f', name: 'F', kind: 'expense' }], projects: [], budgets: [], loans: [], recurring: [], transactions: [{ id: 't', kind: 'expense', name: '晚餐', merchant: '梁社漢', amount: 284, category: 'f', account: 'a', date: '2026-06-24', tags: [] }] });
const mk = () => { const b = bundle(st()); b.run('window.__inv={list:[],win:{}}'); return b; };
const QR = 'NZ30394407' + '1150624' + '1234' + '0000010E' + '0000011C' + '00000000' + '12345678' + 'A'.repeat(24) + ':**********:2:3:1:炸排骨麵:1:120:焢肉飯:1:99';
test('解析左邊 QRCode 與右邊明細', () => {
  const b = mk(); const p = b.J(`invParse(${JSON.stringify(QR)})`); assert.deepEqual([p.no, p.date, p.code, p.total, p.sales, p.seller, p.items.length], ['NZ30394407', '2026-06-24', '1234', 284, 270, '12345678', 2]); assert.deepEqual(p.items[1], ['焢肉飯', 1, 99]);
  assert.equal(b.J("invParse('https://x.y')"), null); b.run(`invAdd(invParse(${JSON.stringify(QR)}))`); b.run("invAdd(invParse('**椒鹽雞塊:1:65'))"); assert.equal(b.run('invDb().list[0].items.length'), 3); assert.equal(b.J(`invAdd(invParse(${JSON.stringify(QR)}))`).dup, true);
  assert.equal(b.run('invNote(invDb().list[0])').split('\n').length, 3);
});
test('連結、一筆多張、取消連結', () => {
  const b = mk(); b.run(`var i=invAdd(invParse(${JSON.stringify(QR)}));invLink(i,state.transactions[0],'replace')`); assert.equal(b.run('state.transactions[0].invoiceNo'), 'NZ30394407'); assert.equal(b.run('invDb().list.length'), 0); assert.match(b.run('state.transactions[0].note'), /炸排骨麵/);
  b.run(`invLink({no:'AB00000001',code:'',date:'2026-06-24',total:30,items:[]},state.transactions[0],'')`); assert.equal(b.run('invOfTx(state.transactions[0]).length'), 2); assert.ok(b.J(`invAdd(invParse(${JSON.stringify(QR)}))`).error);
  b.run("invUnlink(state.transactions[0],'NZ30394407')"); assert.deepEqual(b.J('[invOfTx(state.transactions[0]).length,state.transactions[0].invoiceNo,invDb().list.length]'), [1, 'AB00000001', 1]);
});
test('對獎與期別', () => {
  const b = mk(), W = "{special:'11111111',grand:'22222222',first:['12345678','87654321']}"; const p = n => b.J(`invPrize('AB${n}',${W})`);
  assert.equal(p('11111111').v, 10000000); assert.equal(p('22222222').p, '特獎'); assert.equal(p('12345678').p, '頭獎'); assert.equal(p('02345678').p, '二獎'); assert.equal(p('99999678').p, '六獎'); assert.equal(p('99999999'), null); assert.equal(b.run("invPeriod('2026-06-24')"), '2026-05'); assert.equal(b.run("invDrawDate('2026-05')"), '2026-07-25'); assert.equal(b.run("invDrawDate('2026-11')"), '2027-01-25');
});
test('掃描程式檔存在並可離線', () => { assert.ok(fs.statSync(path.join(root, 'js/vendor/jsQR.js')).size > 200000); assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /vendor\/jsQR\.js/); });
