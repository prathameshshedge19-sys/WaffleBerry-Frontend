import test from 'node:test';
import assert from 'node:assert/strict';
import {motionRig,idlePose} from '../js/portrait-motion.mjs';
import {validateRig} from '../js/visual-presence-client.mjs';
function fixture(){
 const vertices=Array.from({length:100},(_,i)=>[(i%10)/9,Math.floor(i/10)/9]),triangles=[];
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){const a=y*10+x;triangles.push([a,a+1,a+11],[a,a+11,a+10]);}
 const deformations={mouth:vertices.map((_,i)=>[65,75].includes(i)?.0005:0),blink_left:vertices.map((_,i)=>i===33?.0003:0),blink_right:vertices.map((_,i)=>i===36?.0003:0)};
 return {recipe_version:'portrait_2d_v1',topology_version:1,fake_only:false,request_identity_sha256:'a'.repeat(64),atlas_sha256:'b'.repeat(64),poster_sha256:'c'.repeat(64),atlas_size:[512,512],crop_rect:[0,0,512,512],vertices,uvs:vertices,triangles,deformations,patches:{mouth:[.4,.6,.3,.2],blink_left:[.2,.2,.2,.2],blink_right:[.6,.2,.2,.2]}};
}
test('weak approved rig has visible bounded local movement without mutating assets',()=>{
 const rig=fixture(),before=JSON.stringify(rig);validateRig(rig);const improved=motionRig(rig);validateRig(improved);
 assert.equal(JSON.stringify(rig),before);assert.ok(improved.deformations.mouth[75]>=.01);
 assert.ok(improved.deformations.mouth[65]<0,'upper and lower lip regions separate instead of translating together');
 assert.ok(improved.deformations.blink_left[33]>=.003);assert.equal(improved.atlas_sha256,rig.atlas_sha256);
});
test('idle movement is visible but bounded; interrupted presentation is neutral',()=>{
 const poses=Array.from({length:300},(_,i)=>idlePose(i/30,'IDLE'));
 assert.ok(Math.max(...poses.map(p=>p.scale))-Math.min(...poses.map(p=>p.scale))>.007);
 assert.ok(poses.every(p=>p.scale<=1.021&&Math.abs(p.tilt)<=.01));
 assert.deepEqual(idlePose(3,'INTERRUPTED'),{scale:1,tilt:0});
});
