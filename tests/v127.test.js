// 銀行同步 (V26.127): every bank row visible before mapping, suggested mapping, adjust to the bank balance, refresh.
'use strict';
const { bundle, test, assert, fs, path, root } = require('./_bundle.js');
const feed = tx => ({ id: '__bank_esun__', kind: 'prefs', name: '銀行同步：玉山銀行', hidden: true, order: 1e9, bank: { v: 1, source: 'esun', name: '玉山銀行', at: new Date().toISOString(), ok: true, okAt: new Date().toISOString(),
  accounts: [{ id: 'esun:dep:5434', name: '玉山臺幣 末四碼 5434', type: 'bank', currency: 'TWD', balance: 21089 }, { id: 'esun:dep:3579:JPY', name: '玉山日圓', type: 'bank', currency: 'JPY', balance: 100031 }, { id: 'esun:card', name: '玉山信用卡', type: 'card', currency: 'TWD', balance: -29094 }], tx } });
const row = (id, acct, date, amount) => ({ id: 'esun:' + id, acct, date, amount, currency: 'TWD', desc: '交易' + id });
const base = (accts, txs) => ({ accounts: accts, projects: [], budgets: [], loans: [], recurring: [], transactions: txs || [], categories: [{ id: 'c1', name: '餐飲', kind: 'expense' },
  feed([row('a', 'esun:dep:5434', '2026-11-01', -100), row('b', 'esun:dep:5434', '2026-11-10', 500), row('c', 'esun:card', '2026-11-05', -80)])] });

