// 參考 ALL SET 的功能 (V26.125) tests: item search, auto-matching, category rules, funding check, download results.
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const tx = (id, date, amount, extra) => ({ id, date, kind: 'expense', amount, account: 'cash', category: 'c1', name: 'x' + id, tags: [], ...extra });
const base = (txs, extra) => ({ accounts: [{ id: 'cash', name: '錢包', type: 'cash', balance: 1000 }, { id: 'bank', name: '玉山', type: 'bank', balance: 3000 }], projects: [], budgets: [], loans: [], recurring: [], categories: [{ id: 'c1', name: '飲料', kind: 'expense' }, { id: 'c2', name: '電信', kind: 'expense' }, { id: 'c3', name: '交通', kind: 'expense' }, { id: 'c4', name: '其他', kind: 'expense' }], transactions: txs || [], ...extra });
const pool = list => `window.__inv={list:${JSON.stringify(list)},win:{}};invStore=()=>{};inboxTouch=()=>{};inboxGone=()=>{};var __P={};prefs=()=>__P;`;

test('品項搜尋：已歸帳與未歸帳的發票都找得到，列出單價並比價', () => {
  const b = bundle(base([tx('t1', '2026-11-01', 120, { invoices: [{ no: 'AB00000001', date: '2026-11-01', total: 120, items: [['燕麥拿鐵', 2, 60]] }] })]));
  b.run(pool([{ no: 'AB00000002', date: '2026-11-10', total: 65, sellerName: '某咖啡股份有限公司', items: [['燕麥拿鐵', 1, 65], ['塑膠袋', 1, 1]] }]));
  const l = b.J("invItemHits('拿鐵').map(x=>[x.date,x.qty,x.price,x.amount,!!x.tx])");
  assert.deepEqual(l, [['2026-11-10', 1, 65, 65, false], ['2026-11-01', 2, 60, 120, true]]);
  const h = b.run("fvPriceHTML('拿鐵')"); assert.match(h, /買過 <b>2<\/b> 次・共 <b>3<\/b> 件/); assert.match(h, /最低 <b class="income-text">\$60/); assert.match(h, /最高 <b class="expense-text">\$65/);
  assert.equal(b.run("fvHit(state.transactions[0],'拿鐵','item')"), true); assert.equal(b.run("fvHit(state.transactions[0],'拿鐵','all')"), true);
  assert.equal(b.J("fvFields().map(x=>x[0]).includes('item')"), true);
  assert.match(b.run("fvItemLines(state.transactions[0],'拿鐵')"), /燕麥拿鐵　2 × \$60 ＝ \$120/);
});
test('自動配對：同一天同金額、雙方都唯一才配；已有發票、分攤、多筆同額都不配', () => {
  const b = bundle(base([tx('t1', '2026-11-01', 90), tx('t2', '2026-11-02', 50), tx('t3', '2026-11-02', 50), tx('t4', '2026-11-03', 30, { invoiceNo: 'ZZ00000009' }), tx('t5', '2026-11-04', 70, { note: '自己的備註' })]));
  b.run(pool([{ no: 'AB00000001', date: '2026-11-01', total: 90, items: [['便當', 1, 90]] }, { no: 'AB00000002', date: '2026-11-02', total: 50, items: [] }, { no: 'AB00000003', date: '2026-11-03', total: 30, items: [] }, { no: 'AB00000004', date: '2026-11-04', total: 70, items: [['咖啡', 1, 70]] }, { no: 'AB00000005', date: '2026-11-05', total: 10, items: [], hidden: true }]));
  assert.deepEqual(b.J('invAutoPairs().map(([i,t])=>[i.no,t.id])'), [['AB00000001', 't1'], ['AB00000004', 't5']]);
  const m = b.J('invAutoMatch()'); assert.deepEqual(m, [{ no: 'AB00000001', tx: 't1' }, { no: 'AB00000004', tx: 't5' }]);
  assert.equal(b.J("state.transactions[0].invoiceNo"), 'AB00000001'); assert.match(b.J('state.transactions[0].note'), /便當/);
  assert.equal(b.J('state.transactions[4].note'), '自己的備註', '原本有備註就不動');
  assert.deepEqual(b.J('invDb().list.map(i=>i.no)'), ['AB00000002', 'AB00000003', 'AB00000005']);
});
test('取消連結後記住「不是同一筆」，不再自動配回去；手動候選照 ALL SET 規則', () => {
  const b = bundle(base([tx('t1', '2026-11-01', 90), tx('t2', '2026-10-20', 200), tx('t3', '2026-12-10', 200), tx('t4', '2026-10-01', 200), tx('t5', '2026-11-01', 75)]));
  b.run(pool([{ no: 'AB00000001', date: '2026-11-01', total: 90, items: [['便當', 1, 90]] }]));
  b.run('invAutoMatch()'); b.run("invUnlink(state.transactions[0],'AB00000001')");
  assert.deepEqual(b.J("invDb().list[0].sep"), ['t1']); assert.deepEqual(b.J('invAutoPairs()'), []);
  const inv = { date: '2026-11-01', total: 200 }, ok = id => b.run(`invCandOk(txById('${id}'),${JSON.stringify(inv)})`);
  assert.equal(ok('t2'), true, '發票日前 12 天、同金額（先刷卡後開票）'); assert.equal(ok('t3'), true, '後 39 天、同金額'); assert.equal(ok('t4'), false, '前 31 天'); assert.equal(ok('t5'), true, '同一天，金額可不同');
});
test('分類：電信、訂閱、交通的內建規則；同店名學習上次的分類', () => {
  const b = bundle(base([tx('t1', '2026-10-01', 80, { merchant: '路易莎', category: 'c3' })]));
  b.run("invShopName=n=>String(n||'').replace(/股份有限公司$/,'')");
  assert.equal(b.J("invGuessCat({items:[['月租費',1,499]],sellerName:'中華電信股份有限公司'})"), 'c2');
  assert.equal(b.J("invGuessCat({items:[['高鐵車票',1,1490]],sellerName:''})"), 'c3');
  assert.equal(b.J("invGuessCat({items:[['拿鐵',1,80]],sellerName:'路易莎股份有限公司'})"), 'c3', '同店名學到上次選的分類，優先於關鍵字');
  assert.equal(b.J("invGuessCat({items:[['拿鐵',1,80]],sellerName:'別家'})"), 'c1');
});
test('扣款帳戶：3 天內要扣的卡費與支出超過餘額時提醒，夠扣就不提醒', () => {
  const b = bundle(base([], { accounts: [{ id: 'bank', name: '玉山', type: 'bank', balance: 3000 }, { id: 'cc', name: '飛狗', type: 'card', balance: -5000, payFrom: 'bank' }, { id: 'cash', name: '錢包', type: 'cash', balance: 100 }] }));
  b.run(`acctFuture=()=>new Map();billNotices=()=>[{card:acct('cc'),owed:5000,due:'2026-11-28'},{card:acct('cc'),owed:999,due:'2026-12-20'}];
    upcomingNotices=()=>[{name:'房租',kind:'expense',amount:800,account:'bank',date:'2026-11-29'},{name:'薪水',kind:'income',amount:9e4,account:'bank',date:'2026-11-29'},{name:'訂閱',kind:'expense',amount:50,account:'cash',date:'2026-11-28'}]`);
  const r = b.J("payFundCheck('2026-11-27').map(g=>[g.account.id,g.need,g.balance,g.short,g.items.length])");
  assert.deepEqual(r, [['bank', 5800, 3000, 2800, 2], ['cash', 50, 100, 0, 1]]);
  assert.deepEqual(b.J("payShortList('2026-11-27').map(g=>g.account.id)"), ['bank']);
  assert.match(b.run("noticeFundHTML(payShortList('2026-11-27'))"), /玉山 餘額不足[\s\S]*飛狗 卡費[\s\S]*房租[\s\S]*還差 \$2,800/);
});
test('下載結果：記下新增與自動歸帳的發票，頁面上方可查看', () => {
  const b = bundle(base([tx('t1', '2026-11-01', 90)]));
  b.run(pool([{ no: 'AB00000002', date: '2026-11-02', total: 50, items: [] }]) + "var __ls={};einvLs=(k,v)=>{if(v===undefined)return __ls[k]||null;__ls[k]=v};invShop=(i,t)=>'店'+i.no.slice(-1)");
  b.run("state.transactions[0].invoices=[{no:'AB00000001',date:'2026-11-01',total:90,items:[]}];state.transactions[0].invoiceNo='AB00000001'");
  b.run("einvResultSave({addedNos:['AB00000002'],filledNos:[],oldest:'2026 年 11–12 月'},[{no:'AB00000001',tx:'t1'}])");
  assert.match(b.run('einvResultBar()'), /新增 1 張，自動歸帳 1 張/);
  const h = b.run('einvResultHTML()'); assert.match(h, /自動歸帳到「xt1」/); assert.match(h, /店2[\s\S]*未歸帳/);
  b.run("__ls['moze-einv-result'].seen=true"); assert.equal(b.run('einvResultBar()'), '');
});
