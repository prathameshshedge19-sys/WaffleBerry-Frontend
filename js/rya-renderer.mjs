import * as THREE from "./three.module.min.js";

// The homepage and Live Voice use this same scene, geometry, shaders and idle loop.
export function createRyaRenderer(mount, { live = false, onArc = null } = {}) {
const listeners = new AbortController();
let disposed = false;
const diagnostics = live ? {errors:[],frames:0} : (window.__ryaDiagnostics ||= {errors:[],frames:0});

const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
const isMobile=matchMedia("(max-width: 640px)").matches;
const compactViewport=matchMedia("(max-width: 840px)");
const chatMode=mount.dataset.ryaMode==="chat";
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x0d0c0b,.085);
const camera=new THREE.PerspectiveCamera(44,1,.1,40);
camera.position.set(0,.08,6.72);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});
renderer.setClearColor(0x0d0c0b,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=compactViewport.matches&&!chatMode?1.65:1.12;
mount.appendChild(renderer.domElement);
const world=new THREE.Group();world.position.y=chatMode?0:.52;scene.add(world);
let shaderFailure=false,fallbackApplied=false;
renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderFailure=true;console.error("Rya shader failed",gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));};

function glowTexture(){const canvas=document.createElement("canvas");canvas.width=canvas.height=128;const context=canvas.getContext("2d"),gradient=context.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,"rgba(255,250,235,1)");gradient.addColorStop(.1,"rgba(255,226,177,.8)");gradient.addColorStop(.34,"rgba(221,164,120,.22)");gradient.addColorStop(1,"rgba(110,68,52,0)");context.fillStyle=gradient;context.fillRect(0,0,128,128);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;}
const glowMap=glowTexture();
const innerGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0xf5c88e,transparent:true,opacity:.37,blending:THREE.AdditiveBlending,depthWrite:false}));innerGlow.scale.set(4.2,4.8,1);innerGlow.position.z=-.18;world.add(innerGlow);
const nucleusGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0xffe0ad,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false}));nucleusGlow.scale.set(3.45,3.85,1);nucleusGlow.position.z=-.08;world.add(nucleusGlow);
const bloomGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0xffd49a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));bloomGlow.scale.setScalar(2);world.add(bloomGlow);

