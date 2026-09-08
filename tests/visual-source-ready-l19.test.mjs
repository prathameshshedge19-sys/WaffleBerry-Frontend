import test from "node:test";
import assert from "node:assert/strict";
import { waitForVisualSource } from "../js/visual-source-ready.mjs";
const pending = () => ({ id: "synthetic-source", legacy_id: 12, kind: "image", state: "queued", safety_state: "pending" });
const clean = () => ({ ...pending(), state: "ready", safety_state: "clean" });
test("visual upload waits for asynchronous L16 validation before original read", async () => {
  let reads=0,pauses=0;
  const result=await waitForVisualSource({source:async()=>++reads===1?pending():clean()},12,pending(),{delay:async()=>{pauses++;}});
  assert.equal(result.safety_state,"clean");assert.equal(reads,2);assert.equal(pauses,2);
});
test("already clean visual source opens without polling",async()=>assert.equal((await waitForVisualSource({source:()=>assert.fail()},12,clean())).state,"ready"));
test("failed or deleted source never becomes a crop",async()=>{for(const state of ["failed","deleting","deleted"])await assert.rejects(waitForVisualSource({},12,{...pending(),state}));});
test("late source after Legacy switch is discarded",async()=>{let active=true;await assert.rejects(waitForVisualSource({source:async()=>{active=false;return clean();}},12,pending(),{current:()=>active,delay:async()=>{}}),{name:"AbortError"});});
test("foreign Legacy or substituted source is rejected",async()=>{for(const row of [{...clean(),legacy_id:9},{...clean(),id:"other"}])await assert.rejects(waitForVisualSource({source:async()=>row},12,pending(),{delay:async()=>{}}));});
test("pending source polling has a hard attempt bound",async()=>{let reads=0;await assert.rejects(waitForVisualSource({source:async()=>{reads++;return pending();}},12,pending(),{attempts:3,delay:async()=>{}}));assert.equal(reads,3);});
test("logout abort cancels validation timer without another source request",async()=>{const abort=new AbortController();const result=waitForVisualSource({source:()=>assert.fail()},12,pending(),{signal:abort.signal});abort.abort();await assert.rejects(result,{name:"AbortError"});});
