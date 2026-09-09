import {readFile,readdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.L19_PLAYWRIGHT_MODULE));
const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({headless:true});
// Native navigation must work even before scripts or authentication finish.
const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());if(url.hostname!=='back-layout.test')return route.abort();
 try{return route.fulfill({body:await readFile(resolve(root,'.'+url.pathname)),contentType:({'.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(url.pathname)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
});
const pages=(await readdir(root)).filter(f=>f.endsWith('.html'));let checks=0;
try{
 for(const width of [1280,390,320])for(const name of pages){
  await page.setViewportSize({width,height:900});await page.goto('https://back-layout.test/'+name);
  const link=page.locator('a.premium-back');assert.equal(await link.count(),1);assert.equal(await link.isVisible(),true);
  const box=await link.boundingBox();assert.ok(box.width>=74&&box.height>=44,name);assert.ok(box.x>=0&&box.x+box.width<=width,name);
  const overlap=await link.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !e.contains(hit);});assert.equal(overlap,false,name);
  await link.focus();assert.equal(await link.evaluate(e=>e===document.activeElement),true);
  if(['chat.html','legacy-chat.html','gateway.html','index.html'].includes(name)){
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' horizontal overflow');
   if(process.env.L19_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.L19_SCREENSHOT_DIR,'back-'+name.replace('.html','')+'-'+width+'.png')});
  }
  const target=await link.getAttribute('href');await link.press('Enter');await page.waitForURL('https://back-layout.test/'+target);checks++;
 }
 console.log(JSON.stringify({status:'BACK_NAVIGATION_BROWSER_PASS',pages:pages.length,widths:[1280,390,320],navigationChecks:checks,scriptsDisabled:true}));
}finally{await browser.close();}