const coreLayerCounts=chatMode?(isMobile?[900,5200,120]:[1600,9000,180]):(isMobile?[2800,19000,320]:[3500,24000,360]);
const CORE_COUNT=coreLayerCounts.reduce((sum,count)=>sum+count,0),coreGeometry=new THREE.BufferGeometry(),corePositions=new Float32Array(CORE_COUNT*3),coreColors=new Float32Array(CORE_COUNT*3),coreSeeds=new Float32Array(CORE_COUNT),coreSizes=new Float32Array(CORE_COUNT),coreLayerIds=new Float32Array(CORE_COUNT);
const layerSettings=[
  {max:2.25,power:.18,size:[6.8,12.5],palette:[0xfffff2,0xffecc7,0xfff7dd]},
  {max:2,power:.82,size:[4.1,8.5],palette:[0xfff8e8,0xf8dfb5,0xffedca,0xe8bd83,0xc98e88]},
  {max:2.32,power:1.2,size:[2.2,4.4],palette:[0xe5cfad,0xd8b78f,0xb9827f]},
],tempColor=new THREE.Color();
let particleIndex=0;
layerSettings.forEach((settings,layer)=>{for(let localIndex=0;localIndex<coreLayerCounts[layer];localIndex+=1){
  const i=particleIndex++,radius=.035+Math.pow(Math.random(),settings.power)*settings.max,theta=Math.random()*Math.PI*2,z=Math.random()*2-1,ring=Math.sqrt(1-z*z);
  const x=radius*ring*Math.cos(theta),y=radius*z,zPos=radius*ring*Math.sin(theta);
  corePositions.set([x,y,zPos],i*3);coreSeeds[i]=Math.random()*100;coreLayerIds[i]=layer;coreSizes[i]=settings.size[0]+Math.random()*(settings.size[1]-settings.size[0])*(1-radius/(settings.max+.2));
  tempColor.setHex(settings.palette[Math.floor(Math.random()*settings.palette.length)]);coreColors.set([tempColor.r,tempColor.g,tempColor.b],i*3);
}});
coreGeometry.setAttribute("position",new THREE.BufferAttribute(corePositions,3));coreGeometry.setAttribute("color",new THREE.BufferAttribute(coreColors,3));coreGeometry.setAttribute("aSeed",new THREE.BufferAttribute(coreSeeds,1));coreGeometry.setAttribute("aSize",new THREE.BufferAttribute(coreSizes,1));
coreGeometry.setAttribute("aLayer",new THREE.BufferAttribute(coreLayerIds,1));
const coreUniforms={uTime:{value:0},uPixelRatio:{value:1},uGlowBoost:{value:compactViewport.matches&&!chatMode?3.5:1},uEnergyBloom:{value:0},uArcEnergy:{value:0},uMotion:{value:1},uAwake:{value:0},uReaction:{value:0},uSpeech:{value:0},uSpeechWave:{value:-2},uSpeechBurst:{value:0},uSpeechBurstSeed:{value:0},uPointer:{value:new THREE.Vector2()}};
const coreMaterial=new THREE.ShaderMaterial({uniforms:coreUniforms,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`attribute float aSeed,aSize,aLayer;uniform float uTime,uPixelRatio,uGlowBoost,uEnergyBloom,uArcEnergy,uMotion,uAwake,uReaction,uSpeech,uSpeechWave,uSpeechBurst,uSpeechBurstSeed;uniform vec2 uPointer;varying vec3 vColor;varying float vAlpha;
  float hash(float n){return fract(sin(n)*43758.5453123);}
  void main(){vec3 base=position;float radius=length(base);float t=uTime*uMotion;float nucleus=1.-step(.5,aLayer);float haze=step(1.5,aLayer);float cloud=1.-nucleus-haze;
  float h1=hash(aSeed*1.731+2.13),h2=hash(aSeed*3.117+5.71),h3=hash(aSeed*5.913+8.43),direction=h1>.5?1.:-1.;
  vec3 axis=normalize(vec3(h1-.5,h2-.5,h3-.5)+vec3(.001));float outerTravelAngle=haze*(t*(.34+h1*.52)*direction+.16*sin(t*(.19+h2*.21)+aSeed));float travelCos=cos(outerTravelAngle),travelSin=sin(outerTravelAngle);vec3 travelled=base*travelCos+cross(axis,base)*travelSin+axis*dot(axis,base)*(1.-travelCos);base=mix(base,travelled,haze);vec3 radial=normalize(base+vec3(.0001));vec3 tangent=normalize(cross(axis,radial)+vec3(.001));vec3 tangentB=normalize(cross(radial,tangent)+vec3(.001));
  vec2 pointerLocal=vec2(uPointer.x*2.35,uPointer.y*1.9);float pointerNear=(1.-smoothstep(.3,1.55,distance(base.xy,pointerLocal)))*uAwake;float activity=1.+uAwake*(nucleus*.16+cloud*.68+haze*.24)+uReaction*(nucleus*.2+cloud*.46+haze*.16)+uEnergyBloom*(nucleus*.08+cloud*.16+haze*.04)+uSpeech*(nucleus*3.+cloud*5.+haze*3.);
  float layerBoundary=nucleus*2.25+cloud*2.+haze*2.32,edgeGuard=1.-smoothstep(.68,1.,radius/layerBoundary),flowTime=t*(1.+haze*(1.8+h3*.8)+uSpeech*(nucleus*.7+cloud*1.25+haze*.9));float swirlSpeed=nucleus*(.2+h2*.16)+cloud*(.48+h2*.52)+haze*(.18+h2*.22);float swirlAmount=(nucleus*.018+cloud*(.085+radius*.025)+haze*.21)*activity;float swirl=sin(flowTime*swirlSpeed*direction+aSeed*1.37+sin(flowTime*.17+h3*6.283))*swirlAmount;
  float wanderSpeed=.52+h1*.78;vec3 wander=vec3(sin(flowTime*wanderSpeed+aSeed*2.11)+.45*sin(flowTime*(.31+h3*.34)+aSeed*.73),cos(flowTime*(.43+h2*.65)+aSeed*1.57)+.4*sin(flowTime*(.67+h1*.41)+aSeed*.29),sin(flowTime*(.38+h3*.72)+aSeed*.91)+.45*cos(flowTime*(.59+h2*.38)+aSeed*1.83));float wanderAmount=(nucleus*.012+cloud*(.065+radius*.018)+haze*.18)*activity;vec3 randomFlow=wander-radial*dot(wander,radial)*(1.-edgeGuard*.35);
  float radialAmount=sin(flowTime*(.31+h3*.35)+aSeed*.61+radius*3.4)*(nucleus*.006+cloud*.055+haze*.068)*activity*(.18+.82*edgeGuard);float vertical=sin(flowTime*(.27+h1*.43)+aSeed*2.43)*(nucleus*.006+cloud*.042+haze*.096)*activity;
  base+=tangent*swirl+tangentB*cos(flowTime*(.29+h1*.45)*direction+aSeed*.83)*swirlAmount*.48+randomFlow*wanderAmount+radial*radialAmount;base.y+=vertical*(.28+.72*edgeGuard);
  if(pointerNear>0.){vec2 away=normalize(base.xy-pointerLocal+vec2(.001));base.xy+=away*pointerNear*(nucleus*.018+cloud*.09+haze*.04);base.z+=sin(aSeed*2.7+t*1.15)*pointerNear*(nucleus*.012+cloud*.065+haze*.028);}
  float layerPhase=nucleus*.08+cloud*.52+haze*.92;float speechWave=exp(-pow((uSpeechWave-layerPhase)*4.2,2.))*uSpeech;float burstMask=smoothstep(.82,.985,hash(aSeed*1.97+uSpeechBurstSeed));base*=1.+speechWave*(nucleus*.012+cloud*.024+haze*.034);base+=radial*uSpeechBurst*burstMask*(nucleus*.035+cloud*.09+haze*.07);
  base*=1.+uEnergyBloom*(.018+nucleus*.005)+uAwake*(nucleus*.003+cloud*.006+haze*.002)+uReaction*(nucleus*.008+cloud*.01+haze*.003);vec4 mv=modelViewMatrix*vec4(base,1.);float center=1.-smoothstep(.06,2.3,radius);float edgeRadius=nucleus*2.25+cloud*2.+haze*2.32;float envelope=1.-smoothstep(.72,1.,radius/edgeRadius);float shimmer=.9+.1*sin(t*(.72+h2*.42)+aSeed*2.);float layerAlpha=nucleus*(.5+center*.34)+cloud*(.11+center*.48)+haze*(.028+center*.09);float depthLife=.76+.24*smoothstep(-2.2,2.2,base.z);gl_PointSize=aSize*uPixelRatio*(7.25/-mv.z)*(1.+uEnergyBloom*.06+uArcEnergy*.018+uAwake*.1+uReaction*.08+uSpeech*(nucleus*.14+cloud*.07+haze*.04)+speechWave*.08)*(nucleus*1.08+cloud+haze*.9);gl_Position=projectionMatrix*mv;vColor=color;vAlpha=layerAlpha*envelope*shimmer*depthLife*(1.+uEnergyBloom*.1+uArcEnergy*.075+uAwake*.2+uReaction*.16+speechWave*.38+uSpeechBurst*burstMask*.5)*smoothstep(9.,4.,-mv.z)*uGlowBoost;}`,
  fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float glow=pow(max(0.,1.-d),2.35);if(glow<.006)discard;gl_FragColor=vec4(vColor,glow*vAlpha);}`});
const volumetricCore=new THREE.Points(coreGeometry,coreMaterial);volumetricCore.frustumCulled=false;world.add(volumetricCore);

const ANCHOR_COUNT=isMobile?11:12,anchorPositions=new Float32Array(ANCHOR_COUNT*3),anchorBase=new Float32Array(ANCHOR_COUNT*3),anchorColors=new Float32Array(ANCHOR_COUNT*3),anchorPhases=new Float32Array(ANCHOR_COUNT);
for(let i=0;i<ANCHOR_COUNT;i+=1){const radius=.24+Math.pow(Math.random(),1.45)*1.05,theta=Math.random()*Math.PI*2,elevation=(Math.random()-.5)*1.5,point=[Math.cos(theta)*Math.cos(elevation)*radius,Math.sin(elevation)*radius*1.16,Math.sin(theta)*Math.cos(elevation)*radius*.82];anchorPositions.set(point,i*3);anchorBase.set(point,i*3);anchorPhases[i]=Math.random()*Math.PI*2;tempColor.setHex(i%5===0?0xe2aaa0:0xffedc8);anchorColors.set([tempColor.r,tempColor.g,tempColor.b],i*3);}
const anchorGeometry=new THREE.BufferGeometry();anchorGeometry.setAttribute("position",new THREE.BufferAttribute(anchorPositions,3));anchorGeometry.setAttribute("color",new THREE.BufferAttribute(anchorColors,3));
const anchorMaterial=new THREE.PointsMaterial({size:.105,map:glowMap,vertexColors:true,transparent:true,opacity:.88,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true});
const anchorParticles=new THREE.Points(anchorGeometry,anchorMaterial);world.add(anchorParticles);

const DEPTH_COUNT=isMobile?34:42,depthPositions=new Float32Array(DEPTH_COUNT*3),depthBase=new Float32Array(DEPTH_COUNT*3),depthSeeds=new Float32Array(DEPTH_COUNT),depthColors=new Float32Array(DEPTH_COUNT*3);
for(let i=0;i<DEPTH_COUNT;i+=1){const side=Math.random()>.42?1:-1,point=[side*(2.2+Math.random()*2.8),(Math.random()-.5)*4.5,-1.2+Math.random()*2.4];depthPositions.set(point,i*3);depthBase.set(point,i*3);depthSeeds[i]=Math.random()*Math.PI*2;tempColor.setHex(i%7===0?0xb47c78:0xddc9aa);depthColors.set([tempColor.r,tempColor.g,tempColor.b],i*3);}
const depthGeometry=new THREE.BufferGeometry();depthGeometry.setAttribute("position",new THREE.BufferAttribute(depthPositions,3));depthGeometry.setAttribute("color",new THREE.BufferAttribute(depthColors,3));
const depthParticles=new THREE.Points(depthGeometry,new THREE.PointsMaterial({size:.038,map:glowMap,vertexColors:true,transparent:true,opacity:.26,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));world.add(depthParticles);

const clusterAnchors=[new THREE.Vector3(1.42,1.02,.5),new THREE.Vector3(-1.38,-1.08,.72),new THREE.Vector3(-1.48,.44,-.48),new THREE.Vector3(1.62,-.55,-.82),new THREE.Vector3(.34,-1.58,.18)];
const clusters=clusterAnchors.map((anchor,index)=>{
  const count=6+(index*3)%7,base=[],positions=new Float32Array(count*3),colors=new Float32Array(count*3);
  for(let i=0;i<count;i+=1){const angle=Math.random()*Math.PI*2,radius=.1+Math.random()*(.28+index*.025),point=new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius*.68,(Math.random()-.5)*.26);base.push(point);positions.set(point.toArray(),i*3);tempColor.setHex(index===0&&i%4===0?0xc98b87:0xf0d8b2);colors.set([tempColor.r,tempColor.g,tempColor.b],i*3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
  const material=new THREE.PointsMaterial({size:.068,map:glowMap,vertexColors:true,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true});const points=new THREE.Points(geometry,material);
  const group=new THREE.Group();group.position.copy(anchor);group.add(points);world.add(group);
  const connections=[];const connectionCount=2+index%3;
  for(let c=0;c<connectionCount;c+=1){const from=c%count,to=(c*2+3)%count,middle=base[from].clone().lerp(base[to],.5);middle.z+=.08+(c%2)*.08;middle.y+=(c%2?1:-1)*.05;const curve=new THREE.QuadraticBezierCurve3(base[from].clone(),middle,base[to].clone()),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(18)),new THREE.LineBasicMaterial({color:index===0?0xe1b49b:0xe8c99a,transparent:true,opacity:.13,blending:THREE.AdditiveBlending,depthWrite:false}));group.add(line);connections.push({line,from,to,bend:middle});}
  return{group,points,material,base,positions,connections,anchor:anchor.clone(),phase:index*1.34+.4,count};
});

const routes=[];
function buildRoute(clusterIndex,index){const end=clusters[clusterIndex].anchor.clone(),control=end.clone().multiplyScalar(.48);control.x+=index%2?.65:-.48;control.y+=index===1?.46:-.18;control.z+=.35-index*.18;const curve=new THREE.CubicBezierCurve3(new THREE.Vector3(.05,0,0),control.clone().multiplyScalar(.45),control,end);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(56)),new THREE.LineBasicMaterial({color:index===2?0xc58e88:0xe7c89b,transparent:true,opacity:.11,blending:THREE.AdditiveBlending,depthWrite:false}));world.add(line);return{clusterIndex,curve,line,phase:index*2.1,direction:index%2===0};}
routes.push(buildRoute(0,0),buildRoute(1,1),buildRoute(3,2));
const pulseCount=3,pulsePositions=new Float32Array(pulseCount*3),pulseGeometry=new THREE.BufferGeometry();pulseGeometry.setAttribute("position",new THREE.BufferAttribute(pulsePositions,3));
const flowPulses=new THREE.Points(pulseGeometry,new THREE.PointsMaterial({color:0xffe2aa,size:.095,map:glowMap,transparent:true,opacity:.92,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));world.add(flowPulses);
const pulseState=Array.from({length:pulseCount},(_,index)=>({route:index%routes.length,start:-index*2.2,duration:3.4+index*.6,inward:index%2===0}));

const ribbons=[],RIBBON_COUNT=4;
for(let i=0;i<RIBBON_COUNT;i+=1){const radius=1.58+i*.5,points=[],span=Math.PI*(.68+i*.11);for(let j=0;j<12;j+=1){const p=j/11,angle=-span*.5+p*span,wobble=1+Math.sin(p*Math.PI*2.2+i)*.055;points.push(new THREE.Vector3(Math.cos(angle)*radius*wobble,Math.sin(angle)*radius*(.48+i*.035),Math.sin(p*Math.PI*1.5+i)*.32));}const curve=new THREE.CatmullRomCurve3(points,false,"catmullrom",.52),material=new THREE.LineBasicMaterial({color:i===2?0xc59089:0xe7c18c,transparent:true,opacity:.042+i*.01,blending:THREE.AdditiveBlending,depthWrite:false}),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(isMobile?68:104)),material);line.rotation.set(.35+i*.66,-.6+i*.78,.18-i*.34);line.position.set(i%2?.08:-.16,(i-1.5)*.05,i%2?.15:-.2);world.add(line);ribbons.push({line,curve,material,opacity:material.opacity,speed:(i%2?1:-1)*(.007+i*.0025),phase:i*1.7});}
const ribbonHighlightPositions=new Float32Array(RIBBON_COUNT*3),ribbonHighlightGeometry=new THREE.BufferGeometry();ribbonHighlightGeometry.setAttribute("position",new THREE.BufferAttribute(ribbonHighlightPositions,3));
const ribbonHighlights=new THREE.Points(ribbonHighlightGeometry,new THREE.PointsMaterial({color:0xf6d39c,size:.07,map:glowMap,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));world.add(ribbonHighlights);

const ARC_PATH_COUNT=isMobile?16:18,ARC_POINT_COUNT=isMobile?34:38,arcPalette=[0xfff8e7,0xffe6b8,0xf7cf92,0xffefd0],arcGlowOffsets=[[-.012,0],[.012,0],[0,-.012],[0,.012]];
const energyArcPaths=Array.from({length:ARC_PATH_COUNT},()=>{const positions=new Float32Array(ARC_POINT_COUNT*3),geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));const lineMaterial=new THREE.LineBasicMaterial({color:0xfff2d4,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),sparkMaterial=new THREE.PointsMaterial({color:0xffdfaa,size:isMobile?.105:.13,map:glowMap,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}),line=new THREE.Line(geometry,lineMaterial),sparks=new THREE.Points(geometry,sparkMaterial),glowLines=arcGlowOffsets.map(([x,y])=>{const material=new THREE.LineBasicMaterial({color:0xffdca4,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),glowLine=new THREE.Line(geometry,material);glowLine.position.set(x,y,0);glowLine.visible=false;world.add(glowLine);return{line:glowLine,material};});line.visible=sparks.visible=false;world.add(line,sparks);return{positions,geometry,line,sparks,glowLines,lineMaterial,sparkMaterial,active:false,start:0,duration:1,strength:0};});
const arcFrom=new THREE.Vector3(),arcTo=new THREE.Vector3(),arcDirection=new THREE.Vector3(),arcOutward=new THREE.Vector3(),arcNormal=new THREE.Vector3(),arcBinormal=new THREE.Vector3(),arcPoint=new THREE.Vector3();
function randomSpherePoint(minRadius,maxRadius,target){const z=Math.random()*2-1,angle=Math.random()*Math.PI*2,radius=minRadius+Math.random()*(maxRadius-minRadius),ring=Math.sqrt(1-z*z);return target.set(Math.cos(angle)*ring*radius,z*radius,Math.sin(angle)*ring*radius);}
function shapeArc(path,from,to,curveStrength){arcDirection.subVectors(to,from);const length=arcDirection.length();arcDirection.normalize();randomSpherePoint(.8,1.2,arcNormal);arcNormal.cross(arcDirection);if(arcNormal.lengthSq()<.01)arcNormal.set(0,1,0).cross(arcDirection);arcNormal.normalize();arcBinormal.crossVectors(arcDirection,arcNormal).normalize();const phase=Math.random()*Math.PI*2,curve=(.025+Math.random()*.055)*length*curveStrength;for(let i=0;i<ARC_POINT_COUNT;i+=1){const p=i/(ARC_POINT_COUNT-1),feather=Math.sin(p*Math.PI),irregular=(Math.sin(p*Math.PI*(4+Math.floor(Math.random()*2))+phase)*.018+Math.sin(p*Math.PI*11+phase*.37)*.007)*length;arcPoint.lerpVectors(from,to,p).addScaledVector(arcNormal,feather*curve+irregular).addScaledVector(arcBinormal,Math.sin(p*Math.PI*7+phase)*feather*.012*length);path.positions.set(arcPoint.toArray(),i*3);}path.geometry.attributes.position.needsUpdate=true;path.geometry.computeBoundingSphere();}
function activateArcPath(path,from,to,time,duration,strength){shapeArc(path,from,to,strength);const color=arcPalette[Math.floor(Math.random()*arcPalette.length)];path.lineMaterial.color.setHex(color);path.sparkMaterial.color.setHex(color);path.glowLines.forEach(({line,material})=>{material.color.setHex(color);line.visible=true;});path.active=true;path.start=time;path.duration=duration;path.strength=strength;path.line.visible=path.sparks.visible=true;}
let nextArcTime=.55+Math.random()*.5,nextStrongArcTime=4.5+Math.random()*3,arcEnergy=0;
function spawnEnergyArc(time){
  const available=energyArcPaths.filter(path=>!path.active);
  if(!available.length){nextArcTime=time+.18;return;}
  const speakingArcs=currentSpeechMotion>.2;
  const strong=time>=nextStrongArcTime,duration=strong?1.65+Math.random()*.65:1.15+Math.random()*.6,mainPath=available.shift(),eventPaths=[mainPath];
  randomSpherePoint(.025,.15,arcFrom);
  if(Math.random()<.48)arcTo.copy(clusterAnchors[Math.floor(Math.random()*clusterAnchors.length)]).multiplyScalar(.58+Math.random()*.38);
  else randomSpherePoint(.62,1.86,arcTo);
  const soundLength=arcFrom.distanceTo(arcTo),soundPan=THREE.MathUtils.clamp(arcTo.x/1.9,-1,1),soundStrength=strong?1:.86;
  diagnostics.centerOriginArcs=(diagnostics.centerOriginArcs||0)+1;
  diagnostics.maxArcSourceRadius=Math.max(diagnostics.maxArcSourceRadius||0,arcFrom.length());
  activateArcPath(mainPath,arcFrom,arcTo,time,duration,soundStrength);
  let visiblePaths=1;
  const branches=strong?(speakingArcs?5+Math.floor(Math.random()*3):4+Math.floor(Math.random()*3)):(speakingArcs?2+(Math.random()<.5?1:0):1+(Math.random()<.58?1:0));
  for(let branch=0;branch<branches&&available.length;branch+=1){
    const branchPath=available.shift(),parent=branch>1&&Math.random()<.58?eventPaths[Math.floor(Math.random()*eventPaths.length)]:mainPath,sourceIndex=Math.floor(ARC_POINT_COUNT*(.28+Math.random()*.52)),offset=sourceIndex*3,branchLength=parent===mainPath?.3+Math.random()*.42:.2+Math.random()*.3;
    arcFrom.fromArray(parent.positions,offset);arcOutward.copy(arcFrom);
    if(arcOutward.lengthSq()<.01)arcOutward.copy(arcTo);
    arcOutward.normalize();randomSpherePoint(.2,.58,arcDirection);
    arcDirection.addScaledVector(arcOutward,-arcDirection.dot(arcOutward)).addScaledVector(arcOutward,.58+Math.random()*.42).setLength(branchLength);
    arcTo.copy(arcFrom).add(arcDirection);if(arcTo.length()>1.9)arcTo.setLength(1.9);
    activateArcPath(branchPath,arcFrom,arcTo,time+.018+branch*.026,duration*(.68+Math.random()*.22),strong?.76:.66);
    eventPaths.push(branchPath);visiblePaths+=1;
  }
  if(strong){nextStrongArcTime=time+(speakingArcs?2.2+Math.random()*1.6:4.5+Math.random()*3);diagnostics.strongArcEvents=(diagnostics.strongArcEvents||0)+1;}
  diagnostics.arcEvents=(diagnostics.arcEvents||0)+1;
  diagnostics.energyArcs=(diagnostics.energyArcs||0)+visiblePaths;
  const detail={strength:soundStrength,length:soundLength,duration,pathCount:visiblePaths,pan:soundPan};
  if(onArc)onArc(detail);else dispatchEvent(new CustomEvent("rya-energy-arc",{detail}));
  nextArcTime=time+(speakingArcs?.12+Math.random()*.18:.28+Math.random()*.42);
}
function updateEnergyArcs(time){if(!reducedMotion.matches&&time>=nextArcTime)spawnEnergyArc(time);let peak=0,visible=0;const speechGlow=1+currentSpeechMotion*.35;energyArcPaths.forEach(path=>{if(!path.active)return;const progress=(time-path.start)/path.duration;if(progress<0)return;if(progress>=1){path.active=false;path.line.visible=path.sparks.visible=false;path.glowLines.forEach(({line,material})=>{line.visible=false;material.opacity=0;});path.lineMaterial.opacity=path.sparkMaterial.opacity=0;return;}visible+=1;const envelope=Math.sin(progress*Math.PI)**1.12,softFlicker=.975+.025*Math.sin(progress*Math.PI*4+path.strength*2.1),energy=envelope*path.strength;path.lineMaterial.opacity=energy*(path.strength>.9?1:.9)*softFlicker*speechGlow;path.sparkMaterial.opacity=energy*(path.strength>.9?.68:.56)*speechGlow;path.glowLines.forEach(({material},index)=>{material.opacity=energy*(.2+(index%2)*.035)*softFlicker*speechGlow;});peak=Math.max(peak,energy);});diagnostics.maxVisibleArcs=Math.max(diagnostics.maxVisibleArcs||0,visible);arcEnergy+=(peak-arcEnergy)*.18;}

let bloomStart=-10,nextBloom=2.8+Math.random(),energyBloom=0;
const energyChannels={idleBloom:0,speech:{active:false,scale:0,glow:0,particles:0}};
let playbackTarget=0;
let speechLevel=0,currentSpeechMotion=0,speechWaveStart=-10,speechWaveDuration=1,nextSpeechWave=Infinity,speechBurstStart=-10,nextSpeechBurst=Infinity,speechVariation=Math.random(),renderActive=true,animationFrame=0;
const control={
  get active(){return renderActive;},
  setPlaybackEnergy(value){if(!live||disposed||reducedMotion.matches)return;playbackTarget=Math.max(0,Math.min(.38,Number(value)*.38||0));if(!playbackTarget){speechLevel=currentSpeechMotion=0;coreUniforms.uSpeech.value=0;}if(renderActive&&!animationFrame)animationFrame=requestAnimationFrame(animate);},
  setActive(active){renderActive=Boolean(active);mount.classList.toggle("is-paused",!renderActive);if(!renderActive&&animationFrame){cancelAnimationFrame(animationFrame);animationFrame=0;}else if(renderActive&&!animationFrame)animationFrame=requestAnimationFrame(animate);},
  setSpeechEnergy({active=false,scale=0,glow=0,particles=0}={}){const wasActive=energyChannels.speech.active;energyChannels.speech.active=Boolean(active);energyChannels.speech.scale=THREE.MathUtils.clamp(scale,0,1);energyChannels.speech.glow=THREE.MathUtils.clamp(glow,0,1);energyChannels.speech.particles=THREE.MathUtils.clamp(particles,0,1);if(active&&!wasActive){const now=performance.now()*.001;speechVariation=Math.random();nextSpeechWave=now+.35+Math.random()*.45;nextSpeechBurst=now+.7+Math.random()*1.1;coreUniforms.uSpeechBurstSeed.value=Math.random()*100;}else if(!active){nextSpeechWave=nextSpeechBurst=Infinity;}if(reducedMotion.matches){speechLevel=active?1:0;if(renderActive&&!animationFrame)animationFrame=requestAnimationFrame(animate);}}
};

let presence=0,reactionStart=-10,reaction=0;
const effectState={clusters:true,routes:true,ribbons:true,arcs:true};
function protect(name,callback){if(!effectState[name])return;try{callback();}catch(error){effectState[name]=false;console.error(`Rya optional ${name} effect disabled`,error);}}
const workA=new THREE.Vector3(),workB=new THREE.Vector3();
function updateClusters(time){clusters.forEach((cluster,index)=>{const movement=1+currentSpeechMotion*2.5,awareness=energyChannels.idleBloom*(.32+.08*Math.sin(index*1.7+.4))+currentSpeechMotion*.45;cluster.group.position.set(cluster.anchor.x+Math.sin(time*.12+cluster.phase)*.065*movement,cluster.anchor.y+Math.cos(time*.1+cluster.phase)*.055*movement,cluster.anchor.z+Math.sin(time*.08+cluster.phase)*.05*movement);cluster.group.scale.setScalar(1+Math.sin(time*.38+cluster.phase)*.025*movement+awareness*.035);cluster.material.opacity=.64+Math.sin(time*.31+cluster.phase)*.08+awareness*.16;for(let i=0;i<cluster.count;i+=1){const base=cluster.base[i],offset=i*3;cluster.positions[offset]=base.x+Math.sin(time*.18+i+cluster.phase)*.018*movement;cluster.positions[offset+1]=base.y+Math.cos(time*.16+i*.7+cluster.phase)*.016*movement;cluster.positions[offset+2]=base.z+Math.sin(time*.13+i*.4)*.014*movement;}cluster.points.geometry.attributes.position.needsUpdate=true;cluster.connections.forEach((connection,c)=>{const from=workA.fromArray(cluster.positions,connection.from*3).clone(),to=workB.fromArray(cluster.positions,connection.to*3).clone(),middle=from.clone().lerp(to,.5);middle.z+=.08+(c%2)*.08;middle.y+=(c%2?1:-1)*.05;connection.line.geometry.setFromPoints(new THREE.QuadraticBezierCurve3(from,middle,to).getPoints(18));connection.line.material.opacity=.09+.07*Math.sin(time*.27+cluster.phase+c)**2;});});}
function updateRoutes(time){routes.forEach((route,index)=>{route.line.material.opacity=(.035+.052*Math.sin(time*.22+route.phase)**2)*(1+presence*.34+reaction*.28+currentSpeechMotion*.5);});pulseState.forEach((pulse,index)=>{if(time-pulse.start>pulse.duration){pulse.route=Math.floor(Math.random()*routes.length);pulse.start=time+.4+Math.random()*2.2;pulse.duration=3+Math.random()*2.5;pulse.inward=Math.random()>.42;}let progress=THREE.MathUtils.clamp((time-pulse.start)/pulse.duration,0,1);if(pulse.inward)progress=1-progress;const point=routes[pulse.route].curve.getPoint(progress);pulsePositions.set(point.toArray(),index*3);});pulseGeometry.attributes.position.needsUpdate=true;}
function updateRibbons(time,delta,motion){ribbons.forEach((ribbon,index)=>{ribbon.line.rotation.y+=delta*ribbon.speed*motion*(1+presence*.22+currentSpeechMotion*2.2);ribbon.line.rotation.z+=delta*ribbon.speed*.28*motion*(1+currentSpeechMotion*1.4);ribbon.material.opacity=ribbon.opacity*(.56+.44*Math.sin(time*.24+ribbon.phase)**2)*(1+presence*.38+reaction*.28+currentSpeechMotion*.55);const point=ribbon.curve.getPointAt((time*(.018+index*.006)*(1+presence*.18+currentSpeechMotion*.85)+index*.23)%1);point.applyEuler(ribbon.line.rotation).add(ribbon.line.position);ribbonHighlightPositions.set(point.toArray(),index*3);});ribbonHighlightGeometry.attributes.position.needsUpdate=true;}
function resize(){const width=mount.clientWidth,height=mount.clientHeight;if(!width||!height)return;const sectionMode=Boolean(mount.closest("[data-rya-section-host]")),pixelRatio=Math.min(devicePixelRatio,isMobile?1.5:1.7),compactGlow=compactViewport.matches&&!chatMode;renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);renderer.toneMappingExposure=compactGlow?1.65:1.12;camera.aspect=width/height;camera.fov=chatMode?(width<220?53:48):sectionMode?(width<500?51:46):(width<500?52:width<850?49:44);camera.position.z=chatMode?(width<220?7.15:6.65):sectionMode?(width<500?6.25:6.5):(width<500?8.35:6.62);camera.updateProjectionMatrix();coreUniforms.uPixelRatio.value=pixelRatio;coreUniforms.uGlowBoost.value=compactGlow?3.5:1;diagnostics.compactGlow=compactGlow;diagnostics.toneMappingExposure=renderer.toneMappingExposure;}
const pointer={x:0,y:0,tx:0,ty:0,near:0,nearTarget:0};
function pointerProximity(event){const canvas=renderer.domElement,rect=canvas.getBoundingClientRect(),localX=event.clientX-rect.left,localY=event.clientY-rect.top,center=new THREE.Vector3(0,world.position.y,0).project(camera),centerX=(center.x*.5+.5)*rect.width,centerY=(-center.y*.5+.5)*rect.height,radius=Math.min(rect.width,rect.height)*.46,distance=Math.hypot(localX-centerX,localY-centerY);return 1-THREE.MathUtils.smoothstep(distance,radius*.22,radius);}
function bodyTouchProximity(event){const canvas=renderer.domElement,rect=canvas.getBoundingClientRect(),localX=event.clientX-rect.left,localY=event.clientY-rect.top,center=new THREE.Vector3(0,world.position.y,0).project(camera),centerX=(center.x*.5+.5)*rect.width,centerY=(-center.y*.5+.5)*rect.height,radius=Math.min(rect.width,rect.height)*.54,distance=Math.hypot(localX-centerX,localY-centerY);return Math.max(0,1-distance/radius);}
if(!isMobile){mount.addEventListener("pointermove",event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.tx=((event.clientX-rect.left)/rect.width-.5)*2;pointer.ty=((event.clientY-rect.top)/rect.height-.5)*2;pointer.nearTarget=pointerProximity(event);},{passive:true,signal:listeners.signal});mount.addEventListener("pointerleave",()=>{pointer.tx=pointer.ty=pointer.nearTarget=0;},{signal:listeners.signal});}
const TAP_MOVEMENT_THRESHOLD=12,TAP_DURATION_LIMIT=700;
let touchIntent=null;
mount.addEventListener("pointerdown",event=>{if(event.isPrimary===false||bodyTouchProximity(event)<=0)return;touchIntent={pointerId:event.pointerId,x:event.clientX,y:event.clientY,startedAt:performance.now(),moved:false};},{passive:true,signal:listeners.signal});
mount.addEventListener("pointermove",event=>{if(!touchIntent||event.pointerId!==touchIntent.pointerId)return;if(Math.hypot(event.clientX-touchIntent.x,event.clientY-touchIntent.y)>TAP_MOVEMENT_THRESHOLD)touchIntent.moved=true;},{passive:true,signal:listeners.signal});
mount.addEventListener("pointercancel",()=>{touchIntent=null;},{passive:true,signal:listeners.signal});
mount.addEventListener("pointerup",event=>{if(!touchIntent||event.pointerId!==touchIntent.pointerId)return;const intent=touchIntent;touchIntent=null;const moved=intent.moved||Math.hypot(event.clientX-intent.x,event.clientY-intent.y)>TAP_MOVEMENT_THRESHOLD,touchProximity=bodyTouchProximity(event);if(moved||performance.now()-intent.startedAt>TAP_DURATION_LIMIT||touchProximity<=0)return;reactionStart=performance.now()*.001;diagnostics.interactions=(diagnostics.interactions||0)+1;window.dispatchEvent(new CustomEvent("rya-body-touch",{detail:{pointerType:event.pointerType||"mouse",proximity:touchProximity}}));},{passive:true,signal:listeners.signal});

let lastTime=0;
function animate(milliseconds){const time=live&&reducedMotion.matches?0:milliseconds*.001,delta=Math.min(.05,time-lastTime||.016);lastTime=time;const motion=reducedMotion.matches?.24:1,t=time*motion*.5;
  animationFrame=0;if(!renderActive)return;
  if(!reducedMotion.matches&&time>nextBloom){bloomStart=time;nextBloom=time+4.2+Math.random()*1.1;diagnostics.energyBlooms=(diagnostics.energyBlooms||0)+1;}
  const bloomAge=time-bloomStart;if(bloomAge>=0&&bloomAge<3.35){const rise=THREE.MathUtils.smoothstep(bloomAge,0,1.15),fall=1-THREE.MathUtils.smoothstep(bloomAge,1.15,3.35);energyBloom=rise*fall;}else energyBloom=0;
  const speechTarget=live?playbackTarget:(energyChannels.speech.active?1:0);if(live){speechLevel=reducedMotion.matches?0:speechLevel+(speechTarget-speechLevel)*(1-Math.exp(-delta/(speechTarget>speechLevel?.07:.18)));}else if(!reducedMotion.matches){const transitionDuration=speechTarget>.5?.55:1.5;speechLevel+=THREE.MathUtils.clamp(speechTarget-speechLevel,-delta/transitionDuration,delta/transitionDuration);}currentSpeechMotion=live?speechLevel:(reducedMotion.matches?speechLevel*.06:speechLevel*(.9+.1*Math.sin(time*(.72+speechVariation*.22)+speechVariation*6.283)));
  if(energyChannels.speech.active&&!reducedMotion.matches&&time>=nextSpeechWave){speechWaveStart=time;speechWaveDuration=.9+Math.random()*.35;nextSpeechWave=time+.8+Math.random();diagnostics.speechWaves=(diagnostics.speechWaves||0)+1;}const speechWaveAge=time-speechWaveStart,speechWavePhase=speechWaveAge>=0&&speechWaveAge<speechWaveDuration?speechWaveAge/speechWaveDuration:-2;
  if(energyChannels.speech.active&&!reducedMotion.matches&&time>=nextSpeechBurst){speechBurstStart=time;nextSpeechBurst=time+1+Math.random()*2;coreUniforms.uSpeechBurstSeed.value=Math.random()*100;diagnostics.speechBursts=(diagnostics.speechBursts||0)+1;}const speechBurstAge=time-speechBurstStart,speechBurst=speechBurstAge>=0&&speechBurstAge<.72?Math.sin(speechBurstAge/.72*Math.PI)**1.6*currentSpeechMotion:0;
  const speechPulse=(live?0:speechLevel)*(.55+.45*Math.sin(time*(2.7+speechVariation*.8)+speechVariation*6.283)**2),reducedSpeechGlow=reducedMotion.matches?speechLevel*.16:0;
  energyChannels.idleBloom=!live&&energyChannels.speech.active?energyBloom*.2:energyBloom;
  const scaleEnergy=energyChannels.idleBloom*.018+(reducedMotion.matches?reducedSpeechGlow*.035:currentSpeechMotion*(.025+speechPulse*.018)),glowEnergy=energyChannels.idleBloom+reducedSpeechGlow+currentSpeechMotion*(.26+speechPulse*.22),particleEnergy=energyChannels.idleBloom+currentSpeechMotion*(.32+speechPulse*.16);
  const reactionAge=time-reactionStart,recoil=reactionAge>=0&&reactionAge<.18?-Math.sin(reactionAge/.18*Math.PI)*.01:0;reaction=reactionAge>=.12&&reactionAge<2?Math.sin((reactionAge-.12)/1.88*Math.PI)**2:0;
  pointer.near+=(pointer.nearTarget-pointer.near)*.09;presence+=(pointer.near-presence)*.075;
  diagnostics.hoverPeak=Math.max(diagnostics.hoverPeak||0,presence);diagnostics.reactionPeak=Math.max(diagnostics.reactionPeak||0,reaction);
  const coreScaleX=isMobile?1.06:1.12,coreScaleY=isMobile?1.06:1.12,coreScaleZ=isMobile?1.06:1.12;
  protect("arcs",()=>updateEnergyArcs(time));coreUniforms.uTime.value=t;coreUniforms.uEnergyBloom.value=particleEnergy;coreUniforms.uArcEnergy.value=arcEnergy;coreUniforms.uMotion.value=1;coreUniforms.uAwake.value=presence;coreUniforms.uReaction.value=reaction;coreUniforms.uSpeech.value=currentSpeechMotion;coreUniforms.uSpeechWave.value=speechWavePhase;coreUniforms.uSpeechBurst.value=speechBurst;coreUniforms.uPointer.value.set(pointer.x,-pointer.y);volumetricCore.scale.set(coreScaleX+scaleEnergy+presence*.035+reaction*.028+recoil,coreScaleY+scaleEnergy*1.2+presence*.042+reaction*.035+recoil,coreScaleZ+scaleEnergy+presence*.035+reaction*.028+recoil);
  const mobileHomepageGlow=compactViewport.matches&&!chatMode?1:0;
  const haloSize=isMobile?5.05:5.35;innerGlow.scale.setScalar(haloSize+glowEnergy*.16+speechPulse*.12+presence*.3+reaction*.35);innerGlow.material.opacity=.36+mobileHomepageGlow*.56+Math.sin(t*.39)*.018+glowEnergy*.04+speechPulse*.075+arcEnergy*.014+presence*.075+reaction*.06;
  const nucleusSize=isMobile?4.45:4.65;nucleusGlow.scale.setScalar(nucleusSize+glowEnergy*.13+speechPulse*.1+presence*.2+reaction*.26);nucleusGlow.material.opacity=.27+mobileHomepageGlow*.5+Math.sin(t*.31+.7)*.016+glowEnergy*.03+speechPulse*.065+arcEnergy*.01+presence*.045+reaction*.05;
  bloomGlow.scale.setScalar(2.8+energyChannels.idleBloom*1.35+reaction*.8);bloomGlow.material.opacity=Math.max(energyChannels.idleBloom*.024,reaction*.07)+mobileHomepageGlow*.09;
  for(let i=0;i<ANCHOR_COUNT;i+=1){const offset=i*3,phase=anchorPhases[i],activity=1+presence*.52+reaction*.42+particleEnergy*.08;anchorPositions[offset]=anchorBase[offset]+Math.sin(t*.24*activity+phase)*.026*activity;anchorPositions[offset+1]=anchorBase[offset+1]+Math.cos(t*.2*activity+phase*1.3)*.023*activity;anchorPositions[offset+2]=anchorBase[offset+2]+Math.sin(t*.17*activity+phase*.8)*.02*activity;}anchorGeometry.attributes.position.needsUpdate=true;anchorMaterial.opacity=.82+mobileHomepageGlow*.24+Math.sin(t*.46)*.07+particleEnergy*.035+presence*.1+reaction*.08;anchorMaterial.size=.102+particleEnergy*.005+reaction*.008;
  for(let i=0;i<DEPTH_COUNT;i+=1){const offset=i*3,phase=depthSeeds[i],speed=.72+(i%7)*.105,awareness=1+presence*.28+currentSpeechMotion*3;depthPositions[offset]=depthBase[offset]+Math.sin(time*speed*(1+currentSpeechMotion*.9)+phase)*.31*awareness+Math.sin(time*.41+phase*1.7)*.1;depthPositions[offset+1]=depthBase[offset+1]+Math.cos(time*(speed*.83)*(1+currentSpeechMotion*1.1)+phase*1.31)*.35*awareness;depthPositions[offset+2]=depthBase[offset+2]+Math.sin(time*(speed*1.16)*(1+currentSpeechMotion*.75)+phase*.73)*.43*awareness;}depthGeometry.attributes.position.needsUpdate=true;
  protect("clusters",()=>updateClusters(t));protect("routes",()=>updateRoutes(t));protect("ribbons",()=>updateRibbons(t,delta,motion*.5));
  pointer.x+=(pointer.tx-pointer.x)*.022;pointer.y+=(pointer.ty-pointer.y)*.022;const focusY=chatMode?0:.5;camera.position.x=Math.sin(t*.052)*.035+pointer.x*.065;camera.position.y=(chatMode?0:.08)+Math.cos(t*.043)*.025-pointer.y*.048;camera.lookAt(pointer.x*.02,focusY-pointer.y*.018,0);world.rotation.y=Math.sin(t*.039)*.008+pointer.x*.008;world.rotation.x=Math.cos(t*.033)*.006-pointer.y*.006;
  renderer.render(scene,camera);diagnostics.frames+=1;
  if(shaderFailure&&!fallbackApplied){fallbackApplied=true;volumetricCore.material=new THREE.PointsMaterial({color:0xf7d9a7,size:.045,map:glowMap,transparent:true,opacity:.78,blending:THREE.AdditiveBlending,depthWrite:false});}
  if(!shaderFailure&&diagnostics.frames>2){if(!live)document.body.classList.add("rya-webgl-ready");mount.classList.add("is-ready");}if(!reducedMotion.matches)animationFrame=requestAnimationFrame(animate);
}
addEventListener("resize",resize,{passive:true,signal:listeners.signal});
const observer="ResizeObserver" in window?new ResizeObserver(resize):null;observer?.observe(mount);
reducedMotion.addEventListener?.("change",()=>{if(renderActive&&!animationFrame)animationFrame=requestAnimationFrame(animate);},{signal:listeners.signal});
resize();animationFrame=requestAnimationFrame(animate);
control.dispose=()=>{if(disposed)return;disposed=true;control.setActive(false);listeners.abort();observer?.disconnect();
  const resources=new Set([glowMap,coreMaterial]);scene.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of (Array.isArray(node.material)?node.material:[node.material]))if(material)resources.add(material);});
  resources.forEach(resource=>resource.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();mount.classList.remove("is-ready");
};
if(!live&&new URLSearchParams(location.search).has("interaction-test")){setTimeout(()=>{const rect=renderer.domElement.getBoundingClientRect(),clientX=rect.left+rect.width*.5,clientY=rect.top+rect.height*.44;mount.dispatchEvent(new PointerEvent("pointermove",{clientX,clientY}));mount.dispatchEvent(new PointerEvent("pointerdown",{clientX,clientY,pointerType:"mouse"}));setTimeout(()=>mount.dispatchEvent(new PointerEvent("pointerleave")),1500);},700);}

return control;
}
