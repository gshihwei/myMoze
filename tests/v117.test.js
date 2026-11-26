// 發票同步 (V26.117) tests
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [], categories: [] });
const fresh = (user) => { const b = bundle(st()); b.run(`window.__inv={list:[],win:{}};window.__drafts={list:[],rules:{},accts:{},recent:[],seq:0};var __P={};prefs=()=>__P;prefSyncUser=()=>${JSON.stringify(user)};save=async()=>{};draftDb=()=>window.__drafts;draftStore=()=>{};invStore=()=>{}`); return b; };
test('登入後就同步，不必開偏好同步；關掉「同步發票」就不同步', () => {
  const b = fresh('u1'); assert.equal(b.run('inboxOn()'), true); assert.equal(b.run('prefs().prefSync'), undefined);
  b.run("invDb().list.push({no:'AB12345678',date:'2026-11-07',total:90,items:[],at:1})"); assert.equal(b.run('inboxPush()'), true);
  assert.equal(b.run("state.categories.find(c=>c.id==='__inbox__').data.invoices.length"), 1);
  b.run('prefs().invSync=false'); assert.equal(b.run('inboxOn()'), false);
  assert.equal(fresh('').run('inboxOn()'), false);
});
test('另一台裝置拿到雲端的發票', () => {
  const a = fresh('u1'); a.run("invDb().list.push({no:'AB12345678',date:'2026-11-07',total:90,items:[],at:1});inboxPush()");
  const rec = a.J("state.categories.find(c=>c.id==='__inbox__')");
  const b = fresh('u1'); b.run(`state.categories.push(${JSON.stringify(rec)});inboxPull()`); assert.deepEqual(b.J('invDb().list.map(x=>x.no)'), ['AB12345678']);
});
test('同一張發票以最後修改的為準（例如另一台隱藏了）', () => {
  const b = fresh('u1'); const m = b.J("inboxMerge({invoices:[{no:'AB12345678',at:1}]},{invoices:[{no:'AB12345678',at:1,hidden:true,mt:5}]})");
  assert.equal(m.invoices[0].hidden, true);
  const m2 = b.J("inboxMerge({invoices:[{no:'AB12345678',at:1,mt:9}]},{invoices:[{no:'AB12345678',at:1,hidden:true,mt:5}]})"); assert.equal(m2.invoices[0].hidden, undefined);
});
test('換別的帳號登入，這台的發票不會帶過去', () => {
  const b = fresh('u1'); b.run("inboxOn();invDb().list.push({no:'AB12345678',at:1})"); b.run("prefSyncUser=()=>'u2'"); assert.equal(b.run('inboxOn()'), true); assert.equal(b.run('invDb().list.length'), 0);
});
