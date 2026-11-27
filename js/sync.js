(function(){
  'use strict';
  const LS_DEVICE='moze-sync-device-v25', LS_QUEUE_LEGACY='moze-sync-queue-v25', LS_META_LEGACY='moze-sync-meta-v25', LS_LAST_USER='moze-sync-last-user-v25';
  const LS_QUEUE_ITEM='moze-sync-q-item-v26', LS_META_ITEM='moze-sync-meta-item-v26', LS_META_STATE='moze-sync-meta-state-v26', LS_DIRTY='moze-sync-dirty-v26';
  // V26.124: pinned copy shipped with the app (npm @supabase/supabase-js 2.119.2, integrity-checked), not a floating CDN version.
  const CDN='./js/vendor/supabase.js';
  const ENTITIES=['accounts','categories','projects','transactions','budgets','recurring','loans'];
  const state={client:null,user:null,ready:false,loading:false,timer:null,authSub:null,clientKey:'',conflicts:[],metaCache:null,metaKey:'',progress:{done:0,total:0},passwordMode:''};
  // V25.10: a password-reset email link lands here with #...type=recovery (implicit flow).
  // Capture it before supabase-js consumes and clears the URL hash.
  if(/(^|[#&?])type=recovery(&|$)/.test(location.hash+'&'+location.search.slice(1)))state.passwordMode='recovery';
  const $=id=>document.getElementById(id);
  const baseCfg=()=>window.MOZE_SUPABASE_CONFIG||{};

  // V25.4: Supabase 連線資訊由開發者部署時寫入 sync-config.js。
  // 為了相容 V24/V25 舊資料，只有在內建設定留白時才讀取舊的 localStorage 設定。
  function getCfg(){
    const base={url:String(baseCfg().url||'').trim(),publishableKey:String(baseCfg().publishableKey||'').trim()};
    if(base.url&&base.publishableKey)return base;
    try{
      const saved=JSON.parse(localStorage.getItem('moze-sync-config-v25')||'{}');
      const legacy=JSON.parse(localStorage.getItem('moze-sync-config-v24')||'{}');
      return {url:String(saved.url||legacy.url||'').trim(),publishableKey:String(saved.publishableKey||legacy.publishableKey||'').trim()};
    }catch{return base}
  }
  function deviceId(){let v=localStorage.getItem(LS_DEVICE);if(!v){v=(crypto.randomUUID?crypto.randomUUID():'device-'+Date.now()+'-'+Math.random().toString(16).slice(2));localStorage.setItem(LS_DEVICE,v)}return v}
  function userScope(){return state.user?String(state.user.id):'anonymous'}
  function scopedKey(base){return base+'|'+userScope()}
  function queueKey(entity,id){return entity+'|'+String(id)}
  function queueStorageKey(k){return `${LS_QUEUE_ITEM}|${userScope()}|${k}`}
  function queueStoragePrefix(){return `${LS_QUEUE_ITEM}|${userScope()}|`}
  function listQueueStorageKeys(){const p=queueStoragePrefix(),out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(p))out.push(k)}return out}
  function readQueueOpByStorageKey(sk){try{return JSON.parse(localStorage.getItem(sk)||'null')}catch{return null}}
  function hasQueuedKey(k){return !!localStorage.getItem(queueStorageKey(k))}
  function removeQueuedKey(k){localStorage.removeItem(queueStorageKey(k))}
  function clearQueue(){for(const k of listQueueStorageKeys())localStorage.removeItem(k);localStorage.removeItem(scopedKey(LS_DIRTY))}
  function hasLegacySyncData(){return !!localStorage.getItem(scopedKey(LS_QUEUE_LEGACY))||!!localStorage.getItem(scopedKey(LS_META_LEGACY))}
  function clearLegacySyncData(){localStorage.removeItem(scopedKey(LS_QUEUE_LEGACY));localStorage.removeItem(scopedKey(LS_META_LEGACY));}

  function readMeta(){try{return JSON.parse(localStorage.getItem(scopedKey(LS_META_STATE))||'{}')||{}}catch{return {}}}
  function writeMeta(m){localStorage.setItem(scopedKey(LS_META_STATE),JSON.stringify(m))}
  function getMeta(){const key=scopedKey(LS_META_STATE);if(!state.metaCache||state.metaKey!==key){state.metaKey=key;state.metaCache=readMeta();}const m=state.metaCache;m.deviceId=m.deviceId||deviceId();m.lastPull=m.lastPull||'';m.bootstrapped=!!m.bootstrapped;return m}
  function flushMeta(){if(state.metaCache)writeMeta(state.metaCache)}
  // V25.12: remember when this device last completed a sync with the cloud, and what it moved.
  function markSynced(up=0,down=0){const m=getMeta();m.lastSyncAt=new Date().toISOString();m.lastSyncUp=up;m.lastSyncDown=down;flushMeta()}
  function pendingCount(){return listQueueStorageKeys().length}
  function fmtSyncTime(iso,full){if(!iso)return '';const d=new Date(iso);if(isNaN(d))return '';const p=n=>String(n).padStart(2,'0');const hm=`${p(d.getHours())}:${p(d.getMinutes())}`;const now=new Date();const same=d.toDateString()===now.toDateString();if(full)return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${hm}:${p(d.getSeconds())}`;return same?hm:`${d.getMonth()+1}/${d.getDate()} ${hm}`}
  function syncSummary(){if(!state.user)return '';const m=getMeta(),n=pendingCount();const last=m.lastSyncAt?`最後成功同步：${fmtSyncTime(m.lastSyncAt,true)}（上傳 ${m.lastSyncUp||0} 筆、下載 ${m.lastSyncDown||0} 筆）`:'本機尚未有成功同步紀錄';return `${last}｜待上傳 ${n} 筆`}
  function resetMetaCache(){state.metaCache=null;state.metaKey=''}
  function markBootstrapped(){const m=getMeta();m.bootstrapped=true;flushMeta()}
  function metaStorageKey(entity,recordId){return `${LS_META_ITEM}|${userScope()}|${entity}|${String(recordId)}`}
  function metaSet(entity,recordId,version,updatedAt){localStorage.setItem(metaStorageKey(entity,recordId),JSON.stringify({version:Number(version)||0,updatedAt:updatedAt||''}))}
  function metaClear(entity,recordId){localStorage.removeItem(metaStorageKey(entity,recordId))}
  function metaSetMany(rows){for(const row of rows||[]){if(row?.entity&&row?.record_id!==undefined)metaSet(row.entity,row.record_id,row.version,row.updated_at)}}
  function metaGetVersion(entity,recordId){try{const v=JSON.parse(localStorage.getItem(metaStorageKey(entity,recordId))||'null');return Number(v?.version||0)}catch{return 0}}
  function isDirty(){return localStorage.getItem(scopedKey(LS_DIRTY))==='1'||localStorage.getItem('moze-sync-unauth-dirty-v25')==='1'}

  function setStatus(text,kind='idle',userText){if(state.user&&text==='已同步'){const t=fmtSyncTime(getMeta().lastSyncAt);if(t)text=`已同步 ${t}`}const dot=$('syncDot'),label=$('syncStatus'),user=$('syncUserLabel'),badge=$('syncBadge');if(label)label.textContent=text;if(user)user.textContent=userText||(state.user?.email||'尚未登入');if(badge){badge.textContent=text;badge.dataset.kind=kind}if(dot)dot.dataset.kind=kind}
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
      const {data}=state.client.auth.onAuthStateChange((event,session)=>{const nextUser=session?.user||null;if(nextUser)switchLocalUser(nextUser);state.user=nextUser;renderAuth();if(event==='PASSWORD_RECOVERY'){state.passwordMode='recovery';renderAuth();showPasswordPanel()}if(event==='SIGNED_IN')setTimeout(()=>syncNow('auto'),0);if(event==='SIGNED_OUT'){state.conflicts=[];setStatus('已登出','idle','尚未登入')}});
      state.authSub=data.subscription;
    }
    const {data,error}=await state.client.auth.getSession();if(error)throw error;
    const currentUser=data.session?.user||null;if(currentUser)switchLocalUser(currentUser);state.user=currentUser;state.ready=true;renderAuth();return state.client
  }
  async function signIn(email,password){const c=await ensureClient();setStatus('登入中…','syncing');const {data,error}=await c.auth.signInWithPassword({email,password});if(error)throw error;state.user=data.user;renderAuth();await syncNow('auto')}
  async function signUp(email,password){const c=await ensureClient();setStatus('建立帳號…','syncing');const {data,error}=await c.auth.signUp({email,password});if(error)throw error;if(data.session){state.user=data.user;renderAuth();await syncNow('auto');return '帳號已建立並登入。'}return '帳號已建立；若專案要求 Email 驗證，請先完成驗證再登入。'}
  function authRedirectUrl(){return location.origin+location.pathname}
  async function requestPasswordReset(email){const c=await ensureClient();const {error}=await c.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});if(error)throw error}
  async function updatePassword(password){const c=await ensureClient();const {error}=await c.auth.updateUser({password});if(error)throw error;state.passwordMode='';try{history.replaceState(null,'',authRedirectUrl())}catch{}renderAuth()}
  function showPasswordPanel(){window.MozeApp?.nav?.('settings');setTimeout(()=>{document.getElementById('syncPanel')?.scrollIntoView({behavior:'smooth',block:'start'});$('syncNewPassword')?.focus()},60)}
  async function signOut(){if(state.client)await state.client.auth.signOut();state.user=null;state.conflicts=[];renderAuth();setStatus('已登出','idle','尚未登入')}
  function localState(){return window.MozeApp?.getState?window.MozeApp.getState():window.state}
  function freshState(){return {accounts:[{id:'cash',name:'現金',type:'cash',balance:0},{id:'bank',name:'銀行帳戶',type:'bank',balance:0}],categories:[{id:'food',name:'飲食',icon:'🍜',kind:'expense'},{id:'transport',name:'交通',icon:'🚗',kind:'expense'},{id:'shopping',name:'購物',icon:'🛍️',kind:'expense'},{id:'home',name:'居家',icon:'⌂',kind:'expense'},{id:'ent',name:'娛樂',icon:'◉',kind:'expense'},{id:'salary',name:'薪資',icon:'＄',kind:'income'}],projects:[],transactions:[],budgets:[],recurring:[],loans:[]}}
  function switchLocalUser(nextUser){if(!nextUser)return;const last=localStorage.getItem(LS_LAST_USER)||'';if(last&&last!==nextUser.id){try{window.MozeApp?.setState?.(freshState(),{persist:true,markDirty:false})}catch(e){console.warn('local user switch',e)}}if(last!==nextUser.id){resetMetaCache();state.progress={done:0,total:0};}localStorage.setItem(LS_LAST_USER,nextUser.id)}
  // V25.17: an untouched starter (no transactions/loans/budgets/recurring/projects, only the default
  // empty accounts and categories) holds nothing worth keeping, so a new device just takes the cloud data.
  const STARTER_ACCOUNTS=new Set(['cash','bank']),STARTER_CATEGORIES=new Set(['food','transport','shopping','home','ent','salary']);
  function isPristineLocal(){const st=localState()||{};if(['transactions','loans','budgets','recurring','projects'].some(k=>(st[k]||[]).length))return false;return (st.accounts||[]).every(a=>STARTER_ACCOUNTS.has(String(a.id))&&!Number(a.balance))&&(st.categories||[]).every(c=>STARTER_CATEGORIES.has(String(c.id)))}
  function localRecord(entity,recordId){const st=localState()||{};return (st[entity]||[]).find(x=>String(x.id)===String(recordId))||null}
  function listLocalRecords(st){const out=[];for(const entity of ENTITIES){for(const row of (st?.[entity]||[]))out.push({entity,recordId:String(row.id),data:row})}return out}
  function applyRowToState(st,row){if(!st[row.entity])st[row.entity]=[];const arr=st[row.entity],idx=arr.findIndex(x=>String(x.id)===String(row.record_id));if(row.deleted){if(idx>=0)arr.splice(idx,1);return}if(idx>=0)arr[idx]=row.data;else arr.push(row.data)}
  function queueStateDiff(changes){
    if(!changes?.length)return;
    if(!state.user){localStorage.setItem('moze-sync-unauth-dirty-v25','1');setStatus('待同步','dirty','尚未登入');return}
    const now=new Date().toISOString();
    for(const ch of changes){
      const k=queueKey(ch.entity,ch.recordId),sk=queueStorageKey(k),existing=readQueueOpByStorageKey(sk);
      const op={entity:ch.entity,recordId:String(ch.recordId),op:ch.op,baseVersion:existing?Number(existing.baseVersion)||0:metaGetVersion(ch.entity,ch.recordId),queuedAt:existing?.queuedAt||now};
      localStorage.setItem(sk,JSON.stringify(op));
    }
    localStorage.setItem(scopedKey(LS_DIRTY),'1');
    setStatus('待同步','dirty',state.user.email);
  }
  async function queueAllLocal(records){
    if(!state.user) return;
    const st=localState()||{};
    let rows=records;
    if(!rows){rows=[];for(const entity of ENTITIES)for(const row of (st[entity]||[]))rows.push({entity,recordId:String(row.id),op:'upsert'})}
    queueStateDiff(rows);
    await yieldToBrowser();
  }
  function markDirty(){if(state.timer)clearTimeout(state.timer);setStatus('待同步','dirty',state.user?.email||'尚未登入');localStorage.setItem(scopedKey(LS_DIRTY),'1');if(state.user)state.timer=setTimeout(()=>syncNow('auto'),1200)}
  async function fetchRows(since=''){
    if(!state.user)throw new Error('尚未登入。');
    const pageSize=500;
    let from=0,all=[];
    for(;;){
      let q=state.client.from('moze_records').select('entity,record_id,data,deleted,version,updated_at,device_id').order('updated_at',{ascending:true}).range(from,from+pageSize-1);
      if(since)q=q.gte('updated_at',since);
      const {data,error}=await q;if(error)throw error;
      const rows=data||[];all.push(...rows);
      if(rows.length<pageSize)break;
      from+=pageSize;
      await yieldToBrowser();
    }
    return all;
  }
  const yieldToBrowser=()=>new Promise(resolve=>setTimeout(resolve,0));
  const BATCH=50;
  function updateProgress(done,total){state.progress={done,total};setStatus(total?`同步中… ${done.toLocaleString()}/${total.toLocaleString()}`:'同步中…','syncing',state.user?.email);}
  async function fetchLegacySnapshot(){try{const {data,error}=await state.client.from('moze_snapshots').select('state,updated_at,client_updated_at,device_id').eq('user_id',state.user.id).maybeSingle();if(error)return null;return data||null}catch{return null}}
  function rowPayload(data){return Array.isArray(data)?data[0]:data}
  async function writeRecordRaw(op,opts={}){
    const key=queueKey(op.entity,op.recordId);
    const hasLocalOverride=Object.prototype.hasOwnProperty.call(opts,'localRow');
    const local=hasLocalOverride?opts.localRow:localRecord(op.entity,op.recordId);
    const forceBaseVersion=opts.forceBaseVersion===undefined?null:opts.forceBaseVersion;
    const deleted=op.op==='delete'||!local,data=deleted?{}:local,baseVersion=forceBaseVersion===null?Number(op.baseVersion||0):Number(forceBaseVersion||0);
    const {data:result,error}=await state.client.rpc('moze_write_record',{p_entity:op.entity,p_record_id:String(op.recordId),p_data:data,p_deleted:deleted,p_base_version:baseVersion,p_device_id:deviceId()});
    if(error)throw error;
    const r=rowPayload(result)||{};
    if(r.status==='conflict')return {conflict:true,row:r.row,op,key};
    if(r.status!=='applied')throw new Error('雲端寫入沒有回傳成功狀態。');
    if(r.row)metaSet(op.entity,op.recordId,r.row.version,r.row.updated_at);
    return {ok:true,row:r.row,key};
  }
  async function writeRecord(op,{forceBaseVersion=null}={}){
    const result=await writeRecordRaw(op,{forceBaseVersion});
    if(result.ok){removeQueuedKey(result.key);flushMeta();if(!listQueueStorageKeys().length)localStorage.removeItem(scopedKey(LS_DIRTY));}
    return result;
  }
  async function pushQueued(){
    const keys=listQueueStorageKeys(),conflicts=[];
    const local=localState()||{},localMap=new Map();
    for(const entity of ENTITIES)for(const row of (local[entity]||[]))localMap.set(queueKey(entity,row.id),row);
    const total=keys.length;let done=0;updateProgress(0,total);
    for(let offset=0;offset<keys.length;offset+=BATCH){
      const batch=keys.slice(offset,offset+BATCH);
      for(const sk of batch){
        const op=readQueueOpByStorageKey(sk);if(!op)continue;
        try{
          const localRow=localMap.get(queueKey(op.entity,op.recordId))||null;
          let result=await writeRecordRaw(op,{localRow});
          // V25.10: conflict with row:null means the cloud has no such record (stale local
          // version metadata). Nothing in the cloud can be lost, so resolve automatically:
          // a delete is already satisfied; an upsert is re-sent as a fresh insert.
          if(result.conflict&&!result.row){
            if(op.op==='delete'||!localRow){metaClear(op.entity,op.recordId);result={ok:true}}
            else result=await writeRecordRaw(op,{localRow,forceBaseVersion:0});
          }
          if(result.conflict)conflicts.push(result);else localStorage.removeItem(sk);
        }catch(err){console.warn('MOZE Sync record upload',op?.entity,op?.recordId,err);throw err}
        done++;if(done%10===0)updateProgress(done,total);
      }
      flushMeta();updateProgress(done,total);await yieldToBrowser();
    }
    if(!listQueueStorageKeys().length)localStorage.removeItem(scopedKey(LS_DIRTY));
    return conflicts;
  }
  async function applyRemoteRows(rows,{replace=false}={}){
    const base=localState()||{},st=replace?freshState():base;
    if(replace)for(const e of ENTITIES)st[e]=[];
    const times=[],valid=[];
    for(const row of rows||[]){if(!ENTITIES.includes(row.entity))continue;applyRowToState(st,row);valid.push(row);if(row.updated_at)times.push(row.updated_at)}
    metaSetMany(valid);
    const m=getMeta();if(times.length)m.lastPull=times.reduce((max,v)=>v>max?v:max,'');flushMeta();
    await window.MozeApp.setState(st,{persist:true,markDirty:false});
  }
  async function pushFullLocal(remoteRows=[]){
    const remoteMap=new Map((remoteRows||[]).map(r=>[queueKey(r.entity,r.record_id),r]));
    const remoteKeys=new Set((remoteRows||[]).map(r=>queueKey(r.entity,r.record_id)));
    const local=localState()||{}, records=[];
    for(const entity of ENTITIES)for(const row of (local[entity]||[]))records.push({entity,recordId:String(row.id),data:row});
    const total=records.length;let done=0;updateProgress(0,total+(remoteRows?.length||0));
    for(let offset=0;offset<records.length;offset+=BATCH){
      const batch=records.slice(offset,offset+BATCH);
      for(const rec of batch){
        const rr=remoteMap.get(queueKey(rec.entity,rec.recordId));const base=rr?Number(rr.version)||0:0;
        const res=await writeRecordRaw({entity:rec.entity,recordId:rec.recordId,op:'upsert',baseVersion:base},{forceBaseVersion:base,localRow:rec.data});
        if(res.conflict)throw new Error(`無法上傳 ${rec.entity}/${rec.recordId}：雲端同筆資料正在變更。`);
        done++;updateProgress(done,total+(remoteRows?.length||0));
      }
      await yieldToBrowser();
    }
    const localKeys=new Set(records.map(r=>queueKey(r.entity,r.recordId)));
    let deletedDone=0;
    for(let offset=0;offset<(remoteRows?.length||0);offset+=BATCH){
      const batch=remoteRows.slice(offset,offset+BATCH);
      for(const rr of batch){
        if(!localKeys.has(queueKey(rr.entity,rr.record_id))&&!rr.deleted){
          const base=Number(rr.version)||0;const res=await writeRecordRaw({entity:rr.entity,recordId:rr.record_id,op:'delete',baseVersion:base},{forceBaseVersion:base});
          if(res.conflict)throw new Error(`無法刪除雲端多餘資料 ${rr.entity}/${rr.record_id}。`);
        }
        deletedDone++;updateProgress(total+deletedDone,total+(remoteRows?.length||0));
      }
      await yieldToBrowser();
    }
    clearQueue();clearLegacySyncData();markBootstrapped();
  }
  async function bootstrap(){
    const m=getMeta();if(m.bootstrapped)return;
    const rows=await fetchRows('');const legacy=rows.length?null:await fetchLegacySnapshot();
    const pristine=isPristineLocal();
    if(rows.length){const useCloud=pristine||confirm(`已找到這個帳號的雲端資料（${rows.length.toLocaleString()} 筆）。\n\n按「確定」：以雲端資料取代這台裝置的資料（建議）。\n按「取消」：以這台裝置的資料覆蓋雲端，雲端上這台裝置沒有的資料會被刪除。`);if(useCloud){await applyRemoteRows(rows,{replace:true});clearQueue();clearLegacySyncData();}else await pushFullLocal(rows)}
    else if(legacy?.state){const useLegacy=pristine||confirm('找到這個帳號的舊版 V24 雲端 Snapshot。\n\n按「確定」：將 V24 雲端資料升級成 V25 逐筆資料。\n按「取消」：保留本機資料並用本機資料建立 V25 雲端資料。');if(useLegacy){await window.MozeApp.setState(legacy.state,{persist:true,markDirty:false});await pushFullLocal([])}else await pushFullLocal([])}
    else await pushFullLocal([]);
    markBootstrapped();
  }
  async function pullAllFromCloud(){const remote=await fetchRows('');if(!remote.length)throw new Error('雲端目前沒有逐筆資料。');if(isDirty()&&!confirm('本機有尚未同步的變更。\n\n按「確定」會直接以雲端資料覆蓋本機。'))return;await applyRemoteRows(remote,{replace:true});clearQueue();clearLegacySyncData();markBootstrapped();markSynced(0,remote.length);setStatus('已同步','ok',state.user?.email);renderAuth();return true}
  async function resolveCloud(index){const c=state.conflicts[index];if(!c)return;const row=c.row||{entity:c.op.entity,record_id:String(c.op.recordId),deleted:true,version:0,updated_at:''};const st=JSON.parse(JSON.stringify(localState()||{}));applyRowToState(st,row);await window.MozeApp.setState(st,{persist:true,markDirty:false});removeQueuedKey(c.key);if(c.row)metaSet(row.entity,row.record_id,row.version,row.updated_at);else metaClear(row.entity,row.record_id);flushMeta();state.conflicts.splice(index,1);renderAuth();setStatus(isDirty()?'待同步':'已同步','ok',state.user?.email)}
  async function resolveLocal(index){const c=state.conflicts[index];if(!c)return;const op=readQueueOpByStorageKey(queueStorageKey(c.key))||c.op;if(!c.row&&(op.op==='delete'||!localRecord(op.entity,op.recordId))){removeQueuedKey(c.key);metaClear(op.entity,op.recordId);flushMeta();if(!listQueueStorageKeys().length)localStorage.removeItem(scopedKey(LS_DIRTY));state.conflicts.splice(index,1);renderAuth();setStatus(isDirty()?'待同步':'已同步','ok',state.user?.email);return}const res=await writeRecord(op,{forceBaseVersion:c.row?(Number(c.row.version)||0):0});if(res.conflict)throw new Error('雲端資料又被其他裝置修改，請重新同步。');state.conflicts.splice(index,1);renderAuth();setStatus(isDirty()?'待同步':'已同步','ok',state.user?.email)}
  async function syncNow(mode='auto'){if(localStorage.getItem('moze-offline-mode')==='1'){setStatus('離線模式','dirty','修改只存在這台裝置');return}if(state.loading){state.again=true;return}state.loading=true;state.again=false;try{if(!state.client||!state.user)await ensureClient();if(!state.user){setStatus('已連線，尚未登入','idle');return}setStatus('同步中…','syncing',state.user.email);if(!getMeta().bootstrapped){await bootstrap();state.conflicts=[];markSynced(0,0);setStatus('已同步','ok',state.user.email);renderAuth();return}const before=pendingCount();state.conflicts=await pushQueued();const pushed=Math.max(0,before-pendingCount());const m=getMeta(),rows=await fetchRows(m.lastPull||'');let pulled=0;if(rows.length){const safe=rows.filter(r=>!hasQueuedKey(queueKey(r.entity,r.record_id)));pulled=safe.length;await applyRemoteRows(safe,{replace:false});const latest=rows.map(r=>r.updated_at).filter(Boolean).reduce((max,v)=>v>max?v:max,'');if(latest){const mm=getMeta();mm.lastPull=latest;flushMeta()}}if(state.conflicts.length){renderAuth();setStatus('有同步衝突','error',state.user.email);return}markSynced(pushed,pulled);setStatus(isDirty()?'待同步':'已同步',isDirty()?'dirty':'ok',state.user.email);renderAuth()}catch(err){console.error('MOZE Sync V25.5',err);setStatus('同步失敗','error',err.message||'請檢查設定');if(mode!=='silent')alert('同步失敗：'+(err.message||err))}finally{state.loading=false;if(state.again&&state.user){state.again=false;setTimeout(()=>syncNow('silent'),300)}}}
  function conflictLabel(c){const local=localRecord(c.op.entity,c.op.recordId);return `${c.op.entity} · ${local?.name||local?.person||c.op.recordId}`.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  // V25.10.1: password inputs with a show/hide (eye) toggle.
  const EYE_OPEN='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  function pwField(id,autocomplete,placeholder){return `<span class="pw-field"><input id="${id}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}"><button type="button" class="pw-toggle" data-toggle-password="${id}" aria-label="顯示密碼" aria-pressed="false" title="顯示密碼">${EYE_OPEN}</button></span>`}
  function togglePassword(btn){const input=$(btn.dataset.togglePassword);if(!input)return;const show=input.type==='password';input.type=show?'text':'password';btn.innerHTML=show?EYE_OFF:EYE_OPEN;btn.setAttribute('aria-pressed',String(show));const label=show?'隱藏密碼':'顯示密碼';btn.setAttribute('aria-label',label);btn.title=label}
  function renderAuth(){
    const box=$('syncAccountArea');
    if(!box)return;
    if(state.user&&state.passwordMode){
      const recovery=state.passwordMode==='recovery';
      box.innerHTML=`<div class="sync-password-card">
        <b>${recovery?'重設密碼':'變更密碼'}</b>
        <small>${recovery?'已透過重設信驗證帳號，請設定新密碼。':'為目前登入的帳號設定新密碼。'}</small>
        <span class="sync-password-email">${String(state.user.email||'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}</span>
        <div class="sync-login-grid">
          <label>新密碼${pwField('syncNewPassword','new-password','至少 6 碼')}</label>
          <label>再輸入一次${pwField('syncNewPassword2','new-password','再輸入一次新密碼')}</label>
          <div class="sync-login-actions">
            ${recovery?'':'<button type="button" class="secondary" id="syncPasswordCancel">取消</button>'}
            <button type="button" class="primary" id="syncPasswordSave">儲存新密碼</button>
          </div>
        </div>
      </div><div id="syncConflictArea"></div>`;
    }else if(state.user){
      box.innerHTML=`<div class="sync-user-card">
        <div><b>已登入雲端帳號</b><span>${String(state.user.email||'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}</span><small class="sync-last">${syncSummary()}</small></div>
        <div class="sync-user-actions">
          <button type="button" class="secondary" id="syncForcePull">從雲端載入</button>
          <button type="button" class="secondary" id="syncForcePush">上傳本機</button>
          <button type="button" class="secondary" id="syncChangePassword">變更密碼</button>
          <button type="button" class="secondary" id="syncLogout">登出</button>
        </div>
      </div><div id="syncConflictArea"></div>`;
    }else{
      box.innerHTML=`<div class="sync-login-grid">
        <label>Email<input id="syncEmail" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <label>密碼${pwField('syncPassword','current-password','至少 6 碼')}</label>
        <div class="sync-login-actions">
          <button type="button" class="secondary" id="syncSignup">建立帳號</button>
          <button type="button" class="primary" id="syncLogin">登入</button>
        </div>
        <button type="button" class="link-button sync-forgot" id="syncForgot">忘記密碼？</button>
      </div><div id="syncConflictArea"></div>`;
    }
    bindAuthButtons();
    renderConflicts();
    renderConflictButtons();
  }

  function renderConflicts(){const box=$('syncConflictArea');if(!box)return;if(!state.conflicts.length){box.innerHTML='';return}box.innerHTML=`<div class="sync-conflict-box"><div><b>同步衝突 ${state.conflicts.length} 筆</b><p>只有同一筆資料被兩台裝置同時修改時才需要處理；其他資料已自動合併。</p>${state.conflicts.length>1?`<div class="sync-conflict-all"><button type="button" class="secondary" data-conflict-all="cloud">全部保留雲端</button><button type="button" class="primary" data-conflict-all="local">全部保留本機</button></div>`:''}</div>${state.conflicts.map((c,i)=>`<div class="sync-conflict-row"><span>${conflictLabel(c)}</span><div><button type="button" class="secondary" data-conflict-cloud="${i}">保留雲端</button><button type="button" class="primary" data-conflict-local="${i}">保留本機</button></div></div>`).join('')}</div>`}
  async function resolveAll(which){const n=state.conflicts.length;if(!n)return;if(!confirm(which==='cloud'?`全部 ${n} 筆衝突都改用雲端版本？\n這台裝置上這些資料的修改會被雲端覆蓋。`:`全部 ${n} 筆衝突都保留這台裝置的版本？\n雲端上這些資料會被這台裝置覆蓋。`))return;let done=0;try{while(state.conflicts.length){const before=state.conflicts.length;await (which==='cloud'?resolveCloud(0):resolveLocal(0));if(state.conflicts.length>=before)throw new Error('無法處理：'+conflictLabel(state.conflicts[0]));done++}}catch(e){alert(`已處理 ${done} 筆，其餘失敗：${e.message||e}`)}renderAuth()}
  function renderConflictButtons(){document.querySelectorAll('[data-conflict-all]').forEach(b=>b.onclick=()=>resolveAll(b.dataset.conflictAll));document.querySelectorAll('[data-conflict-cloud]').forEach(b=>b.onclick=async()=>{try{await resolveCloud(Number(b.dataset.conflictCloud))}catch(e){alert('保留雲端失敗：'+e.message)}});document.querySelectorAll('[data-conflict-local]').forEach(b=>b.onclick=async()=>{try{await resolveLocal(Number(b.dataset.conflictLocal))}catch(e){alert('保留本機失敗：'+e.message)}})}
  function bindAuthButtons(){$('syncLogin')?.addEventListener('click',async()=>{const e=$('syncEmail')?.value.trim(),p=$('syncPassword')?.value||'';if(!e||!p)return alert('請輸入 Email 與密碼。');try{await signIn(e,p)}catch(err){alert('登入失敗：'+err.message)}});$('syncSignup')?.addEventListener('click',async()=>{const e=$('syncEmail')?.value.trim(),p=$('syncPassword')?.value||'';if(!e||p.length<6)return alert('請輸入 Email，密碼至少 6 碼。');try{const msg=await signUp(e,p);alert(msg)}catch(err){alert('建立帳號失敗：'+err.message)}});$('syncLogout')?.addEventListener('click',()=>signOut());$('syncForgot')?.addEventListener('click',async()=>{const e=$('syncEmail')?.value.trim();if(!e)return alert('請先在 Email 欄位輸入註冊時使用的 Email，再按「忘記密碼？」。');if(!confirm(`要寄送密碼重設信到 ${e} 嗎？`))return;try{await requestPasswordReset(e);alert('若此 Email 有註冊帳號，重設密碼信已寄出。\n請在這台裝置上開啟信中的連結，回到 MOZE 後設定新密碼。\n（沒收到請檢查垃圾郵件；短時間內重複寄送可能會被限制。）')}catch(err){alert('寄送重設信失敗：'+err.message)}});$('syncChangePassword')?.addEventListener('click',()=>{state.passwordMode='change';renderAuth();showPasswordPanel()});$('syncPasswordCancel')?.addEventListener('click',()=>{state.passwordMode='';renderAuth()});$('syncPasswordSave')?.addEventListener('click',async()=>{const p=$('syncNewPassword')?.value||'',p2=$('syncNewPassword2')?.value||'';if(p.length<6)return alert('新密碼至少 6 碼。');if(p!==p2)return alert('兩次輸入的新密碼不一致。');try{await updatePassword(p);alert('新密碼已設定完成，下次登入請使用新密碼。')}catch(err){alert('設定新密碼失敗：'+err.message)}});$('syncForcePull')?.addEventListener('click',async()=>{try{await pullAllFromCloud()}catch(err){alert('從雲端載入失敗：'+err.message)}});$('syncForcePush')?.addEventListener('click',async()=>{try{const rows=await fetchRows('');await pushFullLocal(rows);await syncNow('auto')}catch(err){alert('上傳本機失敗：'+err.message)}})}
  function bindUI(){document.addEventListener('click',e=>{const b=e.target.closest?.('[data-toggle-password]');if(b){e.preventDefault();togglePassword(b)}});$('syncNowBtn')?.addEventListener('click',()=>syncNow('auto'));$('syncTopAction')?.addEventListener('click',()=>{window.MozeApp?.nav('settings');setTimeout(()=>document.getElementById('syncPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),30)});renderAuth();window.addEventListener('online',()=>{if(state.user)syncNow('auto')});window.addEventListener('offline',()=>setStatus('離線','offline',state.user?.email||'本機仍可使用'));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.user)syncNow('silent')});setInterval(()=>{if(state.user&&navigator.onLine&&!state.loading)syncNow('silent')},20000)}
  async function getAllCloudRows(){return fetchRows('')}
  async function replaceCloudWithLocal(remoteRows){await pushFullLocal(remoteRows||[]);markSynced(0,0);setStatus('已同步','ok',state.user?.email);renderAuth()}
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
    // V26.120 calls one of this project's Edge Functions as the signed-in user → { data } or { error }
    invoke:async(name,body)=>{try{if(!getCfg().url)return{error:'尚未設定雲端同步'};await ensureClient();if(!state.user)return{error:'需先登入雲端同步'};const r=await state.client.functions.invoke(name,{body});if(r.error){const m=String(r.error.message||r.error);return{error:/not found|404/i.test(m)?'找不到 Edge Function「'+name+'」，請先部署（見 supabase/functions/einvoice/README.md）':m}}return{data:r.data}}catch(e){return{error:e.message||String(e)}}},
    isLoggedIn:()=>!!state.user,account:()=>String(state.user?.email||''),lastSyncAt:()=>{try{return getMeta().lastSyncAt||''}catch{return ''}},offline:()=>localStorage.getItem('moze-offline-mode')==='1',pullAllFromCloud,resolveAllConflicts:resolveAll,markDirty,queueStateDiff,queueAllLocal,syncNow,signIn,signUp,signOut,getCfg,requestPasswordReset,updatePassword
  };
})();
