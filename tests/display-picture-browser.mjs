import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.L19_PLAYWRIGHT_MODULE));
const root=fileURLToPath(new URL('../',import.meta.url)),browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.name));
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.hostname!=='picture-qa.test')return route.abort();
 if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/visual-presence.css"><button id="openVisualPresence">Legacy photo</button><script src="/js/media-client.js"></script><script type="module" src="/js/display-picture-settings.mjs"></script>'});
 try{return route.fulfill({contentType:extname(u.pathname)==='.css'?'text/css':'text/javascript',body:await readFile(resolve(root,'.'+u.pathname))});}catch{return route.abort();}
});
await page.addInitScript(()=>{
 const state=window.__pictureQA={legacy:{id:1,access_role:'owner',subject_name:'Synthetic'},calls:[],sources:{},serial:0,current:null,fail:false,hold:false,revoked:false};
 window.LegaryaWorkspace={getActiveLegacy:()=>state.legacy};
 const picture=async()=>{const c=document.createElement('canvas');c.width=900;c.height=400;const g=c.getContext('2d');g.fillStyle='green';g.fillRect(0,0,900,400);g.fillStyle='red';g.fillRect(0,0,60,400);g.fillStyle='blue';g.fillRect(840,0,60,400);return new Promise(r=>c.toBlob(r,'image/jpeg'));};
 window.LegaryaAuthApi={getSessionEpoch:()=>0,
  async apiRequest(path,options={}){
   state.calls.push({path,method:options.method});if(state.revoked)throw Object.assign(Error('Revoked'),{status:404});
   if(path.endsWith('/sources')){const id=String(++state.serial);return state.sources[id]={id,legacy_id:state.legacy.id,kind:'image',state:'ready',safety_state:'clean'};}
   if(path.endsWith('/display-picture')){if(options.method==='PUT')state.current=options.body.source_id;return {available:!!state.current,revision:state.current,content_path:'/picture/'+state.current};}
   throw Error('Unexpected request');
  },
  async authenticatedMediaFetch(path){if(state.hold)await new Promise(r=>state.release=r);if(state.fail){state.fail=false;throw Object.assign(Error('Upload failed'),{status:503});}return new Response(JSON.stringify(state.sources[path.split('/').at(-2)]));},
  async authenticatedVisualFetch(){return new Response(await picture(),{headers:{'Content-Type':'image/jpeg'}});}
 };
});
try{
 await page.goto('https://picture-qa.test/');await page.locator('#openVisualPresence').click();
 const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=900;c.height=400;return [...new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())];});
 const upload=()=>page.locator('[data-upload]').setInputFiles({name:'Synthetic landscape.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
 const saved=()=>page.getByText('Photo saved. Visitors will see it in chats and calls.',{exact:true}).waitFor();
 await upload();await saved();await page.locator('.legacy-display-picture').waitFor();
 assert.equal(await page.locator('[data-approve],[data-regenerate],[data-framing],canvas').count(),0);
 assert.deepEqual(await page.locator('.legacy-display-picture').evaluate(e=>[e.naturalWidth,e.naturalHeight]),[900,400]);checks.push('one-upload-saves-entire-background-image-with-no-face-and-no-extra-controls');
 await page.locator('[data-close]').click();await page.locator('#openVisualPresence').click();await page.locator('.legacy-display-picture').waitFor();checks.push('saved-picture-reopens');
 const first=await page.evaluate(()=>window.__pictureQA.current);
 await page.evaluate(()=>window.__pictureQA.fail=true);await upload();await page.getByText(/Could not save the photo/).waitFor();
 assert.equal(await page.evaluate(()=>window.__pictureQA.current),first);assert.equal(await page.locator('[data-upload]').isEnabled(),true);checks.push('failed-replacement-keeps-current-and-releases-input');
 await upload();await saved();assert.notEqual(await page.evaluate(()=>window.__pictureQA.current),first);checks.push('retry-replaces-picture');
 for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('dialog').evaluate(e=>e.scrollWidth<=innerWidth));}checks.push('mobile-fit');
 await page.evaluate(()=>window.__pictureQA.hold=true);const previous=await page.evaluate(()=>window.__pictureQA.current);await upload();await page.waitForFunction(()=>!!window.__pictureQA.release);
 await page.locator('[data-close]').click();await page.evaluate(()=>window.__pictureQA.release());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__pictureQA.current),previous);checks.push('close-during-upload-does-not-select-late-picture');
 await page.locator('#openVisualPresence').click();await page.locator('.legacy-display-picture').waitFor();await page.evaluate(()=>window.__pictureQA.revoked=true);
 await page.locator('.legacy-display-picture').waitFor({state:'detached',timeout:35000});checks.push('revocation-clears-private-picture');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'DISPLAY_PICTURE_BROWSER_PASS',checks,pageErrors:0}));
}finally{await browser.close();}
