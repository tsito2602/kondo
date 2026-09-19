import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Staging-only responsive QA. An iframe gives the actual app its own narrow
// viewport (media queries, window dimensions, fixed elements and modal portals).
// It does not emulate Safari, the software keyboard or iOS safe-area values.
export async function buildMobileCheck(root, enabled) {
  const file = path.join(root, '__icon-check', 'mobile.html');
  await rm(file, { force: true });
  if (!enabled) return;
  await writeFile(file, `<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<title>Tabi mobile layout check</title>
<style>body{margin:16px;background:#ddd;color:#111;font:14px system-ui}header{position:absolute;left:470px;right:20px}button,select{padding:8px;margin:4px}iframe{display:block;border:1px solid #888;background:white}pre{white-space:pre-wrap}</style>
</head><body><header><h1>スマホ比率の表示確認</h1>
<p>実際のアプリを指定サイズで表示。Safari・キーボード・ノッチの実機検証は別途必要です。</p>
<label>画面サイズ <select id="size"><option>402×874</option><option>390×844</option><option>375×667</option></select></label>
<nav id="routes"></nav><button id="measure">下端を計測</button><pre id="result"></pre></header>
<iframe id="phone" title="スマホ表示" width="402" height="874" src="/"></iframe>
<script>
const phone=document.getElementById('phone');
document.getElementById('size').onchange=e=>{const [w,h]=e.target.value.split('×');phone.width=w;phone.height=h;};
const routes=[['旅行一覧','/'],['設定','/settings'],...['itinerary','bookings','places','packing','notes','members'].map((p,i)=>[['しおり','予約','行きたい場所','準備','メモ','メンバー'][i],'/trips/sample-vienna/'+p])];
for(const [name,url] of routes){const b=document.createElement('button');b.textContent=name;b.onclick=()=>phone.src=url;document.getElementById('routes').append(b);}
document.getElementById('measure').onclick=()=>{
 const w=phone.contentWindow,d=phone.contentDocument;
 const selectors=['#root','[data-testid="web-workspace"]','[data-testid="trip-workspace"]','[data-testid="route-transition"]','[data-testid="home-scroll"]','[data-testid="itinerary-scroll"]','[data-testid="bookings-scroll"]','[data-testid="places-scroll"]','[data-testid="packing-scroll"]','[data-testid="members-scroll"]','[data-testid="form-modal-viewport"]','[data-testid="form-sheet"]','[data-testid="form-sheet-scroll"]'];
 const rows=selectors.flatMap(s=>Array.from(d.querySelectorAll(s)).map(e=>{const r=e.getBoundingClientRect();return {element:s,top:Math.round(r.top),bottom:Math.round(r.bottom),gap:Math.round(w.innerHeight-r.bottom)};}));
 document.getElementById('result').textContent=JSON.stringify({viewport:[w.innerWidth,w.innerHeight],path:w.location.pathname,rows},null,2);
};
</script></body></html>`);
}