test('還沒對應時「全部明細」列出每一筆銀行明細，新的在前，並標出狀態', () => {
  const b = bundle(base([{ id: 'x', name: '薪轉', type: 'bank', balance: 0 }]));
  assert.equal(b.J('bankAnyMapped()'), false);
  assert.deepEqual(b.J("bankNewest(bankItems()).map(i=>[i.x.id,bankKind(i)])"), [['esun:b', 'unmapped'], ['esun:c', 'unmapped'], ['esun:a', 'unmapped']]);
  b.run('acctFuture=()=>new Map()');
  const h = b.run("bankNewest(bankItems()).map(i=>bankRowHTML(i,'all')).join('')");
  assert.match(h, /bank-chip bank-unmapped">帳戶未對應/); assert.match(h, /交易b[\s\S]*交易c[\s\S]*交易a/); assert.doesNotMatch(h, /data-bank-rec/, '沒對應的帳戶不能記帳');
  assert.match(b.run("bankAcctHTML(bankFeeds()[0],bankFeeds()[0].accounts[0],new Map())"), /2 筆明細，選擇對應的帳小簿帳戶/);
  b.run("acct('x').bankLink='esun:dep:5434';acct('x').bankFrom='2026-11-05'");
  assert.deepEqual(b.J("bankNewest(bankItems()).map(i=>bankKind(i))"), ['todo', 'unmapped', 'early']);
  assert.match(b.run("bankRowHTML(bankItemById('esun:b'),'all')"), /data-bank-rec/);
});
test('建議對應：名稱有銀行名、同幣別、沒被對應；多個時用末四碼挑', () => {
  const b = bundle(base([{ id: 'x', name: '玉山薪轉', type: 'bank', balance: 0 }, { id: 'y', name: '玉山 5434', type: 'bank', balance: 0 }, { id: 'j', name: '玉山日幣', type: 'bank', currency: 'JPY', balance: 0 }, { id: 'k1', name: '玉山 Pi', type: 'card', balance: 0 }, { id: 'k2', name: '玉山 熊本熊', type: 'card', balance: 0 }]));
  const f = 'bankFeeds()[0]';
  assert.equal(b.J(`bankSuggest(${f},${f}.accounts[0])?.id`), 'y', '兩個「玉山」帳戶，末四碼 5434 挑中 y');
  assert.equal(b.J(`bankSuggest(${f},${f}.accounts[1])?.id`), 'j', '日圓只配日圓帳戶');
  assert.equal(b.J(`bankSuggest(${f},${f}.accounts[2])?.id ?? null`), null, '兩張玉山卡分不出來就不建議');
  b.run("acct('y').bankLink='esun:card'"); assert.equal(b.J(`bankSuggest(${f},${f}.accounts[0])?.id`), 'x', '已對應別的的帳戶不算');
});
test('調成銀行餘額：記一筆餘額調整補上差額', () => {
  const b = bundle(base([{ id: 'y', name: '玉山', type: 'bank', balance: 20000, bankLink: 'esun:dep:5434', bankFrom: '2026-12-01' }]));
  b.run('acctFuture=()=>new Map()');
  assert.equal(b.J("bankDiff(acct('y'),bankFeeds()[0].accounts[0])"), 1089);
  assert.match(b.run("bankAcctHTML(bankFeeds()[0],bankFeeds()[0].accounts[0],new Map())"), /data-bank-adj="esun:dep:5434"/);
  b.run("acctAdjustTo(acct('y'),Number(acct('y').balance)+bankDiff(acct('y'),bankFeeds()[0].accounts[0]),'','銀行同步對帳')");
  assert.equal(b.J("acct('y').balance"), 21089); assert.equal(b.J("bankDiff(acct('y'),bankFeeds()[0].accounts[0])"), 0);
  assert.match(b.run("bankAcctHTML(bankFeeds()[0],bankFeeds()[0].accounts[0],new Map())"), /✓ 餘額一致/);
  assert.equal(b.J("bankDiff(acct('y'),bankFeeds()[0].accounts[1])"), null, '幣別不同不比');
});
test('開啟頁面時先拉雲端資料，有對應時開在待處理', async () => {
  const b = bundle(base([{ id: 'y', name: '玉山', type: 'bank', balance: 0 }]));
  b.run("var __n=0,__tabs=[];window.MozeSync={isLoggedIn:()=>true,syncNow:async()=>{__n++;acct('y').bankLink='esun:dep:5434';acct('y').bankFrom='2026-01-01'}};sheetEl=()=>({hidden:true});renderBank=()=>__tabs.push(window.__bank.tab);save=async()=>{};render=()=>{};toast=()=>{}");
  await b.run('openBank()');
  assert.equal(b.J('__n'), 1); assert.deepEqual(b.J('__tabs'), ['all', 'todo'], '先開在全部明細，拉到對應後換到待處理');
  b.run("window.__bank.picked=true;window.__bank.tab='skip'"); await b.run('openBank()'); assert.equal(b.J('window.__bank.tab'), 'skip', '自己選過的分頁不改');
});
test('沒有銀行資料時說明這台裝置讀哪個雲端帳號；畫面更新時銀行頁也跟著更新', () => {
  const b = bundle({ accounts: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [], categories: [] });
  b.run("window.MozeSync={isLoggedIn:()=>false}"); assert.match(b.run('bankSetupHTML()'), /還沒登入雲端同步/);
  b.run("window.MozeSync={isLoggedIn:()=>true,offline:()=>true}"); assert.match(b.run('bankSetupHTML()'), /離線模式/);
  b.run("window.MozeSync={isLoggedIn:()=>true,offline:()=>false,account:()=>'me<b>@x.tw',lastSyncAt:()=>new Date().toISOString()}");
  const h = b.run('bankSetupHTML()'); assert.match(h, /me&lt;b&gt;@x\.tw/); assert.match(h, /node cli\.mjs status/); assert.match(h, /data-bank-refresh/);
  assert.match(fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8'), /renderAccounts\(\);if\(typeof renderBank==='function'\)renderBank\(\);/);
  assert.match(fs.readFileSync(path.join(root, 'js', 'sync.js'), 'utf8'), /account:\(\)=>String\(state\.user\?\.email\|\|''\)/);
});
test('銀行可以收合（只記在這台裝置），收合時顯示帳戶數', () => {
  const b = bundle(base([{ id: 'x', name: '薪轉', type: 'bank', balance: 0 }]));
  b.run("var __ls={};localStorage={getItem:k=>__ls[k]??null,setItem:(k,v)=>{__ls[k]=String(v)}}");
  assert.deepEqual(b.J('bankFolded()'), []); assert.equal(b.J("bankFold('esun')"), true); assert.deepEqual(b.J('bankFolded()'), ['esun']);
  assert.equal(b.J("bankFold('esun')"), false); assert.deepEqual(b.J('bankFolded()'), []);
  const js = fs.readFileSync(path.join(root, 'js', 'bank-feed.js'), 'utf8'); assert.match(js, /data-bank-fold=/); assert.match(js, /個帳戶\$\{open \? `，\$\{open\} 個還沒對應`/);
  const css = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8'); assert.match(css, /\.bank-map select,\.bank-from input\{color-scheme:dark;background:#101f2e/);
});
