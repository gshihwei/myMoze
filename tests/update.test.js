// Service worker update prompt tests (V25.15). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inlinePath = path.join(require('node:os').tmpdir(), `moze-inline-${process.pid}.js`);
fs.writeFileSync(inlinePath, html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1]);
const swPath = path.join(root, 'sw.js');
const VERSION = fs.readFileSync(swPath, 'utf8').match(/moze-v([\d.]+)-shell/)[1];

test('新版本提示：頁面端與 service worker 端', async () => {
  // ---- page side
  function page(hadController){
    const L={},docL={},winL={};const body={children:[],appendChild(n){this.children.push(n)}};
    const reg={updates:0,update(){this.updates++;return Promise.resolve()}};
    const mkEl=()=>{const el={className:'',innerHTML:'',attrs:{},setAttribute(k,v){this.attrs[k]=v},remove(){body.children=body.children.filter(x=>x!==el)},
      btns:{},querySelector(sel){return this.btns[sel]||(this.btns[sel]={onclick:null})}};return el};
    let reloads=0, intervals=[];
    const ctx=vm.createContext({navigator:{serviceWorker:{controller:hadController?{}:null,addEventListener:(t,f)=>L[t]=f,register:()=>Promise.resolve(reg)}},
      location:{protocol:'https:',reload:()=>reloads++},document:{body,createElement:mkEl,addEventListener:(t,f)=>docL[t]=f,visibilityState:'visible'},
      window:{addEventListener:(t,f)=>winL[t]=f},setTimeout:(f)=>f(),setInterval:(f,ms)=>intervals.push(ms),String,Promise});
    vm.runInContext(fs.readFileSync(inlinePath,'utf8'),ctx);
    return {L,docL,winL,body,reg,get reloads(){return reloads},intervals};
  }
  const p=page(true);
  p.winL.load(); await new Promise(r=>setImmediate(r));
  p.docL.visibilitychange();
assert.equal(p.reg.updates,1,'checks on foreground');
  assert.equal(JSON.stringify(p.intervals),'[1800000]');
  p.L.message({data:{type:'moze-updated',version:VERSION}});
  p.L.controllerchange();
  assert.equal(p.body.children.length,1,'one banner only');
  const bar=p.body.children[0];
  assert.ok(bar.innerHTML.includes('V'+VERSION));
  bar.btns['.primary'].onclick(); assert.equal(p.reloads,1);
  bar.btns['.update-later'].onclick(); assert.equal(p.body.children.length,0);
  const first=page(false); first.L.controllerchange(); first.L.message({data:{type:'moze-updated',version:VERSION}});
  assert.equal(first.body.children.length,0,'no banner on first install');
  const evil=page(true); evil.L.message({data:{type:'moze-updated',version:'<img src=x>'}});
  assert.ok(!evil.body.children[0].innerHTML.includes('<img'));

  // ---- service worker side
  const SL={};const posted=[];let added=null,deleted=[];
  const sctx=vm.createContext({self:{addEventListener:(t,f)=>SL[t]=f,skipWaiting:()=>Promise.resolve(),
      clients:{claim:()=>Promise.resolve(),matchAll:()=>Promise.resolve([{postMessage:m=>posted.push(m)}])}},
    caches:{open:()=>Promise.resolve({addAll:r=>{added=r;return Promise.resolve()}}),keys:()=>Promise.resolve(['moze-v0-shell-v1',`moze-v${VERSION}-shell-v1`,'moze-fonts-v1']),delete:k=>{deleted.push(k);return Promise.resolve(true)}},
    Request:class{constructor(u,o){this.url=u;this.cache=o.cache}},location:{origin:'o'},URL,Promise});
  vm.runInContext(fs.readFileSync(swPath,'utf8'),sctx);
  let w;SL.install({waitUntil:x=>w=x});await w;
  assert.ok(added.length>5 && added.every(r=>r.cache==='reload'),'install bypasses HTTP cache');
  SL.activate({waitUntil:x=>w=x});await w;
  assert.equal(JSON.stringify(deleted),'["moze-v0-shell-v1"]');
  assert.equal(JSON.stringify(posted),JSON.stringify([{type:'moze-updated',version:VERSION}]));
});
