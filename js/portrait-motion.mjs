import {validateRig} from './visual-presence-client.mjs?v=face4';

// Presentation-only normalization of the authenticated source rig. Old approved
// portraits benefit too. Never alter stored assets, invent pixels or relax the
// same patch/triangle bounds used for admission.
export function motionRig(rig){
  let result=rig;
  // The original mouth channel translated the lip patch downward as one piece.
  // Separate upper/lower movement around the measured lip center instead. This
  // stretches only source pixels; it does not synthesize teeth or expressions.
  const original=rig.deformations.mouth,patch=rig.patches.mouth;
  if(original.some(v=>v>0)&&!original.some(v=>v<0)){
    const candidate={...rig,deformations:{...rig.deformations,mouth:original.map((v,i)=>v*(rig.vertices[i][1]-patch[1]-patch[3]/2)/(patch[3]/2))}};
    try{validateRig(candidate);result=candidate;}catch{/* Keep the admitted geometry if this source cannot support separation. */}
  }
  for(const channel of ['mouth','blink_left','blink_right']){
    const values=result.deformations[channel],peak=Math.max(...values.map(Math.abs));
    const target=channel==='mouth'?.012:.004;
    if(!peak||peak>=target)continue;
    let gain=Math.min(32,target/peak);
    for(let attempt=0;attempt<8;attempt++){
      const candidate={...result,deformations:{...result.deformations,[channel]:values.map(v=>v*gain)}};
      try{validateRig(candidate);result=candidate;break;}catch{gain=1+(gain-1)/2;}
    }
  }
  return result;
}

export function idlePose(elapsed,state){
  if(['LOADING','ERROR','DISABLED','INTERRUPTED'].includes(state))return {scale:1,tilt:0};
  return {scale:1.016+.004*Math.sin(elapsed*1.15),tilt:.009*Math.sin(elapsed*.65)};
}
