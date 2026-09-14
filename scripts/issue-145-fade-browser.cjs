const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { chromium, webkit } = require('playwright');
const sharp = require('sharp');
const root = path.resolve('dist');
const out = '/tmp/fade-shots'; fs.mkdirSync(out, {recursive:true});
const server = createServer((req,res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(400); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
async function pixelDifference(a,b) {
  const one = await sharp(a).removeAlpha().raw().toBuffer();
  const two = await sharp(b).removeAlpha().raw().toBuffer();
  assert.equal(one.length,two.length); let sum=0;
  for(let i=0;i<one.length;i++) sum+=Math.abs(one[i]-two[i]);
  return sum/one.length;
}
(async()=>{
  await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
  try {
    for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]) {
      const browser = await launcher.launch();
      try {
        for(const [label,width,dark,reduced] of [['phone',390,false,false],['dark',390,true,false],['desktop',1440,false,false],['reduced',390,false,true]]) {
          const context=await browser.newContext({viewport:{width,height:844},colorScheme:dark?'dark':'light',reducedMotion:reduced?'reduce':'no-preference',serviceWorkers:'block'});
          const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
          await page.addInitScript(({pause})=>{
            window.__journeys=[];
            const start=document.startViewTransition?.bind(document); if(!start)return;
            document.startViewTransition=(update)=>{
              const record={ready:false,error:null,animations:[]};window.__journeys.push(record);
              const t=start(update);
              t.ready.then(()=>{
                record.animations=document.getAnimations().filter(a=>a.effect?.pseudoElement?.startsWith('::view-transition'));
                if(pause)record.animations.forEach(a=>{a.pause();a.currentTime=0;});
                record.ready=true;
              },e=>record.error=e.message);
              return t;
            };
          },{pause:engine==='chromium'});
          await page.goto('http://127.0.0.1:4173');
          await page.getByRole('button',{name:'サンプルの旅行で試す',exact:true}).click();
          const ticket=page.locator('[data-testid="trip-ticket"]:visible').first();await ticket.waitFor();
          const ticketBefore=await ticket.boundingBox();
          await ticket.click();
          const supported=await page.evaluate(()=>typeof document.startViewTransition==='function');
          const paused=engine==='chromium' && !reduced && supported;
          for(const direction of ['open','close']) {
            if(direction==='close') {
              if(width>=1024) await page.getByText('すべての旅行',{exact:true}).click();
              else await page.getByTestId('trip-back').click();
            }
            if(!reduced && supported) await page.waitForFunction(()=>window.__journeys.at(-1)?.ready || window.__journeys.at(-1)?.error);
            assert.equal(await page.evaluate(()=>window.__journeys.at(-1)?.error ?? null),null);
            if(paused) {
              assert(await page.evaluate(()=>window.__journeys.at(-1).animations.length>0),'pseudo animations must be controlled');
              const duration=direction==='open'?420:340;
              const foreground=direction==='open'?(width<1024?'tabi-trip-caption':'tabi-trip-header'):'tabi-trip-ticket-face';
              const target=direction==='open'?(width<1024?page.getByTestId('trip-hero-caption'):page.getByTestId('trip-header')):page.locator('[data-testid="trip-ticket-face"]:visible').first();
              const samples=[];
              for(const time of [0,140,220,duration-1]) {
                await page.evaluate(time=>window.__journeys.at(-1).animations.forEach(a=>a.currentTime=time),time);
                const opacity=await page.evaluate(name=>Number(getComputedStyle(document.documentElement,`::view-transition-new(${name})`).opacity),foreground);
                samples.push(opacity);
                if(time===0 && direction==='open')assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement,'::view-transition-new(tabi-trip-paper)').opacity),'1','paper stays opaque from first frame');
              }
              assert.equal(samples[0],0);assert(samples[1]>0 && samples[1]<1);assert(samples[2]>samples[1]);assert.equal(samples[3],1);
              const clip=await target.boundingBox();
              const before=await page.screenshot({clip,path:path.join(out,`${engine}-${label}-${direction}-last.png`)});
              await page.evaluate(()=>window.__journeys.at(-1).animations.forEach(a=>a.finish()));
              await page.waitForFunction(()=>!document.documentElement.dataset.tripTransition);
              await page.waitForTimeout(100);
              const after=await page.screenshot({clip,path:path.join(out,`${engine}-${label}-${direction}-settled.png`)});
              const difference=await pixelDifference(before,after);
              assert(difference<5,`${engine}/${label}/${direction}: handoff pixel difference ${difference}`);
              console.log(`PASS ${engine}/${label}/${direction}: fade ${samples.join(' -> ')}, handoff difference ${difference.toFixed(3)}`);
            } else {
              await page.waitForFunction(()=>!document.documentElement.dataset.tripTransition);
              console.log(`PASS ${engine}/${label}/${direction}: navigation settled`);
            }
          }
          if(reduced)assert.equal(await page.evaluate(()=>window.__journeys.length),0);
          const ticketAfter=await page.locator('[data-testid="trip-ticket"]:visible').first().boundingBox();
          assert(Math.abs(ticketBefore.width-ticketAfter.width)<1 && Math.abs(ticketBefore.height-ticketAfter.height)<1,'return preserves ticket geometry');
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
          assert.equal(await page.evaluate(()=>[...document.querySelectorAll('[style]')].filter(e=>e.style.viewTransitionName).length),0,'snapshot names leaked');
          assert.deepEqual(errors,[]);await context.close();
        }
      } finally {await browser.close();}
    }
  } finally {server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
