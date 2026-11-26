// 電子發票頁 (V26.115) tests
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: '現金', balance: 0 }], projects: [], budgets: [], loans: [], recurring: [], transactions: [], categories: [] });
const fresh = () => { const b = bundle(st()); b.run("window.__inv={list:[{no:'AB12345678',code:'1234',date:'2026-11-07',total:90,seller:'11111111',sellerName:'某某股份有限公司某分公司',carrier:'手機條碼',items:[['停車',1,90]]},{no:'CD12345678',code:'',date:'2026-11-05',total:50,items:[],hidden:true}],win:{}};prefs=()=>({});inboxTouch=()=>{}"); return b; };
test('期別、條碼內容、發票來源、開獎狀態', () => {
  const b = fresh();
  assert.equal(b.run("invRoc('2026-11')"), '115 年 11 － 12 月');
  assert.equal(b.run("invBarcode(invDb().list[0])"), '11512AB123456781234');
  assert.equal(b.run("invSource(invDb().list[0])"), '手機條碼'); assert.equal(b.run("invSource(invDb().list[1])"), '手動輸入');
  assert.equal(b.run("invPrizeText(invDb().list[0],null)"), '尚未開獎');
  assert.equal(b.run("invPrizeText(invDb().list[0],{special:'00000000',grand:'00000000',first:['99945678']})"), '四獎');
  assert.equal(b.run("invPrizeText(invDb().list[0],{special:'00000000',grand:'00000000',first:['11111111']})"), '未中獎');
});
test('隱藏的發票不算進未歸帳，也不會一次記帳', () => {
  const b = fresh();
  assert.equal(b.run("invVisible(invAll('2026-11')).length"), 1);
  assert.deepEqual(b.J("invBulkList().map(x=>x.no)"), ['AB12345678']);
});
test('歸帳時保留商家名稱、地址與來源', () => {
  const b = fresh(); b.run("state.transactions.push({id:'t',kind:'expense',amount:90,date:'2026-11-07',name:'停車',account:'a'});invLink(invDb().list[0],state.transactions[0],'')");
  assert.equal(b.run("state.transactions[0].invoices[0].sellerName"), '某某股份有限公司某分公司'); assert.equal(b.run("state.transactions[0].invoices[0].carrier"), '手機條碼');
});
