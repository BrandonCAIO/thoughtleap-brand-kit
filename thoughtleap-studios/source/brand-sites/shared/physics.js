/** Pure interaction state. Renderers receive an explicit pose, never this clock. */
export const IDLE_SPEED = Math.PI * 2 / 24;
export const STEP = 1 / 120;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const smooth=t=>{const p=clamp(t,0,1);return p*p*(3-2*p);};
export function createMotion(reduced=false){
  return {angle:0,speed:reduced?0:IDLE_SPEED,playing:!reduced,paused:false,reduced,charge:0,launch:-1,
    sphere:{x:0,y:0,vx:0,vy:0,active:false,dragging:false,age:0,returnPhase:'idle',restTime:0,rollAngle:0},bounds:{minX:-.18,maxX:2.65,maxY:2.6}};
}
export function stepMotion(state,dt,contacts=null){
  const h=clamp(dt,0,STEP);
  if(state.reduced||state.paused)return [];
  const events=[],wasLaunching=state.launch>=0;
  if(wasLaunching){
    state.launch+=h;state.angle+=Math.max(state.speed,12)*h;
    if(state.launch>1.8){state.launch=-1;state.charge=0;state.speed=IDLE_SPEED;state.playing=true;events.push('returned');}
  }else if(state.charge>0){
    state.charge=Math.min(1,state.charge+h/.95);state.speed=2+state.charge*16;
  }else if(state.playing){
    state.speed=IDLE_SPEED+(state.speed-IDLE_SPEED)*Math.exp(-h/2.8);
  }
  const b=state.sphere,previousX=b.x;
  if(b.returnPhase==='dwell'){
    if(b.dragging||b.active||b.y>.001||Math.abs(b.vx)>.03||Math.abs(b.vy)>.03){b.returnPhase='idle';b.restTime=0;}
    else if((b.restTime+=h)>=.4){b.returnPhase='rolling';b.active=true;events.push('rolling-home');}
  }
  if(b.returnPhase==='rolling'){
    if(b.dragging||b.y>.001||b.vy>.05){b.returnPhase='idle';b.restTime=0;}
    else {
      const targetVelocity=clamp(-b.x*2.8,-1.1,1.1);
      b.vx+=clamp((targetVelocity-b.vx)*8,-2.4,2.4)*h;
    }
  }
  if(b.active&&!b.dragging){
    b.age+=h;
    // Gravity acts straight down. Horizontal momentum changes only at actual
    // contacts; the sphere is never attracted toward the logo's home position.
    b.vy-=12*h;
  }
  if(contacts&&!wasLaunching){
    const response=contacts.advance(state,h);if(response.hits)events.push('arrow-impact');
  }else{
    if(!wasLaunching&&(state.playing||state.charge>0))state.angle+=state.speed*h;
    if(b.active&&!b.dragging){b.x+=b.vx*h;b.y+=b.vy*h;}
  }
  // Reentry is resolved before the returning arrow becomes visible. It never
  // produces a launch-path impulse while the arrow is away from its hinge.
  if(contacts&&wasLaunching&&(state.launch>=1||state.launch<0))contacts.separate(state);
  state.angle=((state.angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  if(b.returnPhase==='dwell'&&(b.active||b.y>.001||Math.abs(b.vx)>.03||Math.abs(b.vy)>.03)){b.returnPhase='idle';b.restTime=0;}
  if(b.returnPhase==='rolling'&&(b.y>.001||b.vy>.05)){b.returnPhase='idle';b.restTime=0;}
  if(b.y<=.001&&!b.dragging)b.rollAngle+=(b.x-previousX)/.7953;
  if(!b.active||b.dragging)return events;
  if(b.x<=state.bounds.minX&&b.vx<0){b.x=state.bounds.minX;b.vx*=-.35;}
  if(b.x>=state.bounds.maxX&&b.vx>0){b.x=state.bounds.maxX;b.vx*=-.35;}
  if(b.y>=state.bounds.maxY&&b.vy>0){b.y=state.bounds.maxY;b.vy*=-.35;}
  if(b.y<=0){
    b.y=0;
    if(b.vy<0){const speed=-b.vy;b.vy=speed*.48;if(speed>1.2)events.push('impact');if(speed<.8)b.vy=0;}
    // Contact friction belongs to the floor, not to the airborne trajectory.
    if(b.returnPhase!=='rolling')b.vx*=Math.exp(-h*5);
    if(b.returnPhase==='rolling'&&Math.abs(b.x)<.006&&Math.abs(b.vx)<.04){
      const finalX=b.x;if(contacts)contacts.moveSphere(state,0,0,h);else b.x=0;
      b.rollAngle+=(b.x-finalX)/.7953;
      b.vx=0;b.vy=0;b.active=false;b.returnPhase='idle';b.restTime=0;events.push('settled');
    }else if(b.returnPhase!=='rolling'&&Math.abs(b.vy)<.001&&Math.abs(b.vx)<.03){
      b.vx=0;b.active=false;b.restTime=0;b.returnPhase=Math.abs(b.x)>.01?'dwell':'idle';events.push('settled');
    }
  }
  return events;
}
export function pullSphere(state,x,y,contacts=null,dt=1/60){
  const b=state.sphere;b.dragging=true;b.active=false;b.age=0;b.returnPhase='idle';b.restTime=0;
  if(contacts)contacts.moveSphere(state,x,y,dt);
  else {b.x=clamp(x,state.bounds.minX,state.bounds.maxX);b.y=clamp(y,0,state.bounds.maxY);}
}
export function releaseSphere(state,vx=0,vy=0){
  const b=state.sphere;b.dragging=false;b.age=0;b.returnPhase='idle';b.restTime=0;
  if(state.reduced){Object.assign(b,{x:0,y:0,vx:0,vy:0,active:false});return;}
  b.vx=clamp(vx,-5,5);b.vy=clamp(vy,-7,7);b.active=true;
}
export function getPose(state){
  const b=state.sphere;
  let arrowDistance=0,arrowScale=1,heat=state.charge;
  if(state.launch>=0){
    const t=state.launch;
    if(t<.58){arrowDistance=26*Math.pow(t/.58,1.55);heat=1;}
    else if(t<1){arrowDistance=26;arrowScale=0;heat=0;}
    else {arrowDistance=0;arrowScale=smooth((t-1)/.8);heat=0;}
  }
  return {arrowAngle:state.angle,arrowDistance,arrowScale,heat,sphereOffset:[b.x,b.y],sphereScale:[1,1,1],sphereRoll:b.rollAngle};
}

/** Exit an interaction without freezing a launched arrow off-screen. */
export function parkMotion(state){
  state.launch=-1;state.charge=0;state.speed=0;state.playing=false;state.paused=true;
  Object.assign(state.sphere,{x:0,y:0,vx:0,vy:0,active:false,dragging:false,age:0,returnPhase:'idle',restTime:0,rollAngle:0});
}
