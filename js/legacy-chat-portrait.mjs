import { createVisualClient } from './visual-presence-client.mjs?v=face4';
import { createVisualPresence } from './visual-presence-controller.mjs?v=l19c1';
import { createPortraitRenderer } from './legacy-portrait-renderer.mjs?v=l19c1';

// The same approved, leased face is visible in chat and in the live-call view.
// Chat yields its renderer while the call owns the visible portrait.
export function installChatPortrait({environment=window, document=environment.document,
  client=createVisualClient(environment.LegaryaAuthApi), createPresence=createVisualPresence,
  rendererFactory=createPortraitRenderer}={}) {
  const stage=document.querySelector('#legacyChatFace'),host=document.querySelector('#legacyChatFaceImage'),status=document.querySelector('#legacyChatFaceStatus');
  if(!stage||!host||!status)return ()=>{};
  let portrait=null,epoch=0,scope=null,disposed=false,sessionEnded=false;
  const context=()=>environment.LegaryaLiveChat?.context();
  const account=()=>environment.LegaryaAuthApi.getSessionEpoch?.();
  function retire(){++epoch;portrait?.dispose();portrait=null;scope=null;host.replaceChildren();stage.hidden=true;}
  function sync(){
    const current=context();
    if(disposed||sessionEnded||document.hidden||!current?.ready||current.live||current.mode!=='legacy'){retire();return;}
    const key=`${current.legacyId}:${account()}`;if(scope===key)return;
    retire();scope=key;const token=epoch;stage.hidden=false;
    const guard=()=>!disposed&&token===epoch&&!document.hidden&&!context()?.live&&context()?.ready&&`${context()?.legacyId}:${account()}`===key;
    portrait=createPresence({host,client,legacyId:current.legacyId,name:current.name||'L',guard,rendererFactory,onState:state=>{
      if(!guard())return;
      stage.hidden=state==='DISABLED';
      status.textContent=state==='ERROR'?'The approved face could not load. Your chat is still available.':state==='LOADING'?'Loading approved face…':'AI-animated portrait · Not a recording';
    }});
    void portrait.start();
  }
  const invalidate=()=>{retire();sync();};
  const endSession=()=>{if(context()?.ready||portrait)sessionEnded=true;retire();};
  environment.addEventListener('legarya:chat-context',sync);
  environment.addEventListener('legarya:visual-invalidated',invalidate);
  environment.addEventListener('legarya:session-ending',endSession);
  environment.addEventListener('pagehide',retire);
  document.addEventListener('visibilitychange',sync);
  sync();
  return ()=>{disposed=true;retire();environment.removeEventListener('legarya:chat-context',sync);environment.removeEventListener('legarya:visual-invalidated',invalidate);environment.removeEventListener('legarya:session-ending',endSession);environment.removeEventListener('pagehide',retire);document.removeEventListener('visibilitychange',sync);};
}
if(typeof window!=='undefined'&&window.LegaryaAuthApi)installChatPortrait();
