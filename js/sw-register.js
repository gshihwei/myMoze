// V25.15: service worker registration + "new version" prompt.
// Checks for a new version on load, whenever the app returns to the foreground, and every 30 minutes.
// When a new version takes over, shows a banner; the page reloads only when the user taps it.
(function(){
  if(!('serviceWorker' in navigator) || location.protocol==='file:') return;
  const sw=navigator.serviceWorker, hadController=!!sw.controller;
  let shown=false;
  function showUpdate(version){
    if(shown || !hadController) return; shown=true;
    const bar=document.createElement('div');
    bar.className='update-banner'; bar.setAttribute('role','status');
    bar.innerHTML='<span>帳小簿 已更新'+(version?' 到 <b>V'+String(version).replace(/[^\w.]/g,'')+'</b>':'')+'，重新整理後套用</span><button type="button" class="primary">立即更新</button><button type="button" class="update-later" aria-label="稍後">稍後</button>';
    bar.querySelector('.primary').onclick=()=>location.reload();
    bar.querySelector('.update-later').onclick=()=>bar.remove();
    document.body.appendChild(bar);
  }
  sw.addEventListener('message',e=>{ if(e.data&&e.data.type==='moze-updated') showUpdate(e.data.version); });
  sw.addEventListener('controllerchange',()=>setTimeout(()=>showUpdate(''),1500));
  window.addEventListener('load',()=>{
    sw.register('./sw.js').then(reg=>{
      const check=()=>reg.update().catch(()=>{});
      document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') check(); });
      setInterval(check,30*60*1000);
    }).catch(()=>{});
  });
})();
