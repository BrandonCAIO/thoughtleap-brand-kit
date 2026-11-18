import * as THREE from 'three';
import {createObjectScene} from '../../object-atelier-v4/src/scene/createObjectScene.js';
import {DOT_HOME} from '../../object-atelier-v4/src/scene/precisionGeometry.js';
import {applyFinishPreset,sanitizeSettings} from '../../object-atelier-v4/src/scene/settings.js';
import studiosPreset from '../../object-atelier-v4/presets/double-bevel-dark-stage.json';
import {createMotion,stepMotion,pullSphere,releaseSphere,getPose,parkMotion,STEP,IDLE_SPEED} from './physics.js';
import {createArrowContacts} from './collision.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function settingsForVariant(variant='studios'){
  if(variant==='studios')return sanitizeSettings({...studiosPreset.settings,doubleBevel:false,sideEngraving:true,reflectionScale:3.2,finishPreset:'platinum',faceColor:'#a7afb7',faceRoughness:.018,bevelRoughness:.012,sideRoughness:.018,sideAnisotropy:0});
  if(variant!=='ai')throw new TypeError('Unknown object variant.');
  return sanitizeSettings({...applyFinishPreset(studiosPreset.settings,'platinum'),faceColor:'#a7afb7',background:'ivory',shadowStrength:.18,doubleBevel:false,reflectionEnabled:true,reflectionScale:3.2,reflectionWordmark:'humans',brilliantFlash:false,secondBevelLight:false,motionDuration:30});
}

