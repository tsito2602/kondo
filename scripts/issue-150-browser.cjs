const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createServer } = require('node:http');
const { chromium, webkit } = require('playwright');
const dist = path.resolve('dist'), out = '/tmp/detail-shots'; fs.mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist + '/') && file !== dist) { res.writeHead(400); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(dist, 'index.html');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
  try {
    for (const [engine, launcher] of [['chromium',chromium],['webkit',webkit]]) {
      const browser = await launcher.launch();
      try {
        for (const [label, width, dark, reduced] of [['phone',390,false,false],['dark',390,true,false],['desktop',1440,false,false],['reduced',390,false,true]]) {
          const context = await browser.newContext({ viewport:{width,height:844}, colorScheme:dark?'dark':'light', reducedMotion:reduced?'reduce':'no-preference', serviceWorkers:'block' });
          const page = await context.newPage(), errors=[];
          page.setDefaultTimeout(12000);
          page.on('pageerror', error => errors.push(error.message));
          await page.addInitScript(() => {
            window.detailRecords=[]; window.detailAnimations=[]; window.freezeDetail=false;
            const original=Element.prototype.animate;
            Element.prototype.animate=function(frames,options){
              const animation=original.call(this,frames,options);
              if(this.matches('[data-detail-motion],.detail-motion-label,[data-testid="form-sheet-fill"]')) {
                window.detailAnimations.push(animation);
                window.detailRecords.push({target:this.dataset.testid||this.className,frames,options});
                if(window.freezeDetail){animation.pause();animation.currentTime=170;}
              }
              return animation;
            };
          });
          const waitSettled = async () => { await page.waitForFunction(() => !document.querySelector('.detail-motion-label')); await page.waitForTimeout(420); };
          const sheet = () => page.locator('[data-testid="form-sheet"]:visible').last();
          const close = async () => { await sheet().getByRole('button',{name:'閉じる',exact:true}).click(); await page.locator('[data-testid="form-sheet"]:visible').waitFor({state:'hidden'}); await page.waitForTimeout(100); };
          const tab = async (name) => { if(width>=1024) await page.getByRole('navigation').getByRole('link',{name,exact:true}).click(); else await page.getByRole('tab',{name,exact:true}).click(); await page.waitForTimeout(220); };
          try {
            await page.goto('http://127.0.0.1:4173');
            await page.getByRole('button',{name:'サンプルの旅行で試す',exact:true}).click();
            await page.getByTestId('trip-ticket').first().click();
            await page.getByTestId('itinerary-scroll').waitFor();
            // Real reservation from the journal: no page navigation or list reset.
            const first = page.getByTestId('detail-source-title').first();
            await first.scrollIntoViewIfNeeded();
            const before = await page.getByTestId('itinerary-scroll').evaluate(el=>el.scrollTop);
            await first.click(); await sheet().waitFor(); await waitSettled();
            assert.equal(await sheet().getAttribute('data-detail-motion'),'');
            assert(await sheet().getByTestId('detail-target-title').count());
            await close();
            assert(Math.abs(await page.getByTestId('itinerary-scroll').evaluate(el=>el.scrollTop)-before)<2,'journal position restored');
            // Create a plan to exercise an exactly matching shared title/time.
            await page.getByRole('button',{name:'予定を追加する',exact:true}).click();
            await page.getByRole('textbox',{name:'予定名',exact:true}).fill('展示をめぐる');
            await sheet().getByRole('button',{name:'保存',exact:true}).click();
            await page.locator('[data-testid="form-sheet"]:visible').waitFor({state:'hidden'});
            const plan = page.getByTestId('detail-source-title').filter({hasText:'展示をめぐる'}).first();
            await plan.scrollIntoViewIfNeeded();
            await page.evaluate(freeze=>{window.freezeDetail=freeze;},!reduced);
            await plan.click(); await sheet().waitFor();
            if(!reduced){
              await page.waitForFunction(()=>document.querySelectorAll('.detail-motion-label').length>=1);
              const moving = await sheet().evaluate(el=>({transform:getComputedStyle(el).transform,clip:getComputedStyle(el).clipPath,opacity:getComputedStyle(el).opacity}));
              assert.equal(moving.opacity,'1'); assert.notEqual(moving.clip,'none');
              await page.screenshot({path:path.join(out,`${engine}-${label}-expanding.png`)});
              await page.evaluate(()=>{window.freezeDetail=false;window.detailAnimations.forEach(animation=>{if(animation.playState==='paused')animation.play();});});
            }
            await waitSettled();
            assert.equal(await sheet().getByTestId('detail-target-title').innerText(),'展示をめぐる');
            assert.equal(await sheet().getByTestId('detail-target-title').evaluate(el=>getComputedStyle(el).visibility),'visible');
            if(width<600&&!reduced){
              const grip=await sheet().getByTestId('detail-dismiss-handle').boundingBox();
              assert(grip&&grip.height>=28);
              const x=grip.x+grip.width/2,y=grip.y+grip.height/2;
              await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x,y+45,{steps:6}); await page.mouse.move(x,y+4,{steps:8}); await page.mouse.up(); await page.waitForTimeout(220);
              assert(await sheet().isVisible(),'reversed drag keeps detail open');
              await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+160,{steps:15});
              await page.screenshot({path:path.join(out,`${engine}-${label}-drag.png`)});
              await page.mouse.up();await page.locator('[data-testid="form-sheet"]:visible').waitFor({state:'hidden'});
              await page.waitForTimeout(120);
              assert.equal(await plan.evaluate(el=>document.activeElement?.contains(el)),true,'focus returns to the original plan');
              await plan.click();await waitSettled();
            }
            await page.screenshot({path:path.join(out,`${engine}-${label}-detail.png`)});
            // Reading -> editing must not replay the expansion or lose a draft.
            await sheet().getByRole('button',{name:'編集',exact:true}).click();
            const input=page.getByRole('textbox',{name:'予定名',exact:true});
            await input.fill('未保存の編集');
            await sheet().getByRole('button',{name:'閉じる',exact:true}).click();
            await page.getByRole('button',{name:'編集を続ける',exact:true}).click();
            assert.equal(await input.inputValue(),'未保存の編集');
            await sheet().getByRole('button',{name:'閉じる',exact:true}).click();
            await page.getByRole('button',{name:'変更を破棄',exact:true}).click();
            await page.locator('[data-testid="form-sheet"]:visible').waitFor({state:'hidden'});
            // Both other entry points use the same controller; ancillary buttons
            // (map, status and preparation) are not captured as detail origins.
            await tab('予約');
            await page.getByTestId('booking-ticket').first().click();await waitSettled();
            assert.equal(await sheet().getAttribute('data-detail-motion'),'');await close();
            await tab('行きたい場所');
            await page.getByRole('button',{name:'場所を追加',exact:true}).last().click();
            await page.getByRole('textbox',{name:'場所のタイトル',exact:true}).fill('静かな美術館');
            await sheet().getByRole('button',{name:'保存',exact:true}).click();await waitSettled();await close();
            const place=page.getByTestId('detail-source-title').filter({hasText:'静かな美術館'}).first();
            await place.click();await waitSettled();
            assert.equal(await sheet().getByTestId('detail-target-title').innerText(),'静かな美術館');
            await close();
            assert.equal(await page.locator('.detail-motion-label').count(),0);
            assert.equal(await page.locator('[data-detail-motion]').count(),0);
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport overflow');
            if(reduced) assert.equal(await page.evaluate(()=>window.detailRecords.length),0,'reduced motion skips geometry and label animations');
            assert.deepEqual(errors,[]);
            console.log(`PASS ${engine}/${label}: journal booking, plan/title, close/scroll, edit/discard, reservation list, place, cleanup${width<600&&!reduced?', drag reversal/dismissal/focus':''}`);
          } catch(error){ await page.screenshot({path:path.join(out,`${engine}-${label}-failure.png`)}); throw error; }
          finally {await context.close();}
        }
      } finally {await browser.close();}
    }
  } finally {server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
