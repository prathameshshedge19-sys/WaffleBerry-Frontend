// Actual page/pointer regression. All network responses and codes are synthetic.
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.L19_PLAYWRIGHT_MODULE));
const root=fileURLToPath(new URL('../',import.meta.url));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(30000);
const errors=[],checks=[];let holdJoin=false,held=[],joinCalls=0,previewFailure=0,holdIdentity=false,identityHeld=[];
page.on('pageerror',e=>errors.push(e.name));
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());if(url.hostname!=='entry-qa.test')return route.abort();
 if(url.pathname.startsWith('/api/v1/')){
  const p=url.pathname,user={id:1,email:'synthetic@example.test',full_name:'Synthetic QA'};let body;
  if(p.endsWith('/auth/refresh'))body={access_token:'synthetic-only',token_type:'bearer',user};
  else if(p.endsWith('/auth/me'))body=user;
  else if(p.endsWith('/legacy-access/preview')){if(previewFailure){previewFailure--;return route.fulfill({status:503,json:{detail:'Temporary test failure'}});}body={legacy_id:77,subject_name:'QA'};}
  else if(p.endsWith('/legacy-access/join')){joinCalls++;if(holdJoin)await new Promise(r=>held.push(r));body={legacy_id:77};}
  else if(p.endsWith('/identity')){if(holdIdentity)await new Promise(r=>identityHeld.push(r));body={legacy_id:77,subject_name:'QA'};}
  else if(p.endsWith('/visitor-profile'))body={profile:null,greeting:'Hello QA visitor'};
  else if(p.endsWith('/legacy-conversations'))body=[];
  else if(p.endsWith('/realtime/config'))body={enabled:false};
  else return route.fulfill({status:404,json:{detail:'Optional test route unavailable'}}).catch(()=>{});
  return route.fulfill({json:body}).catch(()=>{});
 }
 const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root))return route.abort();
 try{return route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
});
const preview=async()=>{await page.locator('#openLegacyJoin').click();await page.locator('#legacyCode').fill('LEG-AAAA-BBBB');await page.locator('#previewLegacyCode').click();await page.locator('#beginLegacyConversation:visible:not([disabled])').waitFor();};
const ready=()=>page.waitForFunction(()=>window.LegaryaLiveChat?.context().ready===true);
try{
 for(let i=0;i<10;i++){
  await page.goto('https://entry-qa.test/gateway.html');await preview();await page.locator('#beginLegacyConversation').click();await ready();
  assert.equal(await page.locator('#messageInput').isDisabled(),false);
  await page.goBack();await page.waitForURL('**/gateway.html');
  // Exercise restored BFCache state explicitly as route interception can cause
  // the engine to choose reload instead of BFCache for this synthetic origin.
  await page.evaluate(()=>{document.querySelector('#beginLegacyConversation').disabled=true;dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  if(await page.locator('#legacyJoinDialog').evaluate(e=>e.open))await page.locator('#closeLegacyJoin').click();
  await preview();assert.equal(await page.locator('#beginLegacyConversation').isEnabled(),true);await page.locator('#closeLegacyJoin').click();
 }
 checks.push('10-real-click-entry-back-reopen-cycles');
 holdJoin=true;await preview();await page.locator('#beginLegacyConversation').click();await page.waitForFunction(()=>document.querySelector('#legacyJoinForm').getAttribute('aria-busy')==='true');
 await page.locator('#closeLegacyJoin').click();holdJoin=false;await preview();held.splice(0).forEach(r=>r());await page.waitForTimeout(100);
 assert.equal(new URL(page.url()).pathname,'/gateway.html');await page.locator('#beginLegacyConversation').click();await ready();checks.push('cancelled-join-late-response-cannot-redirect-new-dialog');
 await page.goto('https://entry-qa.test/gateway.html');holdJoin=true;await preview();await page.locator('#beginLegacyConversation').click();
 await page.locator('#legacyJoinStatus').filter({hasText:/timed out/}).waitFor();assert.equal(await page.locator('#beginLegacyConversation').isEnabled(),true);
 holdJoin=false;held.splice(0).forEach(r=>r());await page.locator('#beginLegacyConversation').click();await ready();checks.push('actual-15-second-timeout-unlocks-and-retry-opens-chat');
 holdIdentity=true;await page.goto('https://entry-qa.test/legacy-chat.html?legacy=77');await page.locator('.legacy-chat-retry').waitFor();
 assert.equal(await page.locator('#messageInput').isDisabled(),true);holdIdentity=false;await page.locator('.legacy-chat-retry').click();await ready();identityHeld.splice(0).forEach(r=>r());checks.push('actual-20-second-chat-bootstrap-timeout-and-retry');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'BROWSER_RECOVERY_PASS',checks,joinCalls,pageErrors:0}));
}finally{held.forEach(r=>r());identityHeld.forEach(r=>r());await browser.close();}
