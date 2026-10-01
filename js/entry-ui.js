
import { svg, accountIcon } from './icons.js';

(function(){
  const $=id=>document.getElementById(id);
  const input=$('amountInput'),display=$('amountDisplay'),keypad=$('amountKeypad');
  function syncAmount(){if(!input||!display)return;const v=input.value||'';display.textContent=v?Number(v).toLocaleString('zh-TW'):'0';}
  keypad?.addEventListener('click',e=>{const b=e.target.closest('button[data-key]');if(!b)return;const k=b.dataset.key;let v=input.value||'';if(k==='back')v=v.slice(0,-1);else{if(v==='0')v='';if(v.length<12)v+=k;}input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));syncAmount();});
  input?.addEventListener('input',syncAmount);
  function currentState(){return window.mozeState||window.state;}
  function refresh(){
    const st=currentState(),cc=$('categoryChoices'),ac=$('accountChoices'),cs=$('formCategory'),as=$('formAccount');
    if(!st||!cc||!ac||!cs||!as)return;
    const kind=document.querySelector('input[name="kind"]:checked')?.value||'expense';
    const categories=st.categories.filter(c=>c.kind===kind || (kind==='transfer' && c.kind==='expense'));
    cs.innerHTML=categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    if(!categories.some(c=>String(c.id)===String(cs.value)))cs.value=categories[0]?.id||'';
    cc.innerHTML=categories.map(c=>`<button type="button" class="choice-chip" data-select="formCategory" data-value="${c.id}"><span class="chip-icon">${svg(c.id)}</span><span class="choice-label">${c.name}</span><span class="checkmark">✓</span></button>`).join('');
    ac.innerHTML=Array.from(as.options).map(o=>{const a=st.accounts.find(x=>String(x.id)===String(o.value));return `<button type="button" class="choice-chip" data-select="formAccount" data-value="${o.value}"><span class="chip-icon">${svg(accountIcon(a))}</span><span class="choice-label">${a?.name||o.text}</span><span class="checkmark">✓</span></button>`}).join('');
    sync();
  }
  function sync(){document.querySelectorAll('.choice-chip').forEach(b=>{const s=$(b.dataset.select);b.classList.toggle('active',!!s&&String(s.value)===String(b.dataset.value));});}
  document.addEventListener('click',e=>{const b=e.target.closest('.choice-chip');if(!b)return;const s=$(b.dataset.select);if(!s)return;s.value=b.dataset.value;s.dispatchEvent(new Event('change',{bubbles:true}));sync();});
  document.querySelectorAll('input[name="kind"]').forEach(r=>r.addEventListener('change',()=>setTimeout(refresh,0)));
  $('formCategory')?.addEventListener('change',sync);$('formAccount')?.addEventListener('change',sync);
  window.refreshEntryChoices=refresh;
  window.mozeState=window.state;
  const originalOpen=window.openTx || (typeof openTx==='function'?openTx:null);
  if(originalOpen){window.openTx=function(kind,t){originalOpen(kind,t);setTimeout(()=>{window.mozeState=window.state;syncAmount();refresh();},0);};}
  setTimeout(()=>{window.mozeState=window.state;syncAmount();refresh();},200);
})();