/** One renderer survives page/explorer reparenting. All interaction is opt-in. */
export async function mountObject(canvas,{variant='studios',onState,onPose,assetBase='/assets/'}={}){
  if(!(canvas instanceof HTMLCanvasElement))throw new TypeError('mountObject requires a canvas.');
  const settings=settingsForVariant(variant),reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const coarse=matchMedia('(pointer: coarse)').matches,timeScale=variant==='ai'?.8:1;
  // This optional instrument moves only the existing studio light field. Keep
  // the preset as its neutral position and leave the companion AI scene alone.
  const light=variant==='studios'?{x:0,y:0,targetX:0,targetY:0,azimuth:settings.lightAzimuth,elevation:settings.lightElevation}:null;
  const original={touchAction:canvas.style.touchAction,tabindex:canvas.getAttribute('tabindex'),role:canvas.getAttribute('role'),label:canvas.getAttribute('aria-label')};
  const cleanup=[];
  let motion=createMotion(reducedQuery.matches),scene=null,contacts=null,gesture=null,holdTimer=0;
  let inspectingEngraving=false;
  let ready=false,disposed=false,interactive=false,inView=true,pageHidden=document.hidden;
  let raf=0,lastTime=0,lastDraw=0,accumulator=0,dirty=true,unitPx=70,lastEvent='loading',lastStateKey='';
  let renderedAngle=motion.angle,lastPoseKey='';
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),screen=new THREE.Vector3();
  const active=()=>motion.playing||motion.charge>0||motion.launch>=0||motion.sphere.active||motion.sphere.returnPhase!=='idle';
  const suspended=()=>pageHidden||!inView;
  const getState=()=>({ready,interactive,inspectingEngraving,engraved:settings.sideEngraving,paused:motion.paused||!active(),reduced:motion.reduced,suspended:suspended(),playing:ready&&!motion.paused&&!motion.reduced&&!suspended()&&active(),charging:motion.charge>0&&motion.launch<0,launching:motion.launch>=0,sphereActive:motion.sphere.active||motion.sphere.dragging||motion.sphere.returnPhase!=='idle',lastEvent});
  function publishPose(state){
    if(typeof onPose!=='function')return;
    state=state||getState();
    const pose={angle:renderedAngle,ready:state.ready,playing:state.playing,paused:state.paused,reduced:state.reduced,suspended:state.suspended};
    const key=JSON.stringify(pose);if(key===lastPoseKey)return;lastPoseKey=key;
    try{onPose(pose);}catch(error){console.error('Object pose listener failed.',error);}
  }
  function emit(event){
    if(event)lastEvent=event;
    const state=getState(),key=JSON.stringify(state);publishPose(state);if(key===lastStateKey)return;lastStateKey=key;
    if(typeof onState==='function'){try{onState(state);}catch(error){console.error('Object state listener failed.',error);}}
    canvas.dispatchEvent(new CustomEvent('objectstatechange',{detail:state}));
  }
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);cleanup.push(()=>target.removeEventListener(type,fn,options));}
  function clearHold(){clearTimeout(holdTimer);holdTimer=0;}
  function cancelGesture(restore=true){
    clearHold();if(!gesture)return;
    const g=gesture;gesture=null;
    try{if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);}catch{}
    if(restore)motion.paused=g.wasPaused;
    if(g.target==='sphere')releaseSphere(motion,0,0);
    else if(g.target==='arrow'){motion.charge=0;motion.speed=IDLE_SPEED;motion.playing=restore?g.wasPlaying:false;}
    dirty=true;emit('interaction-cancelled');
  }
  function project(point,width,height){screen.copy(point).project(scene.camera);return {x:(screen.x*.5+.5)*width,y:(-.5*screen.y+.5)*height};}
  function updateBounds(){
    scene.mark.updateWorldMatrix(true,true);
    const rect=canvas.getBoundingClientRect(),width=rect.width||canvas.clientWidth||800,height=rect.height||canvas.clientHeight||800;
    const home=DOT_HOME.clone().applyMatrix4(scene.mark.matrixWorld),right=new THREE.Vector3(1,0,0).applyQuaternion(scene.camera.quaternion);
    const center=project(home,width,height),reference=project(home.clone().add(right),width,height);
    unitPx=Math.max(1,Math.abs(reference.x-center.x));const radius=unitPx*.7953;
    motion.bounds.minX=Math.min(0,(16+radius-center.x)/unitPx);
    motion.bounds.maxX=Math.max(0,(width-16-radius-center.x)/unitPx);
    motion.bounds.maxY=Math.max(.2,(center.y-radius-18)/unitPx);
  }
  function draw(){
    if(!scene||disposed)return;
    const view=inspectingEngraving?{...settings,framing:4.3,cameraTargetX:.615,cameraTargetY:.609,dotVisible:false}:settings;
    const pose=getPose(motion);
    scene.render({progress:0,settings:view,interactionPose:pose});renderedAngle=pose.arrowAngle;
    updateBounds();dirty=false;publishPose();
  }
  function rebuildContacts(){
    contacts=createArrowContacts({parts:scene.collisionParts,markMatrix:scene.mark.matrixWorld.clone(),cameraQuaternion:scene.camera.quaternion.clone(),sphereRadius:scene.dot.geometry.userData.radius});
  }
  function wake(){if(!disposed&&scene&&!suspended()&&!raf)raf=requestAnimationFrame(frame);}
  const lightMoving=()=>Boolean(light&&(Math.abs(light.targetX-light.x)>.0001||Math.abs(light.targetY-light.y)>.0001));
  function applyLightPosition(){
    settings.lightAzimuth=clamp(light.azimuth+light.x*65,-180,180);
    settings.lightElevation=clamp(light.elevation+light.y*22,-70,80);
  }
  /** Normalized -1..1 offsets; (0,0) restores the original studio lighting. */
  function setLightPosition(x,y=0){
    if(!light||disposed||!ready||!Number.isFinite(x)||!Number.isFinite(y))return false;
    light.targetX=clamp(x,-1,1);light.targetY=clamp(y,-1,1);
    if(motion.reduced){light.x=light.targetX;light.y=light.targetY;applyLightPosition();}
    dirty=true;wake();return true;
  }
  function resize(){
    if(!scene||disposed)return;
    cancelGesture(true);
    const rect=canvas.getBoundingClientRect();scene.resize(Math.max(1,rect.width||canvas.clientWidth||800),Math.max(1,rect.height||canvas.clientHeight||800));
    draw();rebuildContacts();
    const b=motion.sphere;
    if(motion.launch<0){
      const x=clamp(b.x,motion.bounds.minX,motion.bounds.maxX),y=clamp(b.y,0,motion.bounds.maxY);
      if(x!==b.x||y!==b.y)contacts.moveSphere(motion,x,y);
      contacts.separate(motion);
    }
    draw();lastTime=0;accumulator=0;wake();emit();
  }
  function frame(now){
    raf=0;if(disposed||!scene||suspended()){lastTime=0;return;}
    const elapsed=lastTime?Math.min(.05,(now-lastTime)/1000)*timeScale:0;lastTime=now;
    const moving=!motion.reduced&&!motion.paused&&active();
    if(moving){
      accumulator+=elapsed;
      while(accumulator>=STEP){const events=stepMotion(motion,STEP,contacts);accumulator-=STEP;for(const event of events)if(['returned','settled','rolling-home'].includes(event))emit(event);}
    }else accumulator=0;
    const lighting=lightMoving();
    if(lighting){
      const ease=motion.reduced?1:1-Math.exp(-elapsed*12);
      light.x+=(light.targetX-light.x)*ease;light.y+=(light.targetY-light.y)*ease;
      if(!lightMoving()){light.x=light.targetX;light.y=light.targetY;dirty=true;}
      applyLightPosition();
    }
    if(dirty||((moving||lighting)&&now-lastDraw>=1000/(coarse?30:60)-.5)){draw();lastDraw=now;}
    emit();if(moving||lightMoving()||dirty)wake();
  }
  function pause(value=true){
    if(disposed)return;cancelGesture(false);
    motion.paused=Boolean(value)||motion.reduced;
    if(!motion.paused&&!active()){motion.playing=true;motion.speed=IDLE_SPEED;}
    lastTime=0;accumulator=0;dirty=true;emit(motion.paused?'paused':'playing');wake();
  }
  function reset(){
    if(disposed)return;cancelGesture(false);motion=createMotion(reducedQuery.matches);inspectingEngraving=false;accumulator=0;lastTime=0;dirty=true;
    if(scene){resize();contacts?.separate(motion);draw();}emit('reset');wake();
  }
  function inspectEngraving(){
    if(!ready||disposed||!interactive)return;
    cancelGesture(false);motion=createMotion(reducedQuery.matches);motion.angle=79*Math.PI/180;
    motion.paused=true;motion.playing=false;motion.speed=0;inspectingEngraving=true;
    lastTime=0;accumulator=0;resize();emit('engraving-detail');
  }
  function setEngraving(value){
    if(!ready||disposed||variant!=='studios')return;
    cancelGesture(true);settings.sideEngraving=Boolean(value);resize();emit('engraving-changed');
  }
  function spin(){
    if(!ready||disposed)return;cancelGesture(false);motion.paused=false;
    if(motion.reduced){contacts.moveArrow(motion,motion.angle+Math.PI/6);motion.playing=false;motion.speed=0;}
    else {motion.playing=true;motion.speed=10;}
    dirty=true;emit(motion.reduced?'turned':'spinning');wake();
  }
  function bounce(){
    if(!ready||disposed||motion.reduced||inspectingEngraving){emit('motion-reduced');return false;}
    cancelGesture(false);motion.paused=false;pullSphere(motion,motion.sphere.x,Math.min(1.6,motion.bounds.maxY),contacts);releaseSphere(motion);dirty=true;emit('bouncing');wake();return true;
  }
  function setInteractive(value){
    if(disposed||interactive===Boolean(value))return;
    const wasPaused=motion.paused||!active();cancelGesture(false);interactive=Boolean(value);
    canvas.style.touchAction=interactive?'none':original.touchAction;
    canvas.tabIndex=interactive?0:-1;canvas.setAttribute('role',interactive?'application':'img');
    canvas.setAttribute('aria-label',interactive?'Object explorer. Drag the arrow to rotate. Pull and release the sphere. Arrow keys turn, Space pauses, Home resets.':variant==='ai'?'Polished ThoughtLeap arrow and orange sphere.':'Polished ThoughtLeap Studios arrow and orange sphere.');
    if(!interactive){
      if(inspectingEngraving){inspectingEngraving=false;motion.angle=0;}
      parkMotion(motion);motion.paused=wasPaused||motion.reduced;motion.playing=!motion.paused;motion.speed=motion.playing?IDLE_SPEED:0;
    }
    dirty=true;lastTime=0;accumulator=0;emit(interactive?'explorer-opened':'explorer-closed');wake();
  }
  function hit(event){
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    scene.mark.updateWorldMatrix(true,true);raycaster.setFromCamera(ndc,scene.camera);
    const result=raycaster.intersectObjects([scene.dot,...scene.arrow.children],false).find(i=>i.object.visible&&i.object.parent.visible);
    return result?(result.object===scene.dot?'sphere':'arrow'):null;
  }
  function onDown(event){
    if(!interactive||!ready||disposed)return;
    if(event.cancelable)event.preventDefault();
    if(gesture||motion.launch>=0||event.button!==0||event.isPrimary===false)return;
    const target=hit(event)||'empty',now=performance.now();
    gesture={id:event.pointerId,target,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,lastTime:now,ballX:motion.sphere.x,ballY:motion.sphere.y,wasPlaying:motion.playing,wasPaused:motion.paused,moved:false,vx:0,vy:0,angularSpeed:0};
    try{canvas.setPointerCapture(event.pointerId);}catch{gesture=null;return;}
    if(target==='empty')return;
    motion.paused=false;
    if(target==='sphere'){
      Object.assign(motion.sphere,{dragging:true,active:false,returnPhase:'idle',restTime:0,vx:0,vy:0});
    }else{
      motion.playing=false;motion.speed=0;
      if(!motion.reduced)holdTimer=setTimeout(()=>{
        if(!gesture||gesture.id!==event.pointerId||gesture.moved||suspended()||!interactive)return;
        motion.charge=.001;dirty=true;emit('charging');wake();
      },650);
    }
    dirty=true;emit(target==='sphere'?'sphere-held':'arrow-held');wake();
  }
  function onMove(event){
    if(!interactive||!gesture||event.pointerId!==gesture.id)return;
    if(event.cancelable)event.preventDefault();
    const g=gesture;if(g.target==='empty')return;
    const dx=event.clientX-g.startX,dy=event.clientY-g.startY;
    if(Math.hypot(dx,dy)>5){g.moved=true;clearHold();if(g.target==='arrow')motion.charge=0;}
    const now=performance.now(),dt=Math.max(.008,(now-g.lastTime)/1000);
    if(g.target==='sphere'){
      const beforeX=motion.sphere.x,beforeY=motion.sphere.y;
      pullSphere(motion,g.ballX+dx/unitPx*.82,g.ballY-dy/unitPx*.82,contacts,dt);
      g.vx=.55*g.vx+.45*(motion.sphere.x-beforeX)/dt;g.vy=.55*g.vy+.45*(motion.sphere.y-beforeY)/dt;
    }else if(!motion.charge){
      const radians=((event.clientX-g.lastX)-(event.clientY-g.lastY)*.65)/Math.max(200,canvas.clientWidth)*Math.PI*2,previous=motion.angle;
      contacts.moveArrow(motion,motion.angle+radians,dt);motion.playing=false;motion.speed=0;g.angularSpeed=.45*g.angularSpeed+.55*(motion.angle-previous)/dt;
    }
    g.lastX=event.clientX;g.lastY=event.clientY;g.lastTime=now;dirty=true;wake();
  }
  function onUp(event){
    if(!gesture||event.pointerId!==gesture.id)return;
    const g=gesture;clearHold();gesture=null;
    try{if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);}catch{}
    if(g.target==='empty')return;
    const fresh=performance.now()-g.lastTime<100;
    if(g.target==='sphere'){releaseSphere(motion,fresh?g.vx:0,fresh?g.vy:0);emit('sphere-released');}
    else if(motion.charge>.12&&!motion.reduced){motion.launch=0;motion.charge=1;motion.playing=true;emit('launching');}
    else {motion.charge=0;motion.speed=motion.reduced?0:clamp(fresh?g.angularSpeed:0,-12,12);motion.playing=!motion.reduced&&g.moved&&Math.abs(motion.speed)>.35;if(!motion.playing)motion.speed=0;emit(motion.playing?'spinning':'paused');}
    dirty=true;wake();
  }
  function onKey(event){
    if(!interactive||!ready||!['ArrowLeft','ArrowRight',' ','Home'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();cancelGesture(false);
    if(event.key==='Home'){reset();return;}
    if(event.key===' '){pause(!getState().paused);return;}
    contacts.moveArrow(motion,motion.angle+(event.key==='ArrowLeft'?-1:1)*Math.PI/12);motion.playing=false;motion.speed=0;dirty=true;emit('turned');wake();
  }
  function syncVisibility(){
    pageHidden=document.hidden;
    if(suspended()){cancelGesture(true);cancelAnimationFrame(raf);raf=0;}
    lastTime=0;accumulator=0;dirty=true;emit();wake();
  }
  function dispose(){
    if(disposed)return;cancelGesture(false);disposed=true;ready=false;clearHold();cancelAnimationFrame(raf);raf=0;
    for(const fn of cleanup.splice(0))fn();scene?.dispose();scene=null;contacts=null;
    canvas.style.touchAction=original.touchAction;
    for(const [name,value] of [['tabindex',original.tabindex],['role',original.role],['aria-label',original.label]]){if(value===null)canvas.removeAttribute(name);else canvas.setAttribute(name,value);}
    emit('disposed');
  }
  listen(canvas,'pointerdown',onDown);listen(canvas,'pointermove',onMove,{passive:false});listen(canvas,'pointerup',onUp);
  listen(canvas,'pointercancel',event=>{if(gesture?.id===event.pointerId){cancelGesture(true);wake();}});
  listen(canvas,'lostpointercapture',event=>{if(gesture?.id===event.pointerId){cancelGesture(true);wake();}});
  listen(canvas,'contextmenu',event=>{if(interactive&&gesture?.target==='arrow')event.preventDefault();});
  listen(canvas,'keydown',onKey);listen(window,'blur',()=>{cancelGesture(true);wake();});
  listen(document,'visibilitychange',syncVisibility);
  listen(window,'pagehide',event=>{if(event.persisted){pageHidden=true;cancelGesture(true);cancelAnimationFrame(raf);raf=0;emit();}else dispose();});
  listen(window,'pageshow',syncVisibility);
  listen(reducedQuery,'change',()=>{cancelGesture(false);motion=createMotion(reducedQuery.matches);if(light&&motion.reduced){light.x=light.targetX;light.y=light.targetY;applyLightPosition();}lastTime=0;accumulator=0;dirty=true;emit('motion-preference-changed');wake();});
  const resizeObserver=new ResizeObserver(()=>resize());resizeObserver.observe(canvas);cleanup.push(()=>resizeObserver.disconnect());
  if(typeof IntersectionObserver!=='undefined'){
    const observer=new IntersectionObserver(entries=>{inView=entries.some(entry=>entry.isIntersecting);syncVisibility();},{threshold:0});observer.observe(canvas);cleanup.push(()=>observer.disconnect());
  }
  emit();
  try{
    await document.fonts.ready;
    if(disposed)throw new Error('Object mount was cancelled.');
    const created=await createObjectScene(canvas,{assetBase,pixelRatio:Math.min(window.devicePixelRatio||1,1.5)});
    if(disposed){created.dispose();throw new Error('Object mount was cancelled.');}
    scene=created;if(variant==='ai')scene.dot.material.color.set('#E8542B');
    resize();ready=true;emit('ready');wake();
  }catch(error){dispose();throw error;}
  return {setInteractive,pause,reset,dispose,resize,bounce,spin,getState,inspectEngraving,setEngraving,setLightPosition};
}
