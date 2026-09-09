import {createPictureClient,createDisplayPicture} from './display-picture.mjs?v=dp1';

// One private image subscription feeds all reply avatars, including history and
// streamed replies. The source host is hidden; no standalone portrait in chat.
export function installChatPortrait({environment=window, document=environment.document,
  client=createPictureClient(environment.LegaryaAuthApi), createPresence=createDisplayPicture,
  rendererFactory=undefined}={}) {
  const stage=document.querySelector('#legacyChatFace'),host=document.querySelector('#legacyChatFaceImage'),status=document.querySelector('#legacyChatFaceStatus');
  if(!stage||!host||!status)return ()=>{};
  let portrait=null,epoch=0,scope=null,disposed=false,sessionEnded=false;
  let showImage=false;
  const context=()=>environment.LegaryaLiveChat?.context();
  const account=()=>environment.LegaryaAuthApi.getSessionEpoch?.();
  function syncAvatars(){
    const source=showImage?host.querySelector?.('img'):null;
    for(const row of document.querySelectorAll?.('#messages .message-assistant')||[]){
      let avatar=row.querySelector('.legacy-message-avatar');
      if(!avatar){avatar=document.createElement('span');avatar.className='legacy-message-avatar';avatar.setAttribute('aria-hidden','true');row.prepend(avatar);}
      if(source){
        if(avatar.querySelector('img')?.src!==source.src){const img=source.cloneNode();img.alt='';avatar.replaceChildren(img);}
      }else if(avatar.querySelector('img')||!avatar.textContent){avatar.textContent=(context()?.name||'L').trim().slice(0,1).toUpperCase();}
    }
  }
  function retire(){++epoch;showImage=false;syncAvatars();portrait?.dispose();portrait=null;scope=null;host.replaceChildren();stage.hidden=true;}
  function sync(){
    const current=context();
    if(disposed||sessionEnded||document.hidden||!current?.ready||current.live||current.mode!=='legacy'){retire();return;}
    const key=`${current.legacyId}:${account()}`;if(scope===key)return;
    retire();scope=key;const token=epoch;stage.hidden=true;
    const guard=()=>!disposed&&token===epoch&&!document.hidden&&!context()?.live&&context()?.ready&&`${context()?.legacyId}:${account()}`===key;
    portrait=createPresence({host,client,legacyId:current.legacyId,name:current.name||'L',guard,rendererFactory,onState:state=>{
      if(!guard())return;
      showImage=state==='IDLE';syncAvatars();
      status.textContent=state==='ERROR'?'The display picture could not load. Your chat is still available.':state==='LOADING'?'Loading photo…':'Legacy photo';
    }});
    void portrait.start();
  }
  const invalidate=()=>{retire();sync();};
  const endSession=()=>{if(context()?.ready||portrait)sessionEnded=true;retire();};
  const Observer=environment.MutationObserver;
  const imageObserver=Observer?new Observer(syncAvatars):null;
  imageObserver?.observe(host,{childList:true});
  const messageObserver=Observer?new Observer(records=>{
    if(records.some(r=>[...r.addedNodes].some(n=>n.matches?.('.message-assistant')||n.querySelector?.('.message-assistant'))))syncAvatars();
  }):null;
  const messages=document.querySelector('#messages');
  if(messages)messageObserver?.observe(messages,{childList:true,subtree:true});
  environment.addEventListener('legarya:chat-context',sync);
  environment.addEventListener('legarya:visual-invalidated',invalidate);
  environment.addEventListener('legarya:session-ending',endSession);
  environment.addEventListener('pagehide',retire);
  document.addEventListener('visibilitychange',sync);
  sync();
  return ()=>{disposed=true;imageObserver?.disconnect();messageObserver?.disconnect();retire();environment.removeEventListener('legarya:chat-context',sync);environment.removeEventListener('legarya:visual-invalidated',invalidate);environment.removeEventListener('legarya:session-ending',endSession);environment.removeEventListener('pagehide',retire);document.removeEventListener('visibilitychange',sync);};
}
if(typeof window!=='undefined'&&window.LegaryaAuthApi)installChatPortrait();
