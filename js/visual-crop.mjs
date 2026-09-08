const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export class SquareCrop {
  constructor(width, height) {
    if (![width,height].every(n=>Number.isInteger(n) && n >= 128 && n <= 8192) || width * height > 24000000) throw new Error("Choose a photo between 128 pixels and 24 megapixels, no more than 8192 pixels on either edge.");
    this.originalWidth = width; this.originalHeight = height; this.rotation = 0; this.reset();
  }
  get width() { return this.rotation % 180 ? this.originalHeight : this.originalWidth; }
  get height() { return this.rotation % 180 ? this.originalWidth : this.originalHeight; }
  reset() { this.edge = Math.min(this.width,this.height); this.x = (this.width-this.edge)/2; this.y = (this.height-this.edge)/2; return this; }
  pan(dx,dy) { if (![dx,dy].every(Number.isFinite)) return this; this.x=clamp(this.x+dx,0,this.width-this.edge); this.y=clamp(this.y+dy,0,this.height-this.edge); return this; }
  zoom(value) {
    if (!Number.isFinite(value)) return this;
    const edge = clamp(Math.min(this.width,this.height)/value,128,Math.min(this.width,this.height));
    this.x += (this.edge-edge)/2; this.y += (this.edge-edge)/2; this.edge=edge; return this.pan(0,0);
  }
  rotate() {
    const x = this.height-this.y-this.edge, y = this.x;
    this.rotation = (this.rotation+90)%360; this.x=x; this.y=y; return this.pan(0,0);
  }
  value() { return { x:this.x/this.width, y:this.y/this.height, width:this.edge/this.width, height:this.edge/this.height, rotation:this.rotation }; }
  draw(canvas, bitmap) {
    const ctx=canvas.getContext("2d"); if (!ctx) throw new Error("Photo preview is unavailable.");
    ctx.save(); ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.scale(canvas.width/this.edge,canvas.height/this.edge); ctx.translate(-this.x,-this.y);
    if (this.rotation===90) { ctx.translate(this.width,0); ctx.rotate(Math.PI/2); }
    if (this.rotation===180) { ctx.translate(this.width,this.height); ctx.rotate(Math.PI); }
    if (this.rotation===270) { ctx.translate(0,this.height); ctx.rotate(-Math.PI/2); }
    ctx.drawImage(bitmap,0,0); ctx.restore();
  }
}

export function mountCropControls(root, bitmap, { onChange=()=>{}, initial=null }={}) {
  const doc=root.ownerDocument, crop=new SquareCrop(bitmap.width,bitmap.height);
  if (initial) {
    while (crop.rotation !== initial.rotation) crop.rotate();
    crop.edge=initial.width*crop.width; crop.x=initial.x*crop.width; crop.y=initial.y*crop.height; crop.pan(0,0);
  }
  const canvas=doc.createElement("canvas"); canvas.width=canvas.height=512; canvas.className="visual-crop-canvas"; canvas.tabIndex=0;
  canvas.setAttribute("aria-label","Square photo crop. Arrow keys move the frame; plus and minus zoom. Shift and arrow moves farther.");
  const controls=doc.createElement("div"); controls.className="visual-crop-controls";
  const label=doc.createElement("label"); label.textContent="Zoom "; const zoom=doc.createElement("input"); zoom.type="range"; zoom.min=1; zoom.step=.01;
  zoom.max=Math.min(crop.width,crop.height)/128; zoom.setAttribute("aria-label","Crop zoom"); label.append(zoom); controls.append(label);
  const note=doc.createElement("p"); note.className="visual-hint";
  function draw() { crop.draw(canvas,bitmap); zoom.value=Math.min(crop.width,crop.height)/crop.edge; note.textContent=`Square crop: ${Math.round(crop.edge)} × ${Math.round(crop.edge)} source pixels. ${crop.edge < 256 ? "Low resolution: review the result carefully." : "Include one person's full face with some headroom."}`; onChange(crop.value()); }
  function button(text, action) { const b=doc.createElement("button"); b.type="button"; b.textContent=text; b.addEventListener("click",()=>{action();draw();}); controls.append(b); }
  button("Rotate 90°",()=>crop.rotate()); button("Reset crop",()=>crop.reset());
  zoom.addEventListener("input",()=>{crop.zoom(Number(zoom.value));draw();});
  canvas.addEventListener("keydown",event=>{
    const step=crop.edge*(event.shiftKey?.1:.02), keys={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
    if(keys[event.key]) {event.preventDefault();crop.pan(...keys[event.key]);draw();}
    else if(["+","=","-"].includes(event.key)) {event.preventDefault();crop.zoom(Number(zoom.value)*(event.key==="-"?.9:1.1));draw();}
  });
  let pointer=null;
  canvas.addEventListener("pointerdown",event=>{pointer={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener("pointermove",event=>{if(pointer?.id!==event.pointerId)return;const scale=crop.edge/canvas.getBoundingClientRect().width;crop.pan((pointer.x-event.clientX)*scale,(pointer.y-event.clientY)*scale);pointer.x=event.clientX;pointer.y=event.clientY;draw();});
  canvas.addEventListener("pointerup",()=>{pointer=null;}); canvas.addEventListener("pointercancel",()=>{pointer=null;});
  root.replaceChildren(canvas,controls,note); draw();
  return { value:()=>crop.value(), preview:()=>canvas.toDataURL("image/png"), dispose(){pointer=null;canvas.width=canvas.height=0;root.replaceChildren();} };
}
