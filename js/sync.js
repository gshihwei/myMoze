(function(){
  'use strict';
  const LS_DEVICE='moze-sync-device-v25', LS_QUEUE='moze-sync-queue-v25', LS_META='moze-sync-meta-v25', LS_LAST_USER='moze-sync-last-user-v25';
  const CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const ENTITIES=['accounts','categories','projects','transactions','budgets','recurring','loans'];
  const state={client:null,user:null,ready:false,loading:false,timer:null,authSub:null,clientKey:'',conflicts:[]};
  const $=id=>document.getElementById(id);
  const baseCfg=()=>window.MOZE_SUPABASE_CONFIG||{};

  // V25.1: Supabase 連線資訊由開發者部署時寫入 sync-config.js。
  // 為了相容 V24/V25 舊資料，只有在內建設定留白時才讀取舊的 localStorage 設定。
  function getCfg(){
    const base={url:String(baseCfg().url||'').trim(),publishableKey:String(baseCfg().publishableKey||'').trim()};
    if(base.url&&base.publishableKey)return base;
    try{
      const saved=JSON.parse(localStorage.getItem('moze-sync-config-v25')||'{}');
      const legacy=JSON.parse(localStorage.getItem('moze-sync-config-v24')||'{}');
      return {
        url:String(saved.url||legacy.url||'').trim(),
        publishableKey:String(saved.publishableKey||legacy.publishableKey||'').trim()
      };
    }catch{return base}
  }
  function deviceId(){let v=localStorage.getItem(LS_DEVICE);if(!v){v=(crypto.randomUUID?crypto.randomUUID():'device-'+Date.now()+'-'+Math.random().toString(16).slice(2));localStorage.setItem(LS_DEVICE,v)}return v}
  function scopedKey(base){return state.user?base+'|'+state.user.id:base+'|anonymous'}
  function readQueue(){try{return JSON.parse(localStorage.getItem(scopedKey(LS_QUEUE))||'{}')||{}}catch{return {}}}
  function writeQueue(q){const k=scopedKey(LS_QUEUE);if(Object.keys(q).length)localStorage.setItem(k,JSON.stringify(q));else localStorage.removeItem(k)}
  function queueKey(entity,id){return entity+'|'+String(id)}
  function readMeta(){try{return JSON.parse(localStorage.getItem(scopedKey(LS_META))||'{}')||{}}catch{return {}}}
  function writeMeta(m){localStorage.setItem(scopedKey(LS_META),JSON.stringify(m))}
  function getMeta(){const m=readMeta();m.deviceId=m.deviceId||deviceId();m.records=m.records||{};m.lastPull=m.lastPull||'';m.bootstrapped=!!m.bootstrapped;return m}
  function markBootstrapped(){const m=getMeta();m.bootstrapped=true;writeMeta(m)}
  function isDirty(){return Object.keys(readQueue()).length>0||localStorage.getItem('moze-sync-unauth-dirty-v25')==='1'}
  function setStatus(text,kind='idle',userText){const dot=$('syncDot'),label=$('syncStatus'),user=$('syncUserLabel'),badge=$('syncBadge');if(label)label.textContent=text;if(user)user.textContent=userText||(state.user?.email||'尚未登入');if(badge){badge.textContent=text;badge.dataset.kind=kind}if(dot)dot.dataset.kind=kind}
  function loadScript(src){return new Promise((resolve,reject)=>{if(window.supabase?.createClient)return resolve();const s=document.createElement('script');s.src=src;s.onload=()=>resolve();s.onerror=()=>reject(new Error('無法載入 Supabase JavaScript；請確認網路連線。'));document.head.appendChild(s)})}
  async function ensureClient(){
    const cfg=getCfg();
    if(!cfg.url||!cfg.publishableKey)throw new Error('尚未設定 MOZE 的 Supabase 連線。請由管理者在 js/sync-config.js 設定。');
    if(!/^https:\/\//.test(cfg.url))throw new Error('MOZE 的 Supabase Project URL 必須使用 HTTPS。');
    await loadScript(CDN);if(!window.supabase?.createClient)throw new Error('Supabase SDK 載入失敗。');
    const key=cfg.url+'|'+cfg.publishableKey;
    if(!state.client||state.clientKey!==key){
      try{state.authSub?.unsubscribe?.()}catch{}
      state.authSub=null;
      state.client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,storageKey:'moze-auth-v25'}});
      state.clientKey=key;
      const {data}=state.client.auth.onAuthStateChange((event,session)=>{const nextUser=session?.user||null;if(nextUser)switchLocalUser(nextUser);state.user=nextUser;renderAuth();if(event==='SIGNED_IN')setTimeout(()=>syncNow('auto'),0);if(event==='SIGNED_OUT'){state.conflicts=[];setStatus('已登出','idle','尚未登入')}});
      state.authSub=data.subscription;
    }
    const {data,error}=await state.client.auth.getSession();if(error)throw error;
    const currentUser=data.session?.user||null;if(currentUser)switchLocalUser(currentUser);state.user=currentUser;state.ready=true;renderAuth();return state.client
  }
  async function signIn(email,password){const c=await ensureClient();setStatus('登入中…','syncing');const {data,error}=await c.auth.signInWithPassword({email,password});if(error)throw error;state.user=data.user;renderAuth();await syncNow('auto')}
  async function signUp(email,password){const c=await ensureClient();setStatus('建立帳號…','syncing');const {data,error}=await c.auth.signUp({email,password});if(error)throw error;if(data.session){state.user=data.user;renderAuth();await syncNow('auto');return '帳號已建立並登入。'}return '帳號已建立；若專案要求 Email 驗證，請先完成驗證再登入。'}
  async function signOut(){if(state.client)await state.client.auth.signOut();state.user=null;state.conflicts=[];renderAuth();setStatus('已登出','idle','尚未登入')}
  function localState(){return window.MozeApp?.getState?window.MozeApp.getState():window.state}
  function freshState(){return {accounts:[{id:'cash',name:'現金',type:'cash',balance:0},{id:'bank',name:'銀行帳戶',type:'bank',balance:0}],categories:[{id:'food',name:'飲食',icon:'🍜',kind:'expense'},{id:'transport',name:'交通',icon:'🚗',kind:'expense'},{id:'shopping',name:'購物',icon:'🛍️',kind:'expense'},{id:'home',name:'居家',icon:'⌂',kind:'expense'},{id:'ent',name:'娛樂',icon:'◉',kind:'expense'},{id:'salary',name:'薪資',icon:'＄',kind:'income'}],projects:[],transactions:[],budgets:[],recurring:[],loans:[]}}
  function switchLocalUser(nextUser){if(!nextUser)return;const last=localStorage.getItem(LS_LAST_USER)||'';if(last&&last!==nextUser.id){try{window.MozeApp?.setState?.(freshState(),{persist:true,markDirty:false})}catch(e){console.warn('local user switch',e)}}localStorage.setItem(LS_LAST_USER,nextUser.id)}
  function localRecord(entity,recordId){const st=localState()||{};return (st[entity]||[]).find(x=>String(x.id)===String(recordId))||null}
  function listLocalRecords(st){const out=[];for(const entity of ENTITIES){for(const row of (st?.[entity]||[]))out.push({entity,recordId:String(row.id),data:row})}return out}
  function applyRowToState(st,row){if(!st[row.entity])st[row.entity]=[];const arr=st[row.entity],idx=arr.findIndex(x=>String(x.id)===String(row.record_id));if(row.deleted){if(idx>=0)arr.splice(idx,1);return}if(idx>=0)arr[idx]=row.data;else arr.push(row.data)}
  function metaSet(entity,recordId,version,updatedAt){const m=getMeta();m.records[queueKey(entity,recordId)]={version:Number(version)||0,updatedAt:updatedAt||''};writeMeta(m)}
  function metaGetVersion(entity,recordId){return Number(getMeta().records[queueKey(entity,recordId)]?.version||0)}
  function queueStateDiff(changes){if(!changes?.length)return;if(!state.user){localStorage.setItem('moze-sync-unauth-dirty-v25','1');setStatus('待同步','dirty','尚未登入');return}const q=readQueue();for(const ch of changes){const k=queueKey(ch.entity,ch.recordId),existing=q[k];q[k]={entity:ch.entity,recordId:String(ch.recordId),op:ch.op,baseVersion:existing?Number(existing.baseVersion)||0:metaGetVersion(ch.entity,ch.recordId),queuedAt:existing?.queuedAt||new Date().toISOString()}}writeQueue(q);setStatus('待同步','dirty',state.user.email)}
  function markDirty(){if(state.timer)clearTimeout(state.timer);setStatus('待同步','dirty',state.user?.email||'尚未登入');if(state.user)state.timer=setTimeout(()=>syncNow('auto'),1200)}
  async function fetchRows(since=''){if(!state.user)throw new Error('尚未登入。');const pageSize=1000;let from=0,all=[];for(;;){let q=state.client.from('moze_records').select('entity,record_id,data,deleted,version,updated_at,device_id').order('updated_at',{ascending:true}).range(from,from+pageSize-1);if(since)q=q.gte('updated_at',since);const {data,error}=await q;if(error)throw error;const rows=data||[];all.push(...rows);if(rows.length<pageSize)break;from+=pageSize}return all}
  async function fetchLegacySnapshot(){try{const {data,error}=await state.client.from('moze_snapshots').select('state,updated_at,client_updated_at,device_id').eq('user_id',state.user.id).maybeSingle();if(error)return null;return data||null}catch{return null}}
  function rowPayload(data){return Array.isArray(data)?data[0]:data}
  async function writeRecord(op,{forceBaseVersion=null}={}){const q=readQueue(),key=queueKey(op.entity,op.recordId),local=localRecord(op.entity,op.recordId);const deleted=op.op==='delete'||!local,data=deleted?{}:local,baseVersion=forceBaseVersion===null?Number(op.baseVersion||0):Number(forceBaseVersion||0);const {data:result,error}=await state.client.rpc('moze_write_record',{p_entity:op.entity,p_record_id:String(op.recordId),p_data:data,p_deleted:deleted,p_base_version:baseVersion,p_device_id:deviceId()});if(error)throw error;const r=rowPayload(result)||{};if(r.status==='conflict')return {conflict:true,row:r.row,op,key};if(r.status!=='applied')throw new Error('雲端寫入沒有回傳成功狀態。');if(r.row)metaSet(op.entity,op.recordId,r.row.version,r.row.updated_at);delete q[key];writeQueue(q);return {ok:true,row:r.row,key}}
  async function pushQueued(){const q=readQueue(),conflicts=[];for(const k of Object.keys(q)){const result=await writeRecord(q[k]);if(result.conflict)conflicts.push(result)}return conflicts}
  async function applyRemoteRows(rows,{replace=false}={}){const base=localState()||{},st=replace?freshState():JSON.parse(JSON.stringify(base));if(replace)for(const e of ENTITIES)st[e]=[];const times=[];for(const row of rows||[]){if(!ENTITIES.includes(row.entity))continue;applyRowToState(st,row);metaSet(row.entity,row.record_id,row.version,row.updated_at);if(row.updated_at)times.push(row.updated_at)}const m=getMeta();if(times.length)m.lastPull=times.sort().at(-1);writeMeta(m);await window.MozeApp.setState(st,{persist:true,markDirty:false})}
  async function pushFullLocal(remoteRows=[]){const remoteMap=new Map(remoteRows.map(r=>[queueKey(r.entity,r.record_id),r]));for(const r of listLocalRecords(localState())){const rr=remoteMap.get(queueKey(r.entity,r.recordId));const res=await writeRecord({entity:r.entity,recordId:r.recordId,op:'upsert',baseVersion:rr?Number(rr.version)||0:0},{forceBaseVersion:rr?Number(rr.version)||0:0});if(res.conflict)throw new Error(`無法上傳 ${r.entity}/${r.recordId}：雲端同筆資料正在變更。`)}const localKeys=new Set(listLocalRecords(localState()).map(r=>queueKey(r.entity,r.recordId)));for(const rr of remoteRows){if(!localKeys.has(queueKey(rr.entity,rr.record_id))&&!rr.deleted){const res=await writeRecord({entity:rr.entity,recordId:rr.record_id,op:'delete',baseVersion:Number(rr.version)||0},{forceBaseVersion:Number(rr.version)||0});if(res.conflict)throw new Error(`無法刪除雲端多餘資料 ${rr.entity}/${rr.record_id}。`)}}const all=await fetchRows('');await applyRemoteRows(all,{replace:true});writeQueue({});markBootstrapped()}
  async function bootstrap(){const m=getMeta();if(m.bootstrapped)return;const rows=await fetchRows('');const legacy=rows.length?null:await fetchLegacySnapshot();if(rows.length){const useCloud=confirm('已找到這個帳號的 V25 逐筆資料。\n\n按「確定」：以雲端資料建立本機資料。\n按「取消」：以目前本機資料覆蓋雲端。');if(useCloud)await applyRemoteRows(rows,{replace:true});else await pushFullLocal(rows)}else if(legacy?.state){const useLegacy=confirm('找到這個帳號的舊版 V24 雲端 Snapshot。\n\n按「確定」：將 V24 雲端資料升級成 V25 逐筆資料。\n按「取消」：保留本機資料並用本機資料建立 V25 雲端資料。');if(useLegacy){await window.MozeApp.setState(legacy.state,{persist:true,markDirty:false});await pushFullLocal([])}else await pushFullLocal([])}else await pushFullLocal([]);markBootstrapped()}
  async function pullAllFromCloud(){const remote=await fetchRows('');if(!remote.length)throw new Error('雲端目前沒有逐筆資料。');if(isDirty()&&!confirm('本機有尚未同步的變更。\n\n按「確定」會直接以雲端資料覆蓋本機。'))return;await applyRemoteRows(remote,{replace:true});writeQueue({});markBootstrapped();setStatus('已同步','ok',state.user?.email);renderAuth()}
  async function resolveCloud(index){const c=state.conflicts[index];if(!c?.row)return;const st=JSON.parse(JSON.stringify(localState()||{}));applyRowToState(st,c.row);await window.MozeApp.setState(st,{persist:true,markDirty:false});const q=readQueue();delete q[c.key];writeQueue(q);metaSet(c.row.entity,c.row.record_id,c.row.version,c.row.updated_at);state.conflicts.splice(index,1);renderAuth();setStatus(isDirty()?'待同步':'已同步','ok',state.user?.email)}
  async function resolveLocal(index){const c=state.conflicts[index];if(!c?.row)return;const q=readQueue(),op=q[c.key]||c.op;const res=await writeRecord(op,{forceBaseVersion:Number(c.row.version)||0});if(res.conflict)throw new Error('雲端資料又被其他裝置修改，請重新同步。');state.conflicts.splice(index,1);renderAuth();setStatus(isDirty()?'待同步':'已同步','ok',state.user?.email)}
  async function syncNow(mode='auto'){if(state.loading)return;state.loading=true;try{if(!state.client||!state.user)await ensureClient();if(!state.user){setStatus('已連線，尚未登入','idle');return}setStatus('同步中…','syncing',state.user.email);if(!getMeta().bootstrapped){await bootstrap();state.conflicts=[];setStatus('已同步','ok',state.user.email);renderAuth();return}state.conflicts=await pushQueued();const m=getMeta(),rows=await fetchRows(m.lastPull||'');if(rows.length){const q=readQueue(),safe=rows.filter(r=>!q[queueKey(r.entity,r.record_id)]);await applyRemoteRows(safe,{replace:false});const latest=rows.map(r=>r.updated_at).filter(Boolean).sort().at(-1);if(latest){const mm=getMeta();mm.lastPull=latest;writeMeta(mm)}}if(state.conflicts.length){renderAuth();setStatus('有同步衝突','error',state.user.email);return}setStatus(isDirty()?'待同步':'已同步','ok',state.user.email);renderAuth()}catch(err){console.error('MOZE Sync V25.1',err);setStatus('同步失敗','error',err.message||'請檢查設定');if(mode!=='silent')alert('同步失敗：'+(err.message||err))}finally{state.loading=false}}
  function conflictLabel(c){const local=localRecord(c.op.entity,c.op.recordId);return `${c.op.entity} · ${local?.name||local?.person||c.op.recordId}`}
  function renderAuth(){
    const box=$('syncAccountArea');
    if(!box)return;
    if(state.user){
      box.innerHTML=`<div class="sync-user-card">
        <div><b>已登入雲端帳號</b><span>${String(state.user.email||'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}</span><small>${isDirty()?'有待同步變更':'資料已同步或尚未有變更'}</small></div>
        <div class="sync-user-actions">
          <button type="button" class="secondary" id="syncForcePull">從雲端載入</button>
          <button type="button" class="secondary" id="syncForcePush">上傳本機</button>
          <button type="button" class="secondary" id="syncLogout">登出</button>
        </div>
      </div><div id="syncConflictArea"></div>`;
    }else{
      box.innerHTML=`<div class="sync-login-grid">
        <label>Email<input id="syncEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <label>密碼<input id="syncPassword" type="password" autocomplete="current-password" placeholder="至少 6 碼"></label>
        <div class="sync-login-actions">
          <button type="button" class="secondary" id="syncSignup">建立帳號</button>
          <button type="button" class="primary" id="syncLogin">登入</button>
        </div>
      </div><div id="syncConflictArea"></div>`;
    }
    bindAuthButtons();
    renderConflicts();
    renderConflictButtons();
  }

  function renderConflicts(){const box=$('syncConflictArea');if(!box)return;if(!state.conflicts.length){box.innerHTML='';return}box.innerHTML=`<div class="sync-conflict-box"><div><b>同步衝突 ${state.conflicts.length} 筆</b><p>只有同一筆資料被兩台裝置同時修改時才需要處理；其他資料已自動合併。</p></div>${state.conflicts.map((c,i)=>`<div class="sync-conflict-row"><span>${conflictLabel(c)}</span><div><button type="button" class="secondary" data-conflict-cloud="${i}">保留雲端</button><button type="button" class="primary" data-conflict-local="${i}">保留本機</button></div></div>`).join('')}</div>`}
  function renderConflictButtons(){document.querySelectorAll('[data-conflict-cloud]').forEach(b=>b.onclick=async()=>{try{await resolveCloud(Number(b.dataset.conflictCloud))}catch(e){alert('保留雲端失敗：'+e.message)}});document.querySelectorAll('[data-conflict-local]').forEach(b=>b.onclick=async()=>{try{await resolveLocal(Number(b.dataset.conflictLocal))}catch(e){alert('保留本機失敗：'+e.message)}})}
  function bindAuthButtons(){$('syncLogin')?.addEventListener('click',async()=>{const e=$('syncEmail')?.value.trim(),p=$('syncPassword')?.value||'';if(!e||!p)return alert('請輸入 Email 與密碼。');try{await signIn(e,p)}catch(err){alert('登入失敗：'+err.message)}});$('syncSignup')?.addEventListener('click',async()=>{const e=$('syncEmail')?.value.trim(),p=$('syncPassword')?.value||'';if(!e||p.length<6)return alert('請輸入 Email，密碼至少 6 碼。');try{const msg=await signUp(e,p);alert(msg)}catch(err){alert('建立帳號失敗：'+err.message)}});$('syncLogout')?.addEventListener('click',()=>signOut());$('syncForcePull')?.addEventListener('click',async()=>{try{await pullAllFromCloud()}catch(err){alert('從雲端載入失敗：'+err.message)}});$('syncForcePush')?.addEventListener('click',async()=>{try{const rows=await fetchRows('');await pushFullLocal(rows);await syncNow('auto')}catch(err){alert('上傳本機失敗：'+err.message)}})}
  function bindUI(){$('syncNowBtn')?.addEventListener('click',()=>syncNow('auto'));$('syncTopAction')?.addEventListener('click',()=>{window.MozeApp?.nav('settings');setTimeout(()=>document.getElementById('syncPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),30)});renderAuth();window.addEventListener('online',()=>{if(state.user)syncNow('auto')});window.addEventListener('offline',()=>setStatus('離線','offline',state.user?.email||'本機仍可使用'));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.user)syncNow('silent')});setInterval(()=>{if(state.user&&navigator.onLine&&!state.loading)syncNow('silent')},20000)}
  window.MozeSync={
    appReady:function(){
      setTimeout(async()=>{
        bindUI();
        if(getCfg().url&&getCfg().publishableKey){
          try{
            await ensureClient();
            if(state.user)await syncNow('auto');
            else setStatus('尚未登入','idle','請登入雲端帳號');
          }catch(err){
            console.warn('MOZE Sync init',err);
            setStatus('同步未就緒','error',err.message);
          }
        }else{
          setStatus('同步未設定','error','請由管理者設定 MOZE Supabase');
        }
      },0);
    },
    markDirty,queueStateDiff,syncNow,signIn,signUp,signOut,getCfg
  };
})();
