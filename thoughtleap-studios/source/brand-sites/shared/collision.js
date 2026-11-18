import * as THREE from 'three';
import {DOT_HOME,SPINE_POINT,SPINE_AXIS} from '../../object-atelier-v4/src/scene/precisionGeometry.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const SKIN=.0015,MAX_TRAVEL=.055,MAX_STEPS=320;
const MAX_SPEED=14,MAX_SPIN=14;

/** Exact triangle contact for a rigid sphere and a one-axis arrow hinge.
 * Geometry is copied from the visible meshes, including their local transforms.
 * The sphere has two translation DOFs in the camera plane; the arrow has one
 * rotation DOF. There is no screen-rectangle overlap test or scripted spin. */
export function createArrowContacts({parts,markMatrix,cameraQuaternion,sphereHome=DOT_HOME,spinePoint=SPINE_POINT,spineAxis=SPINE_AXIS,sphereRadius=.7953,arrowMass=2.4}){
  const linear=new THREE.Matrix3().setFromMatrix4(markMatrix);
  const pivot=spinePoint.clone().applyMatrix4(markMatrix);
  const axis=spineAxis.clone().transformDirection(markMatrix);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(cameraQuaternion);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(cameraQuaternion);
  const home=sphereHome.clone().applyMatrix4(markMatrix);
  const records=[];let maxRadius=0,volume=0,moment=0;
  for(const part of parts){
    part.updateMatrix?.();const positions=part.geometry.getAttribute('position');
    const matrix=part.matrix||new THREE.Matrix4();
    for(let i=0;i<positions.count;i+=3){
      const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,i+j).applyMatrix4(matrix).applyMatrix3(linear));
      for(const vertex of vertices)maxRadius=Math.max(maxRadius,vertex.clone().cross(axis).length());
      const [a,b,c]=vertices,v=a.dot(b.clone().cross(c))/6;
      const p=vertices.map(q=>q.clone().addScaledVector(axis,-q.dot(axis)));
      volume+=v;moment+=v*(p.reduce((sum,q)=>sum+q.lengthSq(),0)+p[0].dot(p[1])+p[0].dot(p[2])+p[1].dot(p[2]))/10;
      records.push({vertices,triangle:new THREE.Triangle(),normal:new THREE.Vector3()});
    }
  }
  const inertia=Math.max(.08,Math.abs(moment/volume)*arrowMass),inverseInertia=1/inertia;
  const turn=new THREE.Quaternion(),center=new THREE.Vector3(),nearest=new THREE.Vector3(),candidate=new THREE.Vector3(),delta=new THREE.Vector3(),leverVector=new THREE.Vector3();
  const ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(.736,.482,.474).normalize()),intersection=new THREE.Vector3();
  let lastAngle=NaN;
  function updateTriangles(angle){
    if(angle===lastAngle)return;lastAngle=angle;turn.setFromAxisAngle(axis,angle);
    for(const record of records){
      const target=[record.triangle.a,record.triangle.b,record.triangle.c];
      for(let j=0;j<3;j++)target[j].copy(record.vertices[j]).applyQuaternion(turn).add(pivot);
      record.triangle.getNormal(record.normal);
    }
  }
  function isInside(point){
    ray.origin.copy(point);const distances=[];
    for(const record of records){
      const t=record.triangle;
      if(ray.intersectTriangle(t.a,t.b,t.c,false,intersection)){
        const distance=intersection.distanceTo(point);
        if(distance>1e-7&&!distances.some(d=>Math.abs(d-distance)<1e-6))distances.push(distance);
      }
    }
    return distances.length%2===1;
  }
  function contact(state){
    updateTriangles(state.angle);center.copy(home).addScaledVector(right,state.sphere.x).addScaledVector(up,state.sphere.y);
    let best=Infinity,bestRecord=null;
    for(const record of records){record.triangle.closestPointToPoint(center,candidate);const d=center.distanceToSquared(candidate);if(d<best){best=d;nearest.copy(candidate);bestRecord=record;}}
    const distance=Math.sqrt(best);delta.subVectors(center,nearest);
    const inside=delta.dot(bestRecord.normal)<-1e-7&&isInside(center);
    const normal=inside||distance<1e-8?bestRecord.normal.clone():delta.clone().multiplyScalar(1/distance);
    const depth=inside?sphereRadius+distance:sphereRadius-distance;
    leverVector.subVectors(nearest,pivot);
    const hingeLever=leverVector.clone().cross(normal).dot(axis);
    return {depth,inside,normal,point:nearest.clone(),nx:normal.dot(right),ny:normal.dot(up),lever:hingeLever};
  }
  function withinBounds(state){
    const b=state.sphere,limits=state.bounds;
    b.x=clamp(b.x,limits.minX,limits.maxX);b.y=clamp(b.y,0,limits.maxY);
  }
  const snapshot=state=>({angle:state.angle,x:state.sphere.x,y:state.sphere.y});
  function restore(state,pose){state.angle=pose.angle;state.sphere.x=pose.x;state.sphere.y=pose.y;}
  function impulse(state,c,{held=false}={}){
    const b=state.sphere;
    const denominator=c.nx*c.nx+c.ny*c.ny+c.lever*c.lever*inverseInertia;
    if(denominator<1e-7)return false;
    const angularVelocity=state.playing||state.charge>0||held?state.speed:0;
    const normalVelocity=b.vx*c.nx+b.vy*c.ny-angularVelocity*c.lever;
    if(normalVelocity>=-.025)return false;
    const restitution=Math.abs(normalVelocity)>.6?.42:0;
    const j=Math.min(12,-(1+restitution)*normalVelocity/denominator);
    b.vx=clamp(b.vx+j*c.nx,-MAX_SPEED,MAX_SPEED);b.vy=clamp(b.vy+j*c.ny,-MAX_SPEED,MAX_SPEED);
    state.speed=clamp(angularVelocity-j*c.lever*inverseInertia,-MAX_SPIN,MAX_SPIN);
    if(!state.reduced){
      if(!b.dragging){b.active=true;b.age=0;}
      if(Math.abs(state.speed)>.02)state.playing=true;
    }
    return true;
  }
  function solve(state,{allowImpulse=true,held=false}={}){
    let hit=false;
    for(let iteration=0;iteration<18;iteration++){
      const c=contact(state);
      if(c.depth<=-SKIN*.5)return {safe:true,hit};
      if(allowImpulse&&c.depth>-.003)hit=impulse(state,c,{held})||hit;
      if(c.depth<=0)return {safe:true,hit};
      const denominator=c.nx*c.nx+c.ny*c.ny+c.lever*c.lever*inverseInertia;
      if(denominator<1e-7)return {safe:false,hit};
      const correction=(c.depth+SKIN)*.86/denominator;
      state.sphere.x+=c.nx*correction;state.sphere.y+=c.ny*correction;
      state.angle+=clamp(-c.lever*inverseInertia*correction,-.12,.12);
      withinBounds(state);
    }
    return {safe:contact(state).depth<=.0005,hit};
  }
  function separate(state){
    const result=solve(state,{allowImpulse:false});
    if(!result.safe){state.sphere.x=0;state.sphere.y=0;state.sphere.vx=0;state.sphere.vy=0;state.sphere.active=false;}
    return contact(state).depth<=.0005;
  }
  function sweep(state,dx,dy,da,{dt=1/60,kinematic=false,held=false}={}){
    if(state.launch>=0)return {hits:0,blocked:false};
    if(contact(state).depth>.0005)separate(state);
    let safe=snapshot(state),hits=0,blocked=false;
    const travel=Math.hypot(dx,dy)+maxRadius*Math.abs(da);
    const requested=Math.max(1,Math.ceil(travel/MAX_TRAVEL)),count=Math.min(MAX_STEPS,requested);
    const fraction=count/requested,stepTime=Math.max(.0001,dt)/requested;
    for(let i=0;i<count;i++){
      if(kinematic){state.sphere.x+=dx/requested;state.sphere.y+=dy/requested;state.angle+=da/requested;}
      else{
        if(state.playing||state.charge>0)state.angle+=state.speed*stepTime;
        if(state.sphere.active&&!state.sphere.dragging){state.sphere.x+=state.sphere.vx*stepTime;state.sphere.y+=state.sphere.vy*stepTime;}
      }
      withinBounds(state);
      const result=solve(state,{allowImpulse:!state.reduced,held});hits+=Number(result.hit);
      if(!result.safe){restore(state,safe);state.sphere.vx=0;state.sphere.vy=0;state.speed=0;blocked=true;break;}
      safe=snapshot(state);
    }
    if(state.reduced){state.speed=0;state.sphere.vx=0;state.sphere.vy=0;state.playing=false;}
    return {hits,blocked:blocked||fraction<1};
  }
  function advance(state,dt){
    const b=state.sphere;
    return sweep(state,b.active&&!b.dragging?b.vx*dt:0,b.active&&!b.dragging?b.vy*dt:0,state.playing||state.charge>0?state.speed*dt:0,{dt});
  }
  function moveSphere(state,x,y,dt=1/60){
    const b=state.sphere,dx=clamp(x,state.bounds.minX,state.bounds.maxX)-b.x,dy=clamp(y,0,state.bounds.maxY)-b.y;
    b.vx=clamp(dx/Math.max(.008,dt),-MAX_SPEED,MAX_SPEED);b.vy=clamp(dy/Math.max(.008,dt),-MAX_SPEED,MAX_SPEED);
    return sweep(state,dx,dy,0,{dt,kinematic:true});
  }
  function moveArrow(state,angle,dt=1/60){
    const da=angle-state.angle;state.speed=clamp(da/Math.max(.008,dt),-MAX_SPIN,MAX_SPIN);
    return sweep(state,0,0,da,{dt,kinematic:true,held:true});
  }
  return {advance,moveSphere,moveArrow,separate,contact,clearance:state=>-contact(state).depth,
    info:{triangles:records.length,radius:sphereRadius,inertia,maxRadius,pivot:pivot.toArray(),axis:axis.toArray(),home:home.toArray()}};
}
