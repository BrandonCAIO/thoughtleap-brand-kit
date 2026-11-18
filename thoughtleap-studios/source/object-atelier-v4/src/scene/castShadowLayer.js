import * as THREE from 'three';
import {DOT_HOME,SPINE_POINT,SPINE_AXIS} from './precisionGeometry.js';

/** Camera-facing receiver behind the complete resting spine-rotation envelope.
 * Launch translation is excluded so a departing arrow cannot move the backdrop. */
export function getReceiverPlane(markMatrix,geometries,normal) {
  const axis=SPINE_AXIS.clone().transformDirection(markMatrix);
  const transverse=Math.sqrt(Math.max(0,1-Math.pow(normal.dot(axis),2)));
  const center=DOT_HOME.clone().applyMatrix4(markMatrix);
  let depth=normal.dot(center)-.7953;
  const point=new THREE.Vector3(),delta=new THREE.Vector3(),foot=new THREE.Vector3(),worldFoot=new THREE.Vector3();
  for(const geometry of geometries) {
    const positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i);delta.subVectors(point,SPINE_POINT);
      foot.copy(SPINE_POINT).addScaledVector(SPINE_AXIS,delta.dot(SPINE_AXIS));
      const radius=point.distanceTo(foot);worldFoot.copy(foot).applyMatrix4(markMatrix);
      depth=Math.min(depth,normal.dot(worldFoot)-radius*transverse);
    }
  }
  return new THREE.Vector4(normal.x,normal.y,normal.z,depth-.14);
}

/** A real geometry projection onto a receiver plane, rendered as one union mask.
 * No extra light illuminates the object, and the layer never enters bloom. */
export function createCastShadowLayer(renderer,mark,arrow,dot) {
  const scene=new THREE.Scene(),target=new THREE.WebGLRenderTarget(1,1,{samples:4,depthBuffer:false});
  const material=new THREE.ShaderMaterial({
    uniforms:{receiverPlane:{value:new THREE.Vector4()},lightDirection:{value:new THREE.Vector3()}},
    vertexShader:`uniform vec4 receiverPlane; uniform vec3 lightDirection; varying float casterDistance;
      void main(){
        vec3 world=(modelMatrix*vec4(position,1.0)).xyz;
        casterDistance=dot(receiverPlane.xyz,world)-receiverPlane.w;
        float travel=-casterDistance/dot(receiverPlane.xyz,lightDirection);
        vec3 projected=world+lightDirection*travel;
        gl_Position=projectionMatrix*viewMatrix*vec4(projected,1.0);
      }`,
    fragmentShader:`varying float casterDistance;
      void main(){if(casterDistance<0.0)discard;gl_FragColor=vec4(1.0);}`,
    side:THREE.DoubleSide,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false,
  });
  const sphereProxy=new THREE.Mesh(dot.geometry,material);sphereProxy.matrixAutoUpdate=false;sphereProxy.frustumCulled=false;scene.add(sphereProxy);
  const arrowProxies=[],normal=new THREE.Vector3(),rays=new THREE.Vector3(),clearColor=new THREE.Color(),size=new THREE.Vector2();
  function resize(){renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);}
  function render(camera,keyPosition,{receiverPlane=null}={}) {
    // Guard a grazing/behind-receiver source before any projective division.
    if(receiverPlane)normal.set(receiverPlane.x,receiverPlane.y,receiverPlane.z);
    else camera.getWorldDirection(normal).negate();
    rays.copy(keyPosition).normalize().negate();
    const incidence=-normal.dot(rays);
    if(incidence<=.06)return 0;
    const visibility=THREE.MathUtils.smoothstep(incidence,.06,.18);
    // The shadow-only key keeps the light's screen direction but uses a more
    // frontal angle. This trims cast separation to 30% without relighting metal.
    if(!receiverPlane)rays.addScaledVector(normal,incidence).multiplyScalar(.3).addScaledVector(normal,-incidence).normalize();
    mark.updateWorldMatrix(true,true);
    material.uniforms.receiverPlane.value.copy(receiverPlane||getReceiverPlane(mark.matrixWorld,arrow.children.map(m=>m.geometry),normal));
    material.uniforms.lightDirection.value.copy(rays);
    sphereProxy.matrix.copy(dot.matrixWorld);sphereProxy.visible=dot.visible;
    arrow.children.forEach((source,i)=>{
      if(!arrowProxies[i]){const proxy=new THREE.Mesh(source.geometry,material);proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;arrowProxies[i]=proxy;scene.add(proxy);}
      const proxy=arrowProxies[i];proxy.geometry=source.geometry;proxy.matrix.copy(source.matrixWorld);proxy.visible=arrow.visible&&source.visible;
    });
    const previousTarget=renderer.getRenderTarget(),previousAlpha=renderer.getClearAlpha();renderer.getClearColor(clearColor);
    renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,camera);
    renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,previousAlpha);
    return visibility;
  }
  resize();
  // Proxy geometries are shared with the object and remain owned by its scene.
  return {texture:target.texture,resize,render,texelSize:()=>new THREE.Vector2(1/target.width,1/target.height),dispose(){material.dispose();target.dispose();}};
}
