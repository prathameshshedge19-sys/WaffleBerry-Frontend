import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.L19_PLAYWRIGHT_MODULE));
const root=fileURLToPath(new URL('../',import.meta.url)),browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.name));
const sheet=await readFile(process.env.L19_QA_PORTRAIT);
const jpeg=Buffer.from(await page.evaluate(async bytes=>{const b=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));const c=document.createElement('canvas');c.width=c.height=512;c.getContext('2d').drawImage(b,0,0,b.width/2,b.width/2,0,0,512,512);b.close();return [...new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/jpeg'))).arrayBuffer())];},[...sheet]));
let assetReads=0,available=true;
const uuid='11111111-1111-4111-8111-111111111111';
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 // Intercept the app's private media origin too; never send synthetic auth or
 // test requests to the real service. Every allowed request is fulfilled below.
 if(u.hostname!=='picture-layout.test'&&!(u.hostname==='89-167-14-211.sslip.io'&&u.pathname.startsWith('/api/v1/')))return route.abort();
 if(u.pathname.startsWith('/api/v1/')){
  const p=u.pathname,user={id:1,email:'synthetic@example.test',full_name:'QA'};let body;
  if(p.endsWith('/auth/refresh'))body={access_token:'synthetic',token_type:'bearer',user};
  else if(p.endsWith('/auth/me'))body=user;
  else if(p.endsWith('/identity'))body={legacy_id:77,subject_name:'Asha'};
  else if(p.endsWith('/visitor-profile'))body={profile:null,greeting:'Hello. It is good to hear from you.'};
  else if(p.endsWith('/legacy-conversations'))body=[{id:11,title:'A quiet afternoon'}];
  else if(p.endsWith('/messages'))body=[{id:1,role:'assistant',content:'Hello. It is good to hear from you.'},{id:2,role:'user',content:'Tell me about the garden.'},{id:3,role:'assistant',content:'The garden was a peaceful place to sit together and talk.'}];
  else if(p.endsWith('/messages/stream'))return route.fulfill({contentType:'text/event-stream',body:'event: delta\ndata: {"delta":"What would you like to remember together?"}\n\nevent: done\ndata: {"message_id":4}\n\n'});
  else if(p.endsWith('/realtime/config'))body={enabled:false};
  else if(p.endsWith('/display-picture'))body={available,revision:uuid,content_path:'/legacies/77/visual-companion/display-picture/content?revision='+uuid};
  else if(p.endsWith('/display-picture/content')){assetReads++;return route.fulfill({contentType:'image/jpeg',body:jpeg});}
  else return route.fulfill({status:404,json:{detail:'Optional synthetic route'}});
  return route.fulfill({json:body});
 }
 try{return route.fulfill({body:await readFile(resolve(root,'.'+u.pathname)),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.svg':'image/svg+xml'})[extname(u.pathname)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
});
try{
 await page.goto('https://picture-layout.test/legacy-chat.html?legacy=77');await page.waitForFunction(()=>window.LegaryaLiveChat?.context().ready);
 await page.locator('.legacy-message-avatar img').first().waitFor();assert.equal(await page.locator('.message-assistant').count(),2);assert.equal(await page.locator('.legacy-message-avatar img').count(),2);assert.equal(await page.locator('#legacyChatFace').isVisible(),false);assert.equal(await page.locator('.message-user .legacy-message-avatar').count(),0);assert.equal(assetReads,1);checks.push('history-avatars-share-one-private-image-no-top-block');
 await page.locator('#messageInput').fill('And what else?');await page.locator('#composer').evaluate(e=>e.requestSubmit());await page.getByText('What would you like to remember together?',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.legacy-message-avatar img').length===3);assert.equal(assetReads,1);checks.push('new-streamed-reply-gets-avatar-without-new-fetch');
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:900});
  if(await page.locator('body').evaluate(e=>e.classList.contains('drawer-open')))await page.locator('#closeSidebar').click();
  await page.waitForTimeout(350);
  const geometry=await page.locator('.legacy-message-avatar').first().evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),inner=e.nextElementSibling.getBoundingClientRect();return {width:r.width,height:r.height,radius:s.borderRadius,right:r.right,textLeft:inner.left,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(geometry.width>=32&&geometry.width<=36);assert.equal(geometry.width,geometry.height);assert.equal(geometry.radius,'50%');assert.ok(geometry.right<geometry.textLeft);assert.equal(geometry.overflow,false);
  if(process.env.L19_SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.L19_SCREENSHOT_DIR,'dp2-chat-'+width+'.png')});
 }
 checks.push('round-aligned-message-dps-desktop-and-mobile');
 await page.evaluate(()=>{const d=document.querySelector('dialog.live-call');d.dataset.mode='legacy';d.querySelector('#liveCallTitle').textContent='Asha';d.querySelector('.live-call-presence').replaceChildren(document.querySelector('.legacy-message-avatar img').cloneNode());d.showModal();});
 for(const [width,height]of [[1280,1000],[390,844],[320,568]]){
  await page.setViewportSize({width,height});const g=await page.locator('.live-call-presence').evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,radius:getComputedStyle(e).borderRadius,fit:getComputedStyle(e.querySelector('img')).objectFit};});
  assert.ok(g.width>200);assert.ok(Math.abs(g.width-g.height)<1);assert.equal(g.radius,'50%');assert.equal(g.fit,'cover');
  await page.locator('[data-live-end]').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-live-end]').isVisible(),true);
  await page.locator('dialog.live-call').evaluate(e=>e.scrollTop=0);
  if(process.env.L19_SCREENSHOT_DIR)await page.locator('dialog.live-call').screenshot({path:resolve(process.env.L19_SCREENSHOT_DIR,'dp2-call-'+width+'.png')});
 }
 await page.evaluate(()=>document.querySelector('dialog.live-call').close());checks.push('large-circular-call-dp-controls-reachable');
 available=false;await page.evaluate(()=>dispatchEvent(new CustomEvent('legarya:visual-invalidated',{detail:{legacyId:77}})));await page.waitForFunction(()=>document.querySelectorAll('.legacy-message-avatar img').length===0);assert.equal(await page.locator('.legacy-message-avatar').count(),3);checks.push('revocation-clears-every-clone-keeps-initials');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'MESSAGE_PICTURE_BROWSER_PASS',checks,assetReads,pageErrors:0}));
}catch(error){console.log(JSON.stringify({diagnostic:await page.evaluate(()=>({ready:window.LegaryaLiveChat?.context().ready,hostImages:document.querySelectorAll('#legacyChatFaceImage img').length,avatars:document.querySelectorAll('.legacy-message-avatar').length,assistant:document.querySelectorAll('.message-assistant').length,status:document.querySelector('#legacyChatFaceStatus')?.textContent})),errors,assetReads}));throw error;}finally{await browser.close();}
