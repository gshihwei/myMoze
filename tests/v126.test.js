// 銀行同步 (V26.126) app tests: feed records, account mapping, auto-pairing, unpairing memory, balances, notices.
'use strict';
const { bundle, test, assert, fs, path, root } = require('./_bundle.js');
const tx = (id, date, amount, extra) => ({ id, date, kind: 'expense', amount, account: 'esun', category: 'c1', name: 'x' + id, tags: [], ...extra });
const feed = (tx, extra) => ({ id: '__bank_esun__', kind: 'prefs', name: '銀行同步：玉山銀行', hidden: true, order: 1e9, bank: { v: 1, source: 'esun', name: '玉山銀行', at: new Date().toISOString(), ok: true, okAt: new Date().toISOString(), accounts: [{ id: 'esun:dep:1234', name: '玉山臺幣 末四碼 1234', type: 'bank', currency: 'TWD', balance: 2500 }, { id: 'esun:card', name: '玉山信用卡', type: 'card', currency: 'TWD', balance: -1200, bill: { period: '2026-10', amount: 1200, due: '2026-11-30' } }], tx, ...extra } });
const base = (txs, bank, accts) => ({ accounts: accts || [{ id: 'esun', name: '玉山', type: 'bank', balance: 2500, bankLink: 'esun:dep:1234', bankFrom: '2026-10-01' }, { id: 'card', name: '玉山卡', type: 'card', balance: -1200, payFrom: 'esun' }, { id: 'cash', name: '錢包', type: 'cash', balance: 100 }], projects: [], budgets: [], loans: [], recurring: [], categories: [{ id: 'c1', name: '餐飲', kind: 'expense' }, bank], transactions: txs || [] });
const row = (id, date, amount, extra) => ({ id: 'esun:' + id, acct: 'esun:dep:1234', date, amount, currency: 'TWD', desc: '交易' + id, ...extra });

