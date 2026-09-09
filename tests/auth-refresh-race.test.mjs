import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/auth-api.js',import.meta.url),'utf8');
test('parallel authenticated entry reads share one rotating refresh',async()=>{
 let refreshes=0,resolve;const calls=[];
 const window={LEGARYA_AUTH_CONFIG:{apiBaseUrl:'/api/v1'},dispatchEvent(){}};
 vm.runInNewContext(source,{window,Event,Headers,localStorage:{setItem(){},removeItem(){}},fetch:async(url,options)=>{
  calls.push(url);if(url.endsWith('/auth/refresh')){refreshes++;return new Promise(r=>resolve=r);}
  return new Response('{}',{status:200});
 }});
 const auth=window.LegaryaAuthApi,pending=Promise.all([auth.apiRequest('/auth/me',{authenticated:true}),auth.apiRequest('/legacy-access/preview',{authenticated:true})]);
 assert.equal(refreshes,1);resolve(new Response(JSON.stringify({access_token:'synthetic-only',token_type:'bearer',user:{id:1}})));await pending;
 assert.equal(calls.length,3);assert.equal(refreshes,1);
});
test('late refresh cannot restore a cleared session',async()=>{
 let resolve;const window={LEGARYA_AUTH_CONFIG:{apiBaseUrl:'/api/v1'},dispatchEvent(){}};
 vm.runInNewContext(source,{window,Event,Headers,localStorage:{setItem(){},removeItem(){}},fetch:()=>new Promise(r=>resolve=r)});
 const auth=window.LegaryaAuthApi,pending=auth.refreshSession();auth.clearStoredSession();
 resolve(new Response(JSON.stringify({access_token:'synthetic-only',token_type:'bearer',user:{id:1}})));assert.equal(await pending,false);
});
test('hung shared refresh expires and the next attempt starts a fresh request',async()=>{
 let timeout,resolve,calls=0;const window={LEGARYA_AUTH_CONFIG:{apiBaseUrl:'/api/v1'},dispatchEvent(){},setTimeout:fn=>{timeout=fn;return 1;},clearTimeout(){}};
 vm.runInNewContext(source,{window,Event,Headers,AbortController,localStorage:{setItem(){},removeItem(){}},fetch:()=>{calls++;return new Promise(r=>resolve=r);}});
 const auth=window.LegaryaAuthApi,pending=auth.refreshSession();timeout();await assert.rejects(pending,error=>error.kind==='network'&&error.status===0);
 const late=resolve,retry=auth.refreshSession();assert.equal(calls,2);
 late(new Response(JSON.stringify({access_token:'stale-synthetic',token_type:'bearer',user:{id:99}})));
 resolve(new Response(JSON.stringify({access_token:'current-synthetic',token_type:'bearer',user:{id:1}})));assert.equal(await retry,true);
});
