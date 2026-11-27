// 帳小簿 V26.124 — runs first, in <head>: theme before first paint, and a guard against being framed by another site.
// Kept as a file (not inline) so the Content-Security-Policy can forbid inline scripts.
try{var p=JSON.parse(localStorage.getItem("moze-prefs-v1")||"{}"),t=p.theme||"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t;if(p.lockHash&&p.lockSalt)document.documentElement.dataset.locked="1"}catch(e){}
// Clickjacking guard: GitHub Pages cannot send frame-ancestors, so refuse to show inside another site's frame.
try { if (window.top !== window.self && window.top.location.origin !== location.origin) throw 0; } catch (e) { document.documentElement.dataset.framed = '1'; }