test('只讀隱藏的 __bank_ 記錄；同帳戶、同金額、前後 3 天、雙方唯一才自動對應', () => {
  const b = bundle(base([tx('t1', '2026-11-02', 300), tx('t2', '2026-11-05', 50), tx('t3', '2026-11-05', 50), tx('t4', '2026-11-20', 80, { account: 'cash' }), tx('t5', '2026-11-25', 999)],
    feed([row('a', '2026-11-01', -300), row('b', '2026-11-05', -50), row('c', '2026-11-20', -80), row('d', '2026-11-20', -999), row('e', '2026-11-10', 30000)])));
  assert.equal(b.J('bankFeeds().length'), 1);
  assert.deepEqual(b.J('bankAutoPairs().map(([i,t])=>[i.x.id,t.id])'), [['esun:a', 't1']], '兩筆 50 元分不出來；現金帳戶的不算；999 差 5 天');
  assert.equal(b.run('bankAutoMatch()'), 1); assert.equal(b.J('txById("t1").bankId'), 'esun:a');
  assert.deepEqual(b.J('bankTodo(bankItems()).map(i=>i.x.id)'), ['esun:b', 'esun:c', 'esun:d', 'esun:e']);
});
test('卡費繳款用轉帳的轉入方比對；未對應的帳戶不列入待處理；對帳起始日前的不列', () => {
  const card = { id: 'esun:k', acct: 'esun:card', date: '2026-11-15', amount: 1200, currency: 'TWD', desc: '繳款－謝謝' };
  const accts = [{ id: 'esun', name: '玉山', type: 'bank', balance: 2500, bankLink: 'esun:dep:1234', bankFrom: '2026-11-10' }, { id: 'card', name: '玉山卡', type: 'card', balance: 0, payFrom: 'esun', bankLink: 'esun:card' }];
  const b = bundle(base([{ id: 'p1', date: '2026-11-15', kind: 'transfer', amount: 1200, account: 'esun', toAccount: 'card', name: '繳卡費', tags: [] }], feed([card, row('old', '2026-11-01', -10), { ...row('x', '2026-11-12', -10), acct: 'other:1' }]), accts));
  assert.deepEqual(b.J('bankAutoPairs().map(([i,t])=>[i.x.id,t.id])'), [['esun:k', 'p1']]);
  assert.deepEqual(b.J('bankTodo(bankItems()).map(i=>i.x.id)'), ['esun:k'], '11/01 在對帳起始日前；other:1 沒有對應帳戶');
});
test('取消對應會記住「不是這筆」；已不存在的銀行明細不佔用記錄；略過會記在帳戶上', () => {
  const b = bundle(base([tx('t1', '2026-11-02', 300, { bankId: 'esun:gone' })], feed([row('a', '2026-11-01', -300), row('b', '2026-11-03', -20)])));
  assert.deepEqual(b.J('bankAutoPairs().map(([i,t])=>[i.x.id,t.id])'), [['esun:a', 't1']], 'bankId 指向的明細已經不在了，記錄可以再配對');
  b.run('bankAutoMatch()'); b.run("(()=>{const i=bankItemById('esun:a');delete i.t.bankId;i.t.bankNo=['esun:a']})()");
  assert.deepEqual(b.J('bankAutoPairs()'), []);
  b.run("(()=>{const i=bankItemById('esun:b');i.a.bankSkip=['esun:b']})()");
  assert.deepEqual(b.J('bankTodo(bankItems()).map(i=>i.x.id)'), ['esun:a']);
});
test('對應帳戶：建立新帳戶用銀行餘額、明天起對帳；改對應會移除舊的', () => {
  const b = bundle(base([], feed([]), [{ id: 'esun', name: '玉山', type: 'bank', balance: 0 }, { id: 'esun2', name: '玉山二', type: 'bank', balance: 0 }]));
  b.run("bankMap('esun:dep:1234','esun',bankFeeds()[0])"); assert.equal(b.J("acct('esun').bankLink"), 'esun:dep:1234'); assert.match(b.J("acct('esun').bankFrom"), /^\d{4}-\d{2}-\d{2}$/);
  b.run("bankMap('esun:dep:1234','esun2',bankFeeds()[0])"); assert.equal(b.J("acct('esun').bankLink ?? null"), null); assert.equal(b.J("acct('esun2').bankLink"), 'esun:dep:1234');
  const a = b.J("bankMap('esun:card','__new',bankFeeds()[0])");
  assert.equal(a.type, 'card'); assert.equal(a.balance, -1200); assert.equal(a.bankLink, 'esun:card'); assert.ok(a.bankFrom > new Date().toISOString().slice(0, 10));
});
test('餘額比對、帳單、同步失敗與待記帳的通知', () => {
  const b = bundle(base([], feed([row('a', '2026-11-20', -300)], { ok: false, need: true, error: '中國信託這次登入要在 App 確認' })));
  b.run('acctFuture=()=>new Map()');
  assert.match(b.run("bankAcctHTML(bankFeeds()[0],bankFeeds()[0].accounts[0],new Map())"), /✓ 餘額一致/);
  b.run("acct('esun').balance=2000"); assert.match(b.run("bankAcctHTML(bankFeeds()[0],bankFeeds()[0].accounts[0],new Map())"), /相差 \$500/);
  assert.match(b.run("bankAcctHTML(bankFeeds()[0],bankFeeds()[0].accounts[1],new Map())"), /本期帳單 \$1,200/);
  assert.deepEqual(b.J('bankNoticeList().map(x=>x.text)'), ['玉山銀行需要你處理', '1 筆銀行明細還沒記帳']);
  assert.match(b.run('bankNoticeHTML(bankNoticeList())'), /data-bank-open/);
});
test('記帳：支出帶入帳戶與日期，卡費繳款開成轉帳', () => {
  const accts = [{ id: 'esun', name: '玉山', type: 'bank', balance: 0, bankLink: 'esun:dep:1234', bankFrom: '2026-01-01' }, { id: 'card', name: '卡', type: 'card', balance: 0, payFrom: 'esun', bankLink: 'esun:card', bankFrom: '2026-01-01' }];
  const b = bundle(base([], feed([row('a', '2026-11-20', -300, { time: '12:30', party: '某餐廳' }), { id: 'esun:k', acct: 'esun:card', date: '2026-11-21', amount: 500, currency: 'TWD', desc: '自動轉帳扣繳' }]), accts));
  b.run('var __o=[];window.openTx=(k,v)=>__o.push([k,v]);sheetEl=()=>({hidden:false})');
  b.run("bankRecord(bankItemById('esun:a'));bankRecord(bankItemById('esun:k'))");
  const o = b.J('__o');
  assert.deepEqual([o[0][0], o[0][1].account, o[0][1].date, o[0][1].time, o[0][1].amount, o[0][1].merchant], ['expense', 'esun', '2026-11-20', '12:30', 300, '某餐廳']);
  assert.deepEqual([o[1][0], o[1][1].account, o[1][1].toAccount, o[1][1].amount], ['transfer', 'esun', 'card', 500]);
  assert.equal(b.J('window.__bankSave'), 'esun:k');
});
test('雲端來的文字一律跳脫，幣別只接受三個大寫字母', () => {
  const bad = '<img src=x onerror=alert(1)>';
  const f = feed([row('a', '2026-11-20', -300, { desc: bad, party: bad, time: bad, currency: bad })]);
  f.bank.accounts[1].bill.due = bad; f.bank.accounts[1].name = bad; f.bank.accounts[0].currency = bad;
  const b = bundle(base([], f)); b.run('acctFuture=()=>new Map()');
  const h = b.run("bankAcctHTML(bankFeeds()[0],bankFeeds()[0].accounts[1],new Map())+bankAcctHTML(bankFeeds()[0],bankFeeds()[0].accounts[0],new Map())+bankRowHTML(bankItems()[0],'todo')+bankNoticeHTML(bankNoticeList())");
  assert.ok(!h.includes('<img'), h);
});
test('頁面接上：更多選單、通知中心、儲存後回寫對應', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(html, /id="moreBank"[\s\S]*銀行同步/); assert.match(app, /window\.__bankSave&&typeof bankAfterSave==='function'\)bankAfterSave\(\)/);
  assert.match(fs.readFileSync(path.join(root, 'js', 'notify.js'), 'utf8'), /bankNoticeList/);
});
