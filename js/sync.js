(function(){
  'use strict';
  const LS_CFG='moze-sync-config-v24', LS_DEVICE='moze-sync-device-v24', LS_DIRTY='moze-sync-dirty-v24', LS_SERVER='moze-sync-server-v24';
  const CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const state={client:null,user:null,ready:false,loading:false,timer:null,authSub:null,clientKey:''};
  const $=id=>document.getElementById(id);
  const baseCfg=()=>window.MOZE_SUPABASE_CONFIG||{};
  function getCfg(){try{const saved=JSON.parse(localStorage.getItem(LS_CFG)||'{}');return {url:(saved.url||baseCfg().url||'').trim(),publishableKey:(saved.publishableKey||baseCfg().publishableKey||'').trim()}}catch{return {url:(baseCfg().url||'').trim(),publishableKey:(baseCfg().publishableKey||'').trim()}}}
  function saveCfg(c){localStorage.setItem(LS_CFG,JSON.stringify({url:c.url.trim(),publishableKey:c.publishableKey.trim()}))}
  function deviceId(){let v=localStorage.getItem(LS_DEVICE);if(!v){v=(crypto.randomUUID?crypto.randomUUID():'device-'+Date.now()+'-'+Math.random().toString(16).slice(2));localStorage.setItem(LS_DEVICE,v)}return v}
  function isDirty(){return localStorage.getItem(LS_DIRTY)==='1'}
  function setDirty(v){localStorage.setItem(LS_DIRTY,v?'1':'0')}
  function lastServer(){return localStorage.getItem(LS_SERVER)||''}
  function setLastServer(v){if(v)localStorage.setItem(LS_SERVER,v);else localStorage.removeItem(LS_SERVER)}
  function setStatus(text,kind='idle',userText){const dot=$('syncDot'),label=$('syncStatus'),user=$('syncUserLabel'),badge=$('syncBadge');if(label)label.textContent=text;if(user)user.textContent=userText|| (state.user?.email||'尚未登入');if(badge){badge.textContent=text;badge.dataset.kind=kind}if(dot){dot.dataset.kind=kind}}
  function fillConfig(){const c=getCfg();if($('syncUrl'))$('syncUrl').value=c.url;if($('syncKey'))$('syncKey').value=c.publishableKey;}
  function loadScript(src){return new Promise((resolve,reject)=>{if(window.supabase?.createClient)return resolve();const s=document.createElement('script');s.src=src;s.onload=()=>resolve();s.onerror=()=>reject(new Error('無法載入 Supabase JavaScript；請確認網路連線。'));document.head.appendChild(s)})}
  async function ensureClient(){const cfg=getCfg();if(!cfg.url||!cfg.publishableKey)throw new Error('請先填入 Supabase Project URL 與 Publishable Key。');if(!/^https:\/\//.test(cfg.url))throw new Error('Supabase Project URL 必須使用 HTTPS。');await loadScript(CDN);if(!window.supabase?.createClient)throw new Error('Supabase SDK 載入失敗。');const key=cfg.url+'|'+cfg.publishableKey;if(!state.client||state.clientKey!==key){try{state.authSub?.unsubscribe?.()}catch{}state.authSub=null;state.client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,storageKey:'moze-auth-v24'}});state.clientKey=key;const {data}=state.client.auth.onAuthStateChange((event,session)=>{state.user=session?.user||null;renderAuth();if(event==='SIGNED_IN')setTimeout(()=>syncNow('auto'),0);if(event==='SIGNED_OUT'){setDirty(false);setLastServer('');setStatus('已登出','idle','尚未登入')}});state.authSub=data.subscription}
    const {data,error}=await state.client.auth.getSession();if(error)throw error;state.user=data.session?.user||null;state.ready=true;renderAuth();return state.client}
  async function signIn(email,password){const c=await ensureClient();setStatus('登入中…','syncing');const {data,error}=await c.auth.signInWithPassword({email,password});if(error)throw error;state.user=data.user;renderAuth();await syncNow('auto')}
  async function signUp(email,password){const c=await ensureClient();setStatus('建立帳號…','syncing');const {data,error}=await c.auth.signUp({email,password});if(error)throw error;if(data.session){state.user=data.user;renderAuth();await syncNow('auto');return '帳號已建立並登入。'}return '帳號已建立；若專案要求 Email 驗證，請先完成驗證再登入。'}
  async function signOut(){if(state.client)await state.client.auth.signOut();state.user=null;setStatus('已登出','idle','尚未登入');renderAuth()}
  function localState(){return window.MozeApp?.getState?window.MozeApp.getState():window.state}
  async function fetchCloud(){if(!state.user)throw new Error('尚未登入。');const {data,error}=await state.client.from('moze_snapshots').select('state,client_updated_at,device_id').eq('user_id',state.user.id).maybeSingle();if(error)throw error;return data}
  async function pushLocal(){const data=localState();if(!data)throw new Error('本機資料尚未準備完成。');const now=new Date().toISOString();const row={user_id:state.user.id,state:data,client_updated_at:now,device_id:deviceId(),updated_at:now};const {data:up,error}=await state.client.from('moze_snapshots').upsert(row,{onConflict:'user_id'}).select('client_updated_at').single();if(error)throw error;setDirty(false);setLastServer(up.client_updated_at||now);setStatus('已同步','ok',state.user.email);return up}
  async function applyCloud(remote){if(!remote?.state)throw new Error('雲端沒有有效的 MOZE 資料。');await window.MozeApp.setState(remote.state,{persist:true,markDirty:false});setDirty(false);setLastServer(remote.client_updated_at||'');setStatus('已同步','ok',state.user.email)}
  async function syncNow(mode='auto'){
    if(state.loading)return;state.loading=true;try{if(!state.client||!state.user)await ensureClient();if(!state.user){setStatus('已連線，尚未登入','idle');return}
      setStatus('同步中…','syncing',state.user.email);const remote=await fetchCloud();const dirty=isDirty();const last=lastServer();
      if(!remote){await pushLocal();return}
      if(mode==='cloud'){await applyCloud(remote);return}
      if(mode==='local'){await pushLocal();return}
      if(!dirty && (!last || new Date(remote.client_updated_at)>new Date(last))){await applyCloud(remote);return}
      if(dirty && last && new Date(remote.client_updated_at)>new Date(last)){
        const useCloud=confirm('偵測到其他裝置有較新的資料。\n\n按「確定」使用雲端資料覆蓋本機。\n按「取消」保留本機資料並上傳到雲端。');
        if(useCloud)await applyCloud(remote);else await pushLocal();return;
      }
      if(!last){if(mode==='silent'){setStatus('雲端有資料','dirty',state.user.email);return}const useCloud=confirm('雲端已經有資料。\n\n按「確定」使用雲端資料。\n按「取消」將目前這台裝置的資料上傳到雲端。');if(useCloud)await applyCloud(remote);else await pushLocal();return}
      if(dirty)await pushLocal();else{setLastServer(remote.client_updated_at);setStatus('已同步','ok',state.user.email)}
    }catch(err){console.error('MOZE Sync',err);setStatus('同步失敗','error',err.message||'請檢查設定');if(mode!=='silent')alert('同步失敗：'+(err.message||err))}finally{state.loading=false}}
  function markDirty(){setDirty(true);setStatus('待同步','dirty',state.user?.email||'尚未登入');if(state.timer)clearTimeout(state.timer);if(state.user)state.timer=setTimeout(()=>syncNow('auto'),1200)}
  function renderAuth(){
    fillConfig();const area=$('syncAccountArea');if(!area)return;const c=getCfg();
    if(!c.url||!c.publishableKey){area.innerHTML='<div class="sync-auth-empty">尚未設定 Supabase。填入上方設定後即可使用雲端同步。</div>';setStatus('本機模式','idle','未設定雲端');return}
    if(!state.user){area.innerHTML='<div class="sync-login-grid"><label>Email<input id="syncEmail" type="email" autocomplete="username" placeholder="you@example.com"></label><label>密碼<input id="syncPassword" type="password" autocomplete="current-password" placeholder="至少 6 碼"></label><div class="sync-login-actions"><button type="button" class="primary" id="syncLogin">登入</button><button type="button" class="secondary" id="syncSignup">建立帳號</button></div></div>';setStatus('尚未登入','idle','請登入雲端帳號');bindAuthButtons();return}
    area.innerHTML=`<div class="sync-user-card"><div><span>目前帳號</span><b>${state.user.email||''}</b><small>${isDirty()?'有尚未同步的本機變更':'資料與雲端一致'}</small></div><div class="sync-user-actions"><button type="button" class="secondary" id="syncForcePull">從雲端載入</button><button type="button" class="secondary" id="syncForcePush">上傳本機</button><button type="button" class="secondary" id="syncLogout">登出</button></div></div>`;setStatus(isDirty()?'待同步':'已登入','ok',state.user.email);bindAuthButtons()}
  function bindAuthButtons(){
    $('syncLogin')?.addEventListener('click',async()=>{const e=$('syncEmail')?.value.trim(),p=$('syncPassword')?.value||'';if(!e||!p)return alert('請輸入 Email 與密碼。');try{await signIn(e,p)}catch(err){alert('登入失敗：'+err.message)}});
    $('syncSignup')?.addEventListener('click',async()=>{const e=$('syncEmail')?.value.trim(),p=$('syncPassword')?.value||'';if(!e||p.length<6)return alert('請輸入 Email，密碼至少 6 碼。');try{const msg=await signUp(e,p);alert(msg)}catch(err){alert('建立帳號失敗：'+err.message)}});
    $('syncLogout')?.addEventListener('click',()=>signOut());$('syncForcePull')?.addEventListener('click',()=>syncNow('cloud'));$('syncForcePush')?.addEventListener('click',()=>syncNow('local'));
  }
  async function saveConfigFromUI(){const url=$('syncUrl')?.value.trim()||'',publishableKey=$('syncKey')?.value.trim()||'';if(!url||!publishableKey)return alert('請先填入 Supabase Project URL 與 Publishable Key。');saveCfg({url,publishableKey});state.client=null;state.ready=false;try{await ensureClient();alert('同步設定已儲存。');renderAuth()}catch(err){alert('同步設定無效：'+err.message);renderAuth()}}
  function bindUI(){fillConfig();$('saveSyncConfig')?.addEventListener('click',saveConfigFromUI);$('syncNowBtn')?.addEventListener('click',()=>syncNow('auto'));$('syncTopAction')?.addEventListener('click',()=>{window.MozeApp?.nav('settings');setTimeout(()=>document.getElementById('syncPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),30)});renderAuth();window.addEventListener('online',()=>{if(state.user)syncNow('auto')});window.addEventListener('offline',()=>setStatus('離線','offline',state.user?.email||'本機仍可使用'));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.user)syncNow('silent')});setInterval(()=>{if(state.user&&navigator.onLine&&!state.loading)syncNow('silent')},20000)}
  window.MozeSync={appReady:function(){setTimeout(async()=>{bindUI();if(getCfg().url&&getCfg().publishableKey){try{await ensureClient();if(state.user)await syncNow('auto');else setStatus('尚未登入','idle','請登入雲端帳號')}catch(err){console.warn('sync init',err);setStatus('本機模式','idle','同步尚未設定')}}},0)},markDirty,signIn,signUp,signOut,syncNow,getConfig:getCfg,saveConfig:c=>{saveCfg(c);state.client=null;state.ready=false;}};
})();
