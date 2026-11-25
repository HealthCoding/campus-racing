// Resolution is adaptive; gameplay time, hit geometry and building detail are not.
export const QUALITY_MODES=Object.freeze(['auto','high','smooth']);
export function createRenderQuality({width=1440,height=900,devicePixelRatio=1,mobile=false,mode='auto'}={}){
 let selected=QUALITY_MODES.includes(mode)?mode:'auto',ratio=1,previous=null,samples=0,sum=0,slow=0,fast=0,lastChange=-Infinity,changes=0,average=0,lastActive=-Infinity;
 const budget=()=>selected==='high'?{cap:mobile?1.5:2,pixels:mobile?1800000:6000000,shadowSize:mobile?1024:2048,shadowHz:30}:selected==='smooth'?{cap:mobile?.85:1,pixels:mobile?650000:1600000,shadowSize:512,shadowHz:15}:{cap:mobile?1:1.5,pixels:mobile?1100000:3000000,shadowSize:1024,shadowHz:mobile?20:30};
 function ceiling(){const b=budget();return Math.min(Math.max(.5,devicePixelRatio||1),b.cap,Math.sqrt(b.pixels/Math.max(1,width*height)));}
 function resetSamples(){previous=null;samples=0;sum=0;slow=0;fast=0;}
 function resetRatio(){ratio=ceiling();resetSamples();}
 resetRatio();
 return{
  get mode(){return selected;},get ratio(){return ratio;},get profile(){return {...budget(),pixelRatio:ratio,mobile};},
  setMode(value){if(!QUALITY_MODES.includes(value))return false;selected=value;resetRatio();return true;},
  resize(w,h,dpr=devicePixelRatio){width=Math.max(1,w);height=Math.max(1,h);devicePixelRatio=dpr;resetRatio();},
  pause(){resetSamples();},
  // Ignore tab suspension and one-off stalls. Require sustained load before changes.
  sample(now,active=true){
   if(!Number.isFinite(now))return false;const delta=previous===null?0:now-previous;previous=now;
   if(!active||delta<=0||delta>200){samples=0;sum=0;slow=0;fast=0;return false;}
   sum+=delta;samples++;if(sum<1000)return false;
   average=sum/samples;const seconds=sum/1000;sum=0;samples=0;
   if(selected!=='auto')return false;
   slow=average>24?slow+seconds:0;fast=average<20?fast+seconds:0; // recover at ~50 fps for 4 s (was 55 fps for 8 s: big campuses never got back)
   if(now-lastChange<4000)return false;
   const max=ceiling(),min=Math.min(max,mobile?.65:.8);let next=ratio;
   if(slow>=2)next=Math.max(min,ratio-.15);else if(fast>=4)next=Math.min(max,ratio+.1);
   if(Math.abs(next-ratio)<.01)return false;ratio=next;lastChange=now;changes++;slow=0;fast=0;return true;
  },
  // Sharp when still (user 10-26): the adaptive ratio only applies while something moves; ~0.6 s after the camera, debris and
  // effects settle, the next frames render at the full ceiling so a zoomed-out big campus (KAIST, SNU) is crisp to look at.
  effectiveRatio(now,active){if(active)lastActive=now;return selected==='auto'&&now-lastActive>600?ceiling():ratio;},
  get stats(){return {mode:selected,mobile,pixelRatio:ratio,averageFrameMs:average||null,estimatedFps:average?1000/average:null,resolutionChanges:changes};}
 };
}

// The shadow map belongs to the light, not the viewer. Orbit alone does not
// invalidate it; light coverage, damage, or moving debris do. No stale final pose.
export function createShadowBudget(hz=30){
 let dirty=true,urgent=true,last=-Infinity,previousDynamic=false,revision=-1,updates=0;
 return{
  setRate(value){hz=Math.max(1,value);},invalidate(){dirty=true;urgent=true;},
  update(now,{lightChanged=false,dynamic=false,revision:nextRevision=0}={}){
   if(lightChanged||dynamic)dirty=true;
   if(nextRevision!==revision||previousDynamic&&!dynamic){dirty=true;urgent=true;}
   revision=nextRevision;previousDynamic=dynamic;
   if(!dirty||!urgent&&now-last<1000/hz-.001)return false;
   dirty=false;urgent=false;last=now;updates++;return true;
  },get updates(){return updates;}
 };
}
