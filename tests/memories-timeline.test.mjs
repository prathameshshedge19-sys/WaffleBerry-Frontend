import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
class Node {
  constructor(tag='div') { this.tagName=tag; this.children=[]; this.listeners={}; this.style={}; this.dataset={}; this.hidden=false; this.textContent=''; this.className=''; this.classList={add(){},remove(){},toggle(){}}; }
  append(...nodes) { for(const node of nodes) { node.remove(); node.parent=this; this.children.push(node); } }
  remove() { if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this); this.parent=null; }
  replaceChildren(...nodes) { for(const node of [...this.children])node.remove(); this.append(...nodes); }
  addEventListener(name,fn) { (this.listeners[name]??=[]).push(fn); }
  async emit(name,event={}) { for(const fn of this.listeners[name]||[])await fn(event); }
  setAttribute() {} focus() {} scrollIntoView() {}
  all() { return [this,...this.children.flatMap(n=>n.all())]; }
  text() { return [this.textContent,...this.children.map(n=>n.text())].join(' '); }
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
const event=(legacyId=1)=>({id:'event-'+legacyId,legacy_id:legacyId,title:'A preserved moment '+legacyId,date_precision:'unknown',memory_count:1});
function setup({list=async id=>[event(id)],memories,role='owner'}={}) {
  const ids=Object.fromEntries(['openMemories','memoryDashboard','closeMemories','memoryDashboardBackdrop','memoryDashboardContent','memoryDashboardStatus','timelineDashboard','timelineContent','timelineStatus'].map(id=>[id,new Node()]));
  ids.memoryDashboard.hidden=true; ids.timelineDashboard.hidden=true;
  ids.timelineDashboard.append(ids.timelineStatus,ids.timelineContent);ids.memoryDashboardContent.append(ids.timelineDashboard);
  const root=new Node(),document=new Node(),requests=[];let legacyId=1;
  document.body=new Node();document.createElement=tag=>new Node(tag);document.querySelector=selector=>ids[selector.slice(1)]||null;
  const apiRequest=async path=>{requests.push(path);if(path==='/legacies')return {active_legacy_id:legacyId,legacies:[{id:legacyId,access_role:role}]};if(path.startsWith('/memories'))return memories??[{id:legacyId,category:'career',canonical_text:'Preserved memory '+legacyId,created_at:'2026-01-01'}];if(path.startsWith('/progress'))return {progress:{percentage:10,domains:[]},streak:{current_streak_days:1,longest_streak_days:1,today_completed:true}};throw Error('Unexpected API');};
  root.LegaryaAuthApi={apiRequest};root.LegaRyaPersonalityDashboard={create:()=>({begin(){},close(){},load(){},mount(parent){const node=new Node();node.className='personality-presence';node.textContent='Personality & Presence';parent.append(node);}})};
  root.LegaryaTimeline={list,gaps:async()=>({}),detail:async(id)=>event(id)};
  const sandbox={window:root,document,AbortController,Intl,Date,console};
  vm.runInNewContext(read('memory-dashboard'),sandbox);vm.runInNewContext(read('timeline-dashboard'),sandbox);
  return {ids,root,requests,async open(){await ids.openMemories.emit('click');await tick();},async switchTo(id){legacyId=id;await root.emit('legarya-legacy-change');}};
}
test('Memories order is progress, inline Timeline, stored memories, then personality',async()=>{
  const {ids,open}=setup();await open();
  const nodes=ids.memoryDashboardContent.children;
  assert.equal(nodes[0].className,'progress-overview');assert.equal(nodes[1],ids.timelineDashboard);
  assert.equal(nodes[2].textContent,'Stored memories');assert.equal(nodes[3].className,'memory-group');assert.equal(nodes[4].className,'personality-presence');
  assert.equal(ids.timelineDashboard.hidden,false);assert.match(ids.timelineContent.text(),/A preserved moment 1/);
});
test('empty timelines and memories remain optional and keep personality visible',async()=>{
  const {ids,open}=setup({memories:[],list:async()=>[]});await open();
  assert.match(ids.timelineContent.text(),/no source file/);assert.match(ids.memoryDashboardContent.text(),/No memories yet/);assert.match(ids.memoryDashboardContent.text(),/Personality & Presence/);
});
test('timeline failures do not block memory cards or personality',async()=>{
  const {ids,open}=setup({list:async()=>{throw Error('offline');}});await open();
  assert.match(ids.timelineContent.text(),/could not be loaded/);assert.match(ids.memoryDashboardContent.text(),/Preserved memory 1/);assert.match(ids.memoryDashboardContent.text(),/Personality & Presence/);
});
test('closing Memories aborts Timeline and ignores late responses',async()=>{
  const pending=deferred();let signal;
  const {ids,open}=setup({list:(_id,_params,s)=>{signal=s;return pending.promise;}});await open();await ids.closeMemories.emit('click');
  assert.equal(signal.aborted,true);pending.resolve([event(1)]);await tick();assert.equal(ids.timelineDashboard.hidden,true);assert.equal(ids.timelineContent.children.length,0);
});
test('Legacy switching hides the old dashboard and rejects late old Timeline data',async()=>{
  const pending=deferred();const {ids,open,switchTo}=setup({list:id=>id===1?pending.promise:Promise.resolve([event(id)])});await open();await switchTo(2);
  assert.equal(ids.memoryDashboard.hidden,true);await open();pending.resolve([event(1)]);await tick();
  assert.match(ids.timelineContent.text(),/moment 2/);assert.doesNotMatch(ids.timelineContent.text(),/moment 1/);
});
test('event details and Back remain inside Memories without opening another dialog',async()=>{
  const {ids,open}=setup();await open();const card=ids.timelineContent.all().find(n=>n.className==='timeline-event');await card.emit('click');await tick();
  assert.match(ids.timelineContent.text(),/Remove from Timeline/);assert.equal(ids.memoryDashboard.hidden,false);
  await ids.timelineContent.children[0].emit('click');await tick();assert.match(ids.timelineContent.text(),/moment 1/);
});
test('collaborator Timeline detail never exposes owner removal controls',async()=>{
  const {ids,open}=setup({role:'collaborator'});await open();await ids.timelineContent.all().find(n=>n.className==='timeline-event').emit('click');await tick();assert.doesNotMatch(ids.timelineContent.text(),/Remove from Timeline|Mark reviewed/);
});
test('unauthorized role cannot mount or fetch Timeline',async()=>{
  let calls=0;const {ids,open}=setup({role:'visitor',list:async()=>{calls++;return [];}});await open();assert.equal(calls,0);assert.equal(ids.timelineDashboard.hidden,true);
});
