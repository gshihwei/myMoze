import { svg, accountIcon, svgForAccount } from './icons.js';

// V26.62 MOZE-style entry sheet: tabs, category bubbles, calculator, common accounts.
// Pure helpers (calculator, presets, loans) live in js/entry-moze.js.
(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PALETTE=['#e8c88c','#3f86e6','#9a63c9','#d4706e','#aaa88f','#e24c4c','#40648e','#d99ac9','#6f8f5e','#f5a623'];
  const COLOR={income:'#c9a35a',transfer:'#d98a3d',system:'#d98a3d',receivable:'#7dd8c6',payable:'#d05c82'};
  let tab='expense',preset='',expr='',exprIn='',side='out',pick='out',inTouched=false,prevTab='expense',keepCat={},tfKeep=null;
  const isTf=()=>tab==='transfer';
  const form=()=>$('txForm'),input=()=>$('amountInput');
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const isLoanTab=()=>tab==='receivable'||tab==='payable';
  const curKind=()=>document.querySelector('input[name="kind"]:checked')?.value||'expense';
  function setKind(k){const r=document.querySelector(`input[name="kind"][value="${k}"]`);if(!r)return;r.checked=true;if(typeof updateKind==='function')updateKind();}
  function f(n){return form()?.elements?.[n];}

  // ---- amount / calculator ----
  function feeVal(){return Math.max(0,Number($('entryFee')?.value||0));}
  function discVal(){return isLoanTab()?0:Math.max(0,Number($('entryDiscount')?.value||0));}
  function applyExpr(){
    const v=entryCalcEval(expr),ok=v!==null&&v>0,inp=input();
    if(inp){inp.value=ok?String(v):'';inp.dispatchEvent(new Event('input',{bubbles:true}));}
    const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:4});
    if($('amountDisplay'))$('amountDisplay').textContent=entryCalcDisplay(expr)||'0';
    if(isTf())tfRender(ok?v:0);
    const m=$('entryAmountMirror');if(m){m.textContent=ok?fmt(v):'金額';m.classList.toggle('filled',ok);}
    if($('entryTotal'))$('entryTotal').textContent=fmt(Math.max(0,(ok?v:0)+(isLoanTab()?0:(curKind()==='income'?-(feeVal()-discVal()):(feeVal()-discVal())))));
  }
  function tfAcc(which){return state.accounts.find(a=>String(a.id)===String($(which==='in'?'formToAccount':'formAccount')?.value));}
  function tfRender(v){
    const box=$('tfBox'),a=tfAcc('out'),b=tfAcc('in');if(!box)return;
    const fmt=n=>Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:6});
    if(!inTouched){const c=a&&b&&v?tfConvert(v,a,b):null;exprIn=c?String(c):'';}
    const vin=entryCalcEval(exprIn)||0,ta=f('toAmount');if(ta)ta.value=a&&b?tfToAmount(v,vin,a,b):'';
    const proj=id=>{const o=$(id);return `<select class="tf-proj" data-tf-proj="${id}" aria-label="專案">${o?o.innerHTML:''}</select>`;};
    const acc=(x,w)=>`<div class="tf-acc${pick===w?' on':''}"><button type="button" class="tf-ico" data-tf-pick="${w}" aria-label="${w==='out'?'轉出帳戶':'轉入帳戶'}">${x?svgForAccount(x):'?'}</button><b>${x?acctName(x):'選擇帳戶'}</b><span class="tf-bal ${x&&x.balance<0?'expense-text':'income-text'}">${x?acctMoney(x.balance,x):''}${w==='out'&&x&&x.balance>0?' <button type="button" class="tf-all" data-tf-all title="轉出全部餘額" aria-label="轉出全部餘額">⤓</button>':''}</span>${proj(w==='out'?'formProject':'formToProject')}</div>`;
    const amt=(w,lab,x,txt)=>`<button type="button" class="tf-amt ${w}${side===w?' on':''}" data-tf-side="${w}"><small>${lab}</small><span><i>${x?esc(acctCur(x)):'TWD'}</i><b>${esc(txt||'0')}</b></span></button>`;
    const rate=v>0&&vin>0?Math.round(vin/v*1e6)/1e6:(a&&b?(acctCur(a)===acctCur(b)?1:fxPair(acctCur(a),acctCur(b))||''):'');
    const keep=document.activeElement?.id==='tfRate';
    if(keep){box.querySelector('.tf-amt.in b').textContent=entryCalcDisplay(exprIn)||'0';}
    else box.innerHTML=`<div class="tf-head">${acc(a,'out')}<button type="button" class="tf-swap" id="entrySwap" aria-label="轉出轉入對調">⇄</button>${acc(b,'in')}</div><div class="tf-amts">${amt('out','轉出金額',a,entryCalcDisplay(expr))}${amt('in','轉入金額',b,entryCalcDisplay(exprIn))}</div><label class="entry-field tf-rate"><span class="entry-lbl">匯率</span><input id="tfRate" type="number" min="0" step="any" inputmode="decimal" value="${rate===''?'':Number(rate.toPrecision(8))}"></label>${rate===''?'<small class="hint">沒有線上匯率，請直接輸入轉入金額或匯率。</small>':''}`;
    box.querySelectorAll('select.tf-proj').forEach(x=>{x.value=$(x.dataset.tfProj)?.value||'';});
    if($('tfInDisplay'))$('tfInDisplay').textContent=entryCalcDisplay(exprIn)||'0';
    if($('tfInTotal'))$('tfInTotal').textContent=fmt(Math.max(0,vin-Number(f('toFee')?.value||0)+Number(f('toDiscount')?.value||0)));
    $('entrySide')?.classList.toggle('tf-side-in',side==='in');document.querySelector('.entry-calc-card')?.classList.toggle('tf-active',side==='out');$('tfInCard')?.classList.toggle('tf-active',side==='in');
    if($('entryAcctTitle'))$('entryAcctTitle').textContent=pick==='in'?'轉入帳戶':'轉出帳戶';
  }
  function tfSet(which,id){const s=$(which==='in'?'formToAccount':'formAccount'),o=$(which==='in'?'formAccount':'formToAccount');if(!s||id===undefined)return;const old=s.value;if(o&&String(o.value)===String(id))o.value=old;s.value=id;s.dispatchEvent(new Event('change',{bubbles:true}));inTouched=false;applyExpr();}
  function tfPreset(name){const c=entryEnsureCategory(state,name,'transfer'),d=(entryPresets().transfer||[]).find(p=>p.name===name);if(d&&c.icon==='🏷️')c.icon=d.icon;fillCategorySelect(c.id);}
  window.entryTransferStart=function(o){
    setTab('transfer');preset=o.preset||'轉帳';tfPreset(preset);const d=tfDefaults(state,preset,o);
    if(d.from!==undefined)$('formAccount').value=d.from;if(d.to!==undefined)$('formToAccount').value=d.to;
    $('formAccount').dispatchEvent(new Event('change',{bubbles:true}));const nm=f('name');if(nm&&!nm.value){nm.value=preset;nm.dataset.auto='1';}
    renderPresets();refresh();
  };
  document.addEventListener('click',e=>{
    const s=e.target.closest('[data-tf-side]');if(s){side=s.dataset.tfSide;$('entrySide')?.classList.add('open');applyExpr();return;}
    const p=e.target.closest('[data-tf-pick]');if(p){pick=p.dataset.tfPick;$('entrySide')?.classList.add('open');renderAccounts();applyExpr();sync();$('entryAcctTitle')?.scrollIntoView({block:'nearest'});$('accountChoices')?.scrollIntoView({block:'nearest'});return;}
    if(e.target.closest('[data-tf-all]')){const a=tfAcc('out');if(a){expr=String(Math.max(0,a.balance-feeVal()+discVal()));side='out';applyExpr();}return;}
    if(e.target.closest('#tfInReset')){inTouched=false;exprIn='';applyExpr();return;}
  });
  document.addEventListener('change',e=>{const x=e.target;if(x?.dataset?.tfProj){const o=$(x.dataset.tfProj);if(o)o.value=x.value;}});
  document.addEventListener('input',e=>{if(e.target?.id==='tfRate'){const r=Number(e.target.value),v=entryCalcEval(expr)||0;if(r>0&&v>0){inTouched=true;const b=tfAcc('in');exprIn=String(curRound(v*r,acctCur(b)));applyExpr();}}if(e.target?.name==='toFee'||e.target?.name==='toDiscount')applyExpr();});
  function press(k){
    if(isTf()&&side==='in'&&k!=='ok'){if(k==='enter'){const v=entryCalcEval(exprIn);if(v>0)exprIn=String(v);}else{exprIn=entryCalcKey(inTouched||entryOps().includes(k)||k==='back'?exprIn:'',k);}inTouched=true;applyExpr();return;}
    if(k==='enter'||k==='ok'){const v=entryCalcEval(expr);if(v!==null&&v>0&&entryHasOp(expr))expr=String(v);applyExpr();if(k==='ok')form()?.requestSubmit?.();return;}
    expr=entryCalcKey(expr,k);applyExpr();
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('#amountKeypad button[data-key]');if(b){press(b.dataset.key);return;}
    if(e.target.closest('#entryReset')){expr='';applyExpr();return;}
    const rn=e.target.closest('[data-rename-btn]');if(rn){const k=rn.dataset.renameBtn,lab=document.querySelector(`[data-rename=${k}]`),hid=$(k==='fee'?'entryFeeName':'entryDiscountName');const cur=lab?.textContent||'';const nv=prompt('欄位名稱（例如：運費、滿千送百）',cur);if(nv!==null){const dflt=k==='fee'?'手續費':'折扣',t=nv.trim().slice(0,12)||dflt;if(lab)lab.textContent=t;if(hid)hid.value=t===dflt?'':t;}return;}
    if(e.target.closest('#entryAmountRow')&&!e.target.closest('select'))$('entrySide')?.classList.toggle('open');
  });
  document.addEventListener('keydown',e=>{
    if(!$('modalBg')?.classList.contains('open')||e.ctrlKey||e.metaKey||e.altKey)return;
    const tg=e.target,tag=tg?.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||tg?.isContentEditable)return;
    let k=null;if(/^[0-9]$/.test(e.key))k=e.key;else if(e.key==='.')k='.';else if('+-*/'.includes(e.key)&&e.key.length===1)k=e.key;else if(e.key==='Backspace')k='back';else if(e.key==='Delete')k='clear';else if(e.key==='Enter'&&entryHasOp(expr))k='enter';
    if(k){e.preventDefault();press(k);}
  });
  document.addEventListener('input',e=>{if(e.target?.id==='entryFee'||e.target?.id==='entryDiscount')applyExpr();if(e.target?.name==='name'&&e.isTrusted)delete e.target.dataset.auto;});

  // ---- categories / presets / accounts ----
  function colorFor(c,mains,kind){const own=c.color||(c.parentId&&mains.find(x=>String(x.id)===String(c.parentId))?.color);if(/^#[0-9a-f]{6}$/i.test(own||''))return own;if(kind==='income')return COLOR.income;const main=c.parentId?mains.find(x=>String(x.id)===String(c.parentId))||c:c;const i=mains.findIndex(x=>String(x.id)===String(main.id));return PALETTE[(i<0?0:i)%PALETTE.length];}
  function iconHTML(c){return (typeof iconPaths!=='undefined'&&iconPaths[c.id])?svg(c.id):`<span class="emoji">${esc(c.icon||'🏷️')}</span>`;}
  function fillCategorySelect(prev){
    const cs=$('formCategory');if(!cs)return;
    const kind=curKind(),ordered=typeof catOrdered==='function'?catOrdered():state.categories;
    const list=ordered.filter(c=>(c.kind||'expense')===kind||(kind==='transfer'&&!c.kind));
    cs.innerHTML=list.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    const want=prev!==undefined?prev:cs.dataset.keep;
    if(want!==undefined&&list.some(c=>String(c.id)===String(want)))cs.value=want;else cs.value=list[0]?.id||'';
    delete cs.dataset.keep;
  }
  function renderCats(){
    const cc=$('categoryChoices'),sub=$('categorySubs');if(!cc)return;
    const kind=curKind(),ordered=typeof catOrdered==='function'?catOrdered():state.categories;
    const mains=ordered.filter(c=>!c.parentId&&(c.kind||'expense')===kind);
    const cur=ordered.find(c=>String(c.id)===String($('formCategory')?.value));
    const list=(tab==='suggest'?entrySuggest(state,today(),10):mains).filter(c=>catVisible(c)&&modeAllows('categories',c.parentId||c.id));
    const chip=(c,small)=>{const on=cur&&String(cur.id)===String(c.id);return `<button type="button" class="entry-cat${on?' active':''}${small?' small':''}" data-cat="${c.id}"><span class="entry-bubble" style="background:${colorFor(c,mains,c.kind||kind)}">${iconHTML(c)}</span><span class="entry-cat-name">${esc(c.name)}</span></button>`;};
    cc.innerHTML=list.map(c=>chip(c)).join('');
    const mainOfCur=cur?(cur.parentId?ordered.find(x=>String(x.id)===String(cur.parentId)):cur):null;
    const subs=mainOfCur?ordered.filter(c=>String(c.parentId)===String(mainOfCur.id)&&catVisible(c)):[];
    if(sub)sub.innerHTML=subs.length?`<div class="entry-subs-title">${esc(mainOfCur.name)}</div><div class="entry-grid">${subs.map(c=>chip(c,true)).join('')}</div>`:'';
  }
  function renderPresets(){
    const box=$('entryPresets');if(!box)return;
    const defs=entryPresets()[tab]||[],col=COLOR[tab]||COLOR.transfer;
    box.innerHTML=defs.map(p=>`<button type="button" class="entry-cat${preset===p.name?' active':''}" data-preset="${esc(p.name)}"><span class="entry-bubble" style="background:${col}"><span class="emoji">${p.icon}</span></span><span class="entry-cat-name">${esc(p.name)}</span></button>`).join('');
  }
  function renderAccounts(){
    const box=$('accountChoices'),sel=$('formAccount');if(!box||!sel)return;
    const present=new Set(Array.from(sel.options).map(o=>o.value));
    let list=entryAccountsByUse(state).filter(a=>present.has(String(a.id))&&modeAllows('accounts',a.id));
    if(tab==='payable')list=list.filter(a=>a.type!=='card');
    if(isTf())list=list.filter(a=>String(a.id)!==String($(pick==='in'?'formAccount':'formToAccount')?.value));
    if(isLoanTab()&&!list.some(a=>String(a.id)===String(sel.value))&&list[0])sel.value=list[0].id;
    box.innerHTML=list.map(a=>`<button type="button" class="entry-acct" data-acct="${a.id}"><span class="entry-acct-ico">${svgForAccount(a)}</span><span>${esc(typeof acctName==='function'?acctName(a):a.name)}</span></button>`).join('');
    const a=state.accounts.find(x=>String(x.id)===String(sel.value));
    if(typeof fxSyncUI==='function')fxSyncUI();
  }
  function sync(){
    const sel=isTf()&&pick==='in'?$('formToAccount'):$('formAccount');
    document.querySelectorAll('#accountChoices .entry-acct').forEach(b=>b.classList.toggle('active',!!sel&&String(sel.value)===String(b.dataset.acct)));
    const cs=$('formCategory');
    document.querySelectorAll('#categoryChoices .entry-cat,#categorySubs .entry-cat').forEach(b=>b.classList.toggle('active',!!cs&&String(cs.value)===String(b.dataset.cat)));
    document.querySelectorAll('#entryTabs [data-etab-btn]').forEach(b=>{const on=b.dataset.etabBtn===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');});
  }
  function refresh(){
    if(!$('categoryChoices')||typeof state==='undefined')return;
    const cs=$('formCategory'),prev=cs?.value,ck=state.categories.find(c=>String(c.id)===String(prev))?.kind||'expense';
    fillCategorySelect(ck===curKind()?prev:(keepCat[curKind()]??prev));renderCats();renderPresets();renderAccounts();sync();applyExpr();
  }
  // Leaving 轉帳 (or any type) never loses what was typed: the amount stays, automatic names are dropped, each type remembers its own category,
  // and the transfer accounts / preset come back when you return.
  function leaveTab(t){
    if(t===tab)return;const cs=$('formCategory'),nm=f('name');
    if(cs&&cs.value)keepCat[curKind()]=cs.value;
    if(nm&&nm.dataset.auto==='1'){nm.value='';delete nm.dataset.auto;}
    if(isTf()){if(!(entryCalcEval(expr)>0)&&entryCalcEval(exprIn)>0)expr=exprIn;tfKeep={preset,to:$('formToAccount')?.value,exprIn,inTouched};const ta=f('toAmount');if(ta)ta.value='';exprIn='';inTouched=false;}
    prevTab=tab;
  }
  function setTab(t){
    leaveTab(t);
    tab=t;preset='';side='out';pick='out';const st=$('entrySideTitle');if(st)st.textContent=t==='transfer'?'轉出金額':'金額';if(t!=='transfer'&&$('entryAcctTitle'))$('entryAcctTitle').textContent='常用帳戶';const bg=$('modalBg');if(bg)bg.dataset.etab=t;
    if(t==='expense'||t==='income'||t==='transfer')setKind(t);else if(t!=='suggest')setKind('expense');
    if(t==='transfer'){const k=tfKeep;preset=k?.preset||'轉帳';if(k?.inTouched){exprIn=k.exprIn;inTouched=true;}if(k?.to&&$('formToAccount'))$('formToAccount').value=k.to;tfPreset(preset);{const nm=f('name');if(nm&&!nm.value){nm.value=preset;nm.dataset.auto='1';}}const o=$('formAccount'),i=$('formToAccount');if(o&&i&&o.value===i.value){const d=tfDefaults(state,'轉帳',{from:o.value});if(d.to!==undefined)i.value=d.to;}}
    refresh();
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('#entryBack')){setTab(prevTab&&prevTab!==tab&&(prevTab==='suggest'||prevTab==='expense'||prevTab==='income')?prevTab:'expense');return;}
    const tb=e.target.closest('#entryTabs [data-etab-btn]');if(tb){setTab(tb.dataset.etabBtn);return;}
    const cb=e.target.closest('#categoryChoices [data-cat],#categorySubs [data-cat]');
    if(cb){
      const c=state.categories.find(x=>String(x.id)===String(cb.dataset.cat));
      if(c&&tab==='suggest'&&(c.kind||'expense')!==curKind()){setKind(c.kind||'expense');fillCategorySelect(undefined);}
      const cs=$('formCategory');if(cs){cs.value=cb.dataset.cat;cs.dispatchEvent(new Event('change',{bubbles:true}));}
      renderCats();sync();return;
    }
    const pb=e.target.closest('#entryPresets [data-preset]');
    if(pb){
      const name=pb.dataset.preset,def=(entryPresets()[tab]||[]).find(p=>p.name===name);preset=name;
      const nm=f('name');if(nm&&(!nm.value||nm.dataset.auto==='1')&&tab!=='receivable'&&tab!=='payable'){nm.value=name;nm.dataset.auto='1';}
      if(tab==='transfer'&&def){tfPreset(name);const d=tfDefaults(state,name);if((name==='提款'||name==='存款')&&d.from!==undefined&&d.to!==undefined){$('formAccount').value=d.from;$('formToAccount').value=d.to;renderAccounts();}applyExpr();}
      if(tab==='system'&&def){const k=def.kind||'expense';setKind(k);const c=entryEnsureCategory(state,name,k);fillCategorySelect(c.id);}
      renderPresets();sync();return;
    }
    const ab=e.target.closest('#accountChoices [data-acct]');
    if(ab&&isTf()){tfSet(pick,ab.dataset.acct);pick=pick==='out'?'in':'out';renderAccounts();sync();applyExpr();return;}
    if(ab){const s=$('formAccount');if(s){s.value=ab.dataset.acct;s.dispatchEvent(new Event('change',{bubbles:true}));}renderAccounts();sync();}
  });
  $('formAccount')?.addEventListener('change',()=>{renderAccounts();sync();if(isTf())applyExpr();});
  $('formToAccount')?.addEventListener('change',()=>{if(isTf()){renderAccounts();sync();applyExpr();}});
  document.querySelectorAll('input[name="kind"]').forEach(r=>r.addEventListener('change',()=>setTimeout(()=>{if(tab==='expense'||tab==='income'||tab==='transfer'){if(tab!==curKind())tab=curKind();}refresh();},0)));
  $('formCategory')?.addEventListener('change',()=>{renderCats();sync();});

  // ---- submit: 應收／應付 tabs create loans; everything else falls through to submitTx ----
  window.entryHandleSubmit=async function(fd){
    if(!isLoanTab())return false;
    const r=entryPostLoan(state,{direction:tab,amount:fd.get('amount'),account:fd.get('account'),date:fd.get('date'),time:fd.get('time'),person:fd.get('person'),name:fd.get('name'),note:fd.get('note'),label:preset||(tab==='payable'?'借入':'借出'),existing:!!fd.get('loanExisting')});
    if(r.error){alert(r.error);return true;}
    await save();closeModals();render();
    window.__mozeLoanFilter='all';window.__mozeSelectedLoanId=r.loan.id;if(typeof renderLoans==='function')renderLoans();
    return true;
  };
  window.refreshEntryChoices=refresh;
  window.mozeState=window.state;
  const originalOpen=window.openTx||(typeof openTx==='function'?openTx:null);
  if(originalOpen){window.openTx=function(kind,t){
    originalOpen(kind,t);
    const editing=!!t&&!!t.id,k=(t&&t.kind)||kind||'expense';
    const bg=$('modalBg');if(bg)bg.classList.toggle('editing',editing);
    const inp=input();expr=inp&&inp.value?String(Number(inp.value)):'';
    const lf=document.querySelector('[data-rename=fee]'),ld=document.querySelector('[data-rename=discount]');if(lf)lf.textContent=(t&&t.feeName)||'手續費';if(ld)ld.textContent=(t&&t.discountName)||'折扣';
    if($('entryFeeName'))$('entryFeeName').value=(t&&t.feeName)||'';if($('entryDiscountName'))$('entryDiscountName').value=(t&&t.discountName)||'';
    if(t&&t.orig&&k!=='transfer')expr=String(t.orig.amount);if(t&&t.feeIncluded&&k!=='transfer'){if(!t.orig)expr=String(entryBaseAmount(t));const fe=f('fee'),de=f('discount');if(fe)fe.value=t.fee||'';if(de)de.value=t.discount||'';}
    const cs=$('formCategory');if(cs&&t&&t.category!==undefined)cs.dataset.keep=String(t.category);
    const nm=f('name');if(nm)delete nm.dataset.auto;
    const hasHistory=!t&&prefOn('suggest')&&entrySuggest(state,today(),1).length&&(state.transactions||[]).some(x=>x.kind==='expense'||x.kind==='income');
    tab=(k==='income'||k==='transfer')?k:(hasHistory?'suggest':'expense');
    preset='';exprIn='';inTouched=false;side='out';pick='out';keepCat={};tfKeep=null;prevTab='expense';if(tab==='transfer'){if(t){preset=cat(t.category).name;if(t.toAmount!==undefined){exprIn=String(t.toAmount);inTouched=true;}if($('formToProject'))$('formToProject').value=t.toProject||'';}else{tab='';setTab('transfer');prevTab='expense';}}if($('entrySideTitle'))$('entrySideTitle').textContent=tab==='transfer'?'轉出金額':'金額';if($('entryAcctTitle')&&tab!=='transfer')$('entryAcctTitle').textContent='常用帳戶';if(bg)bg.dataset.etab=tab;
    if(tab==='suggest')setKind('expense');
    $('entrySide')?.classList.add('open');
    setTimeout(()=>{window.mozeState=window.state;if(cs&&t&&t.category!==undefined)cs.dataset.keep=String(t.category);refresh();},0);
  };}
  setTimeout(()=>{window.mozeState=window.state;refresh();},200);
})();
