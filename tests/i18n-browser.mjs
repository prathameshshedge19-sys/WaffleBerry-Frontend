import {readFile, readdir, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.L19_PLAYWRIGHT_MODULE));
const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({headless:true,channel:process.env.GUIDE_BROWSER_CHANNEL||undefined});
const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);
const failures=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const out=process.env.I18N_SCREENSHOTS;if(out)await mkdir(out,{recursive:true});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());if(url.hostname!=='language.test')return route.abort();
 if(['.js','.mjs'].includes(extname(url.pathname))&&!/\/(i18n|product-guide)\.js$/.test(url.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
 try{return route.fulfill({body:await readFile(resolve(root,'.'+url.pathname)),contentType:({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'})[extname(url.pathname)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
});
const catalogs={};for(const lang of ['de','fr','hi','mr'])catalogs[lang]=JSON.parse(await readFile(resolve(root,`locales/${lang}.json`),'utf8'));
let checks=0;
async function ready(){await page.evaluate(()=>window.LegaryaI18n.ready);await page.evaluate(()=>window.LegaryaI18n.translate(document.documentElement));}
async function within(selector){const b=await page.locator(selector).boundingBox();const v=page.viewportSize();assert.ok(b&&b.x>=-1&&b.x+b.width<=v.width+1&&b.y>=-1&&b.y+b.height<=v.height+1,selector+' viewport bounds');checks++;}
try{
 await page.setViewportSize({width:1280,height:900});await page.goto('https://language.test/index.html');await ready();
 for(const lang of ['de','fr','hi','mr']){
  await page.locator('#siteLanguage').selectOption(lang);await page.waitForFunction(lang=>document.documentElement.lang===lang&&document.querySelector('#siteLanguage').disabled===false,lang);
  assert.equal(await page.locator('.language-bar label').innerText(),catalogs[lang].Language);checks++;
  const names=(await readdir(root)).filter(f=>f.endsWith('.html')&&f!=='realtime-dev.html');
  for(const name of names){
   await page.goto('https://language.test/'+name);await ready();
   assert.equal(await page.locator('html').getAttribute('lang'),lang,name+' persistent locale');checks++;
   assert.equal(await page.locator('.lg-help-launcher').innerText(),catalogs[lang]['? Help']);checks++;
   const remaining=await page.evaluate(()=>{
    const skip='[translate="no"],[data-i18n-skip],script,style,code,pre,textarea,svg,option,#userName,#userEmail,#accountInitial,#legacyName,#sidebarLegacyName,#emptyLegacyName,#inviteLegacy,#inviteOwner,#joinOwnerName,#joinLegacyName,#legacyPreviewName,#legacyInitial,#presenceInitial';
    const nodes=[];const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode,s=n.data.trim();if(!s||!/[A-Za-z]{3}/.test(s)||n.parentElement.closest(skip)||!n.parentElement.getClientRects().length)continue;
     if(n.parentElement.closest('[hidden]'))continue;nodes.push(s);}
    return [...new Set(nodes)];
   });
   // Report residual Latin words for editorial review; technical codes/URLs and brands are allowed.
   if(['hi','mr'].includes(lang))failures.push({lang,page:name,residual:remaining.filter(s=>!/(?:waffleberry\.app|COL-|LEG-|PDF|JPEG|PNG|UTF-|WebP|MB|ID|Marin|Cedar|@|©|API|oauth|WAV)/.test(s))});
   if(['chat.html','gateway.html','auth.html'].includes(name)){
    await page.locator('.lg-help-launcher').click();await within('.lg-help');assert.equal(await page.locator('.lg-help select').inputValue(),lang);checks++;
    if(out&&name==='gateway.html')await page.screenshot({path:resolve(out,`help-${lang}.png`)});
    await page.keyboard.press('Escape');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${lang} overflow`);checks++;
  }
  await page.setViewportSize({width:390,height:900});
  for(const name of ['index.html','gateway.html','auth.html','chat.html','legacy-chat.html']){
   await page.goto('https://language.test/'+name);await ready();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${lang} mobile overflow`);checks++;
   await within('.lg-help-launcher');
   if(name==='index.html'){await within('#siteLanguage');if(out)await page.screenshot({path:resolve(out,`home-${lang}-390.png`)});}
   if(name==='gateway.html'){
    await page.locator('.lg-tutorial-launcher').click();await within('.lg-coach');
    if(out)await page.screenshot({path:resolve(out,`tutorial-${lang}-390.png`)});
    await page.locator('.lg-skip').click();
   }
  }
  await page.setViewportSize({width:320,height:900});
  for(const name of ['index.html','gateway.html','auth.html','chat.html','legacy-chat.html']){
   await page.goto('https://language.test/'+name);await ready();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${lang} narrow overflow`);checks++;
   await within('.lg-help-launcher');
   if(name==='gateway.html'){await page.locator('.lg-tutorial-launcher').click();await page.locator('.lg-coach').waitFor();await page.evaluate(()=>new Promise(requestAnimationFrame));await within('.lg-coach');if(out)await page.screenshot({path:resolve(out,`tutorial-${lang}-320.png`)});await page.locator('.lg-skip').click();}
  }
  await page.setViewportSize({width:1280,height:900});
  await page.goto('https://language.test/index.html');await ready();
 }
 // Actual user content, user values and source filenames must survive language changes.
 await page.goto('https://language.test/chat.html');await ready();
 await page.evaluate(()=>{
  const host=document.createElement('div');host.id='localizationFixture';host.innerHTML='<p class="message-content">Help Memories English</p><div class="memory-card-copy"><p>Memories</p></div><p translate="no">Help</p><input id="keptInput" value="My unchanged story"><button id="keptButton">Save memory</button><p id="dynamicStatus">Uploading family-photo.png…</p><input id="fixtureFile" type="file">';document.body.append(host);window.testClicks=0;document.querySelector('#keptButton').onclick=()=>window.testClicks++;
 });
 await page.evaluate(()=>window.LegaryaI18n.setLanguage('hi'));
 assert.equal(await page.locator('#keptInput').inputValue(),'My unchanged story');assert.equal(await page.locator('.message-content').last().innerText(),'Help Memories English');
 assert.equal(await page.locator('#localizationFixture [translate="no"]').innerText(),'Help');
 assert.match(await page.locator('#dynamicStatus').innerText(),/family-photo\.png/);checks+=4;
 await page.evaluate(()=>document.querySelector('#keptButton').click());assert.equal(await page.evaluate(()=>window.testClicks),1);checks++;
 await page.locator('#fixtureFile').setInputFiles({name:'Memories.txt',mimeType:'text/plain',buffer:Buffer.from('a private story')});
 assert.equal(await page.locator('.i18n-file-control [translate="no"]').innerText(),'Memories.txt');checks++;
 await page.evaluate(()=>window.LegaryaI18n.setLanguage('en'));assert.equal(await page.locator('#keptButton').innerText(),'Save memory');checks++;
 await page.evaluate(()=>{const status=document.querySelector('#dynamicStatus');status.textContent='Memory updated. Rya will use the new version immediately.';});
 await page.evaluate(()=>window.LegaryaI18n.setLanguage('fr'));assert.equal(await page.locator('#dynamicStatus').innerText(),catalogs.fr['Memory updated. Rya will use the new version immediately.']);checks++;
 assert.deepEqual(errors,[]);
 const residual=failures.filter(f=>f.residual.length);console.log(JSON.stringify({status:'I18N_BROWSER_PASS',checks,errors,residual},null,2));assert.deepEqual(residual,[],'No unlocalized ordinary Latin UI in Hindi/Marathi');
}finally{await browser.close();}
