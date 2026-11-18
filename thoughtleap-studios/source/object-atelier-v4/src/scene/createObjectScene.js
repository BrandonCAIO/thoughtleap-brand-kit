import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createArrowGeometries, createSphere, inspectArrowGeometry, DOT_HOME, SPINE_POINT, SPINE_AXIS } from './precisionGeometry.js';
import { SETTINGS_DEFAULTS, BACKGROUND_PRESETS, sanitizeSettings } from './settings.js';
import { evaluateReelLaunch } from './reelLaunch.js';
import { evaluateRocketLaunch } from './rocketLaunch.js';
import { createCastShadowLayer, getReceiverPlane } from './castShadowLayer.js';
import { createWordmarkReflector } from './wordmarkReflector.js';
import { createMetalCardReflections, metalCardDescriptors, metalStudioKey, brilliantFlashEnabled } from './metalCardReflections.js';
export { SETTINGS_DEFAULTS, SETTINGS_SCHEMA, FINISH_PRESETS, BACKGROUND_PRESETS, sanitizeSettings, applyFinishPreset } from './settings.js';

const DEG=Math.PI/180,TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>{const p=clamp(v);return p*p*p*(p*(p*6-15)+10);};
const ORIGIN=new THREE.Vector3();

/**
 * Object-only, deterministic studio. Angles in settings are DEGREES; lengths
 * are world units. No RAF, clock, spring integration or DOM controls live here.
 * time is seconds. Explicit progress is a linear sequence phase [0,1] and wins
 * over time. render replaces settings with sanitized defaults + the supplied
 * values, so a reverse seek or preset change cannot inherit earlier frame state.
 * HDR initialization and reflection bakes complete before the Promise resolves.
 */
export async function createObjectScene(canvas,{assetBase='/assets/',pixelRatio=1.5}={}) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
  renderer.setPixelRatio(clamp(Number(pixelRatio)||1.5,1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x0b0d10,0);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(18.18,1,.05,120);
  const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
  let castShadows=null;
  let disposed=false,aspect=1,settings=sanitizeSettings(),geometryKey='',cardKey='',hdr=null,metalTarget=null,enamelTarget=null,metalContextTarget=null;
  const textures=new Set(),materials=new Set();
  const own=m=>{materials.add(m);return m;};
  const face=own(new THREE.MeshPhysicalMaterial({metalness:1,roughness:.065,color:0x32383e,specularIntensity:1}));
  const bevel=own(new THREE.MeshPhysicalMaterial({metalness:1,roughness:.018,color:0xe7edf2,specularIntensity:1}));
  const flank=own(new THREE.MeshPhysicalMaterial({metalness:1,roughness:.34,color:0x9aa3ab,anisotropy:1,anisotropyRotation:0}));
  const cutMetal=own(new THREE.MeshPhysicalMaterial({metalness:1,roughness:.26,color:0x9aa3ab,specularIntensity:1}));
  const enamel=own(new THREE.MeshPhysicalMaterial({color:0xf37021,metalness:0,roughness:.05,clearcoat:1,clearcoatRoughness:.03,ior:1.5,specularIntensity:0,envMapIntensity:1}));
  const thermalGlow=own(new THREE.MeshBasicMaterial({color:0xf37021}));
  const thermalUniform={value:0};
  for(const material of [face,bevel,flank,cutMetal]) {
    material.onBeforeCompile=shader=>{
      shader.uniforms.uThermal=thermalUniform;
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uThermal;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        float reflectedEnergy=mix(0.003,1.0,pow(1.0-clamp(uThermal,0.0,1.0),4.0));
        outgoingLight=(outgoingLight-totalEmissiveRadiance)*reflectedEnergy+totalEmissiveRadiance;
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey=()=> 'atelier-v4-controlled-thermal-reflection';
  }

  const wordmarkReflector=await createWordmarkReflector(face);
  const metalReflections=createMetalCardReflections([face,bevel,flank,cutMetal]);

  // The body turns about the silhouette's tip-to-notch axis, never an arbitrary
  // bounding box center. V4's separate dot is a full sphere with equal axes.
  const mark=new THREE.Group(),arrow=new THREE.Group();mark.add(arrow);scene.add(mark);
  const dot=new THREE.Mesh(createSphere(),enamel);mark.add(dot);
  let geometries=null,collisionGeometries=null;
  const collisionParts=[];
  function updateGeometry(s) {
    const key=`${s.bevelWidth}/${s.thickness}/${s.doubleBevel}/${s.sideEngraving}/${s.engravingDepth}`;if(key===geometryKey)return;
    if(geometries)Object.values(geometries).forEach(g=>g.dispose());
    if(collisionGeometries)Object.values(collisionGeometries).forEach(g=>g.dispose());
    arrow.clear();collisionParts.length=0;geometries=createArrowGeometries(s);
    // Tiny letter pockets do not alter the large sphere contact envelope.
    // Retain the original closed hull for stable, bounded-cost touch physics.
    collisionGeometries=s.sideEngraving?createArrowGeometries({...s,sideEngraving:false}):null;
    for(const [part,material] of [['front',face],['rear',face],['bevel',bevel],['wall',s.sideEngraving?[flank,cutMetal]:flank]]) {
      const mesh=new THREE.Mesh(geometries[part],material);mesh.name=`precision-${part}`;
      mesh.position.copy(SPINE_POINT).multiplyScalar(-1);arrow.add(mesh);
      const contact=collisionGeometries?new THREE.Mesh(collisionGeometries[part],flank):mesh;
      contact.position.copy(mesh.position);collisionParts.push(contact);
    }
    geometryKey=key;
  }
  updateGeometry(settings);

  RectAreaLightUniformsLib.init();
  const softbox=new THREE.RectAreaLight(0xf5f6f8,12,12,1.4);
  const fill=new THREE.RectAreaLight(0xf4f1eb,.8,12,10);fill.position.set(-4,1,10);fill.lookAt(ORIGIN);
  scene.add(softbox,fill);

  // Exact rectangular cards with only a narrow edge diffusion. A reflected
  // straight card stays straight across a flat facet. No normal map, fake AO,
  // painted bevel ramp or surface scratch texture is involved. V4 adds a
  // separate heat-driven postprocess bloom; it is off for the cold object.
  function cardTexture({gradient=false}={}) {
    const c=document.createElement('canvas');c.width=512;c.height=256;
    const ctx=c.getContext('2d'),data=ctx.createImageData(c.width,c.height);
    const smooth=(a,b,x)=>{const p=clamp((x-a)/(b-a));return p*p*(3-2*p);};
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++) {
      const u=(x+.5)/c.width,v=(y+.5)/c.height,i=(y*c.width+x)*4;
      const edge=smooth(0,.012,u)*smooth(0,.012,1-u)*smooth(0,.035,v)*smooth(0,.035,1-v);
      const value=gradient?.24+.76*smooth(0,1,1-u):1;
      data.data[i]=data.data[i+1]=data.data[i+2]=Math.round(255*value);data.data[i+3]=Math.round(255*edge);
    }
    ctx.putImageData(data,0,0);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);return texture;
  }
  const whiteCard=cardTexture(),gradientCard=cardTexture({gradient:true});
  function card(studio,w,h,x,y,z,radiance,{gradient=false}={}) {
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color(...radiance),map:gradient?gradientCard:whiteCard,transparent:true,depthWrite:false,toneMapped:false});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);mesh.lookAt(ORIGIN);studio.add(mesh);
  }
  function releaseStudio(studio){studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
  function addMetalRoom(studio,s) {
    if(s.finishPreset==='platinum') {
      // A broad photographic sweep gives pale polished metal a continuous
      // reflected field; the separate finite cards supply the sharp accents.
      studio.add(new THREE.Mesh(new THREE.SphereGeometry(45,48,32),new THREE.ShaderMaterial({
        side:THREE.BackSide,
        vertexShader:'varying vec3 vRoom; void main(){vRoom=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:'varying vec3 vRoom; void main(){vec3 d=normalize(vRoom);float lift=smoothstep(-.7,.8,d.y*.5+d.z*.65);gl_FragColor=vec4(mix(vec3(.12,.13,.15),vec3(.75,.78,.82),lift),1.0);}'
      })));
    } else if(hdr) {
      studio.add(new THREE.Mesh(new THREE.SphereGeometry(45,48,32),new THREE.MeshBasicMaterial({map:hdr,side:THREE.BackSide,color:new THREE.Color(.045,.045,.045)})));
    }
  }
  function bakeMetal(s) {
    const key=metalStudioKey(s);if(key===cardKey&&metalTarget)return;
    const studio=new THREE.Scene();studio.background=new THREE.Color(.0015,.0018,.0022);
    addMetalRoom(studio,s);
    for(const reflector of metalCardDescriptors(s)){
      card(studio,reflector.width,reflector.height,...reflector.position,reflector.radiance,{gradient:reflector.gradient});
    }
    const next=pmrem.fromScene(studio,0,.1,100,{size:512});releaseStudio(studio);
    const previous=metalTarget;metalTarget=next;
    for(const material of [face,bevel,flank,cutMetal]){material.envMap=next.texture;material.needsUpdate=true;}
    scene.environment=next.texture;previous?.dispose();cardKey=key;
  }
  let metalContextKey='';
  function ensureMetalContext(s) {
    const key=s.finishPreset==='platinum'?'platinum':'original';
    if(metalContextTarget&&key===metalContextKey)return;
    // Only the dim room remains below analytic cards. Its atlas matches the
    // original 512 layout; the sphere retains its separate, unchanged studio.
    const studio=new THREE.Scene();studio.background=new THREE.Color(.0015,.0018,.0022);
    addMetalRoom(studio,s);
    const previous=metalContextTarget;
    metalContextTarget=pmrem.fromScene(studio,0,.1,100,{size:512});releaseStudio(studio);
    previous?.dispose();metalContextKey=key;
    metalReflections.setContext(metalContextTarget.texture);
  }
  function bakeEnamel() {
    const studio=new THREE.Scene();studio.background=new THREE.Color(0x120702);
    studio.add(new THREE.Mesh(new THREE.SphereGeometry(40,32,24),new THREE.MeshBasicMaterial({color:new THREE.Color(.045,.014,.005),side:THREE.BackSide})));
    card(studio,22,.2,-.8,5.2,4.4,[70,66,60]);
    card(studio,1.15,1.15,2.6,7.6,2.2,[110,104,96]);
    enamelTarget=pmrem.fromScene(studio,0,.1,90,{size:512});enamel.envMap=enamelTarget.texture;enamel.needsUpdate=true;releaseStudio(studio);
  }
  let environmentSource='authored studio cards (HDR unavailable)';
  try {
    const base=new URL(assetBase.endsWith('/')?assetBase:assetBase+'/',document.baseURI);
    hdr=await new RGBELoader().setDataType(THREE.HalfFloatType).loadAsync(new URL('studio-small.hdr',base).href);
    hdr.mapping=THREE.UVMapping;textures.add(hdr);environmentSource='Poly Haven studio_small_03 with authored rectangular studio reflectors';
  }catch(error){console.warn('HDR unavailable; authored reflection studio remains active.',error);}
  bakeMetal(settings);bakeEnamel();

  // A short conical exhaust growing along the traveled path. Its tail never
  // reaches backward through the stationary sphere. Both plume surfaces are
  // real 3D meshes, with a smooth alpha taper and no particle history.
  const plumeCanvas=document.createElement('canvas');plumeCanvas.width=2;plumeCanvas.height=256;
  const plumeCtx=plumeCanvas.getContext('2d'),plumePixels=plumeCtx.createImageData(2,256);
  for(let y=0;y<256;y++)for(let x=0;x<2;x++) {
    const i=(y*2+x)*4,alpha=Math.pow(1-y/255,.8);
    plumePixels.data[i]=plumePixels.data[i+1]=plumePixels.data[i+2]=255;plumePixels.data[i+3]=Math.round(255*alpha);
  }
  plumeCtx.putImageData(plumePixels,0,0);
  const plumeMap=new THREE.CanvasTexture(plumeCanvas);plumeMap.colorSpace=THREE.SRGBColorSpace;textures.add(plumeMap);
  const plumeGeometry=new THREE.CylinderGeometry(.105,0,1,24,12,true);
  const plumeMaterial=own(new THREE.MeshBasicMaterial({color:0xf37021,map:plumeMap,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
  const coreMaterial=own(new THREE.MeshBasicMaterial({color:0xf37021,map:plumeMap,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
  const trail=new THREE.Group(),plume=new THREE.Mesh(plumeGeometry,plumeMaterial),core=new THREE.Mesh(plumeGeometry,coreMaterial);
  core.scale.set(.3,1,.3);trail.add(plume,core);mark.add(trail);trail.visible=false;

  // Conventional HDR bloom, with no temporal accumulation. The arrow's own
  // PhysicalMaterial emissive channels supply the orange radiance. Only arrow
  // and exhaust enter the glow pass; the sphere keeps its original illumination.
  const hdrTarget=new THREE.WebGLRenderTarget(800,800,{type:THREE.HalfFloatType,samples:4,depthBuffer:true});
  const composer=new EffectComposer(renderer,hdrTarget);
  const bloomTarget=new THREE.WebGLRenderTarget(800,800,{type:THREE.HalfFloatType,samples:4,depthBuffer:true});
  const bloomComposer=new EffectComposer(renderer,bloomTarget);bloomComposer.renderToScreen=false;
  const renderPass=new RenderPass(scene,camera),bloomPass=new UnrealBloomPass(new THREE.Vector2(800,800),.18,.08,.12),outputPass=new OutputPass();
  for(const tint of bloomPass.bloomTintColors)tint.set(1,1,1);
  bloomComposer.addPass(new RenderPass(scene,camera));bloomComposer.addPass(bloomPass);
  const addBloom=new ShaderPass({
    uniforms:{tDiffuse:{value:null},bloomTexture:{value:null},bloomEnabled:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D tDiffuse; uniform sampler2D bloomTexture; uniform float bloomEnabled; varying vec2 vUv;
      void main(){
        vec4 base=texture2D(tDiffuse,vUv);
        float peak=max(base.r,max(base.g,base.b));
        // Keep core facets saturated while the brighter bloom source supplies
        // the surrounding aura. This controls glow, not the physical shading.
        float haloWeight=mix(1.0,.18,smoothstep(.12,.35,peak));
        gl_FragColor=vec4(base.rgb+texture2D(bloomTexture,vUv).rgb*bloomEnabled*haloWeight,base.a);
      }`,
  });
  // ShaderPass clones plain uniforms and deliberately nulls render-target
  // textures. Bind the live attachment after construction, never through clone.
  addBloom.uniforms.bloomTexture.value=bloomPass.renderTargetsHorizontal[0].texture;
  // Light backdrops are composited after display conversion, keeping white white
  // at every exposure. The foreground and selective glow retain the same studio
  // illumination; this backdrop never enters either reflection environment.
  const backdropPass=new ShaderPass({
    uniforms:{tDiffuse:{value:null},backgroundColor:{value:new THREE.Color(1,1,1)},groundEnabled:{value:0},groundPlane:{value:new THREE.Vector4()},groundCenter:{value:new THREE.Vector3()},cameraWorld:{value:new THREE.Matrix4()},inverseProjection:{value:new THREE.Matrix4()},gradientEnabled:{value:0},gradientTop:{value:new THREE.Color()},gradientMiddle:{value:new THREE.Color()},gradientBottom:{value:new THREE.Color()},shadowMap:{value:null},shadowTexel:{value:new THREE.Vector2(1,1)},shadowStrength:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D tDiffuse; uniform vec3 backgroundColor; uniform float groundEnabled; uniform vec4 groundPlane; uniform vec3 groundCenter; uniform mat4 cameraWorld; uniform mat4 inverseProjection; uniform float gradientEnabled; uniform vec3 gradientTop; uniform vec3 gradientMiddle; uniform vec3 gradientBottom; uniform sampler2D shadowMap; uniform vec2 shadowTexel; uniform float shadowStrength; varying vec2 vUv;
      void main(){
        vec4 foreground=texture2D(tDiffuse,vUv);
        // RGB includes the independent glow even where the object alpha is zero.
        // Additive exhaust can exceed alpha 1 in the HDR buffer. Coverage
        // must stay bounded so it can never subtract the light backdrop.
        float coverage=clamp(foreground.a,0.0,1.0);
        float shadow=0.0;
        if(shadowStrength>0.0){
          // A narrow, one-pixel penumbra preserves the projected hard silhouette.
          shadow=texture2D(shadowMap,vUv).r*.5;
          shadow+=texture2D(shadowMap,vUv+vec2(shadowTexel.x,0.0)).r*.125;
          shadow+=texture2D(shadowMap,vUv-vec2(shadowTexel.x,0.0)).r*.125;
          shadow+=texture2D(shadowMap,vUv+vec2(0.0,shadowTexel.y)).r*.125;
          shadow+=texture2D(shadowMap,vUv-vec2(0.0,shadowTexel.y)).r*.125;
        }
        vec3 background=backgroundColor;
        if(groundEnabled>0.5){
          // A fixed world-space floor. Camera rays and cast geometry meet the
          // same plane; orbiting never turns it into a camera-facing cutout.
          vec4 farPoint=cameraWorld*inverseProjection*vec4(vUv*2.0-1.0,1.0,1.0);
          vec3 origin=cameraWorld[3].xyz;
          vec3 ray=normalize(farPoint.xyz/farPoint.w-origin);
          float incidence=dot(groundPlane.xyz,ray);
          if(incidence<-.001){
            float travel=(groundPlane.w-dot(groundPlane.xyz,origin))/incidence;
            if(travel>0.0){
              vec3 delta=origin+ray*travel-groundCenter;
              float pool=exp(-dot(delta,delta)/18.0);
              // The pool gently fades into the seamless ink cyclorama. Its
              // frame-edge falloff also keeps surrounding letterboxing ink.
              float edge=smoothstep(0.0,.08,vUv.x)*smoothstep(0.0,.08,1.0-vUv.x)*smoothstep(0.0,.08,vUv.y)*smoothstep(0.0,.08,1.0-vUv.y);
              background=mix(backgroundColor,vec3(14.0,27.0,43.0)/255.0,pool*edge);
            }
          }
        }else if(gradientEnabled>0.5){
          // Screen-space receiver: night at the top, ocean blue below. The two
          // smooth ramps have zero-slope endpoints and no visible stop seams.
          float depth=1.0-vUv.y;
          background=mix(gradientTop,gradientMiddle,smoothstep(0.0,.72,depth));
          background=mix(background,gradientBottom,smoothstep(.38,1.0,depth));
        }
        vec3 backdrop=background*(1.0-clamp(shadow*shadowStrength,0.0,1.0));
        if(gradientEnabled>0.5||groundEnabled>0.5){
          // Stable interleaved sub-LSB dither prevents display quantization bands.
          // Applied only to uncovered backdrop; no temporal noise or object tint.
          float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
          backdrop=clamp(backdrop+vec3((noise-.5)/255.0),0.0,1.0);
        }
        gl_FragColor=vec4(foreground.rgb+backdrop*(1.0-coverage),1.0);
      }`,
  });
  backdropPass.enabled=false;
  composer.addPass(renderPass);composer.addPass(addBloom);composer.addPass(outputPass);composer.addPass(backdropPass);
  const hotOrange=new THREE.Color(0xf37021),inkBackground=new THREE.Color(0x0b0d10),blackBackground=new THREE.Color(0x000000),backdropColor=new THREE.Color();

  // A shallow presentation floor is fixed in world space, independent of view.
  const groundNormal=new THREE.Vector3(0,Math.cos(20*DEG),Math.sin(20*DEG)),groundPlane=new THREE.Vector4(),groundCenter=new THREE.Vector3();
  const target=new THREE.Vector3(),cameraOffset=new THREE.Vector3(),lightOffset=new THREE.Vector3();
  const axisY=new THREE.Vector3(0,1,0),objectTurn=new THREE.Quaternion(),basePose=new THREE.Quaternion();
  const launchDirection=SPINE_AXIS.clone().add(new THREE.Vector3(0,0,-.65)).normalize();
  const envRotation=new THREE.Euler(0,0,0,'YXZ');
  function spherical(out,distance,azimuth,elevation) {
    const a=azimuth*DEG,e=elevation*DEG;return out.set(Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)).multiplyScalar(distance);
  }
  function resize(width,height) {
    if(disposed)return;
    const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);aspect=w/h;
    renderer.setSize(w,h,false);camera.aspect=aspect;
    composer.setSize(w,h);
    bloomComposer.setSize(w,h);
    castShadows?.resize();
  }

  function render({time=0,progress,settings:input={},interactionPose=null}={}) {
    if(disposed)return;
    settings=sanitizeSettings(input);const s=settings;
    const seconds=Number.isFinite(time)?Math.max(0,time):0;
    let phase=Number.isFinite(progress)?clamp(progress):seconds/s.motionDuration;
    if(!Number.isFinite(progress))phase=s.motionLoop?phase-Math.floor(phase):clamp(phase);
    const reflectionStudy=s.motionPreset==='reflectionStudy';
    const brilliantFlash=brilliantFlashEnabled(s);
    const moving=s.motionPreset!=='still',wave=moving?Math.sin(phase*TAU):0;
    const rocket=s.motionPreset==='rocketLaunch'?evaluateRocketLaunch(phase,s):null;
    // Explicit live pose is optional. Deterministic Remotion calls omit it.
    const interactionHeat=Number.isFinite(interactionPose?.heat)?clamp(interactionPose.heat):0;
    const heatSource=rocket||(interactionHeat>0?{heat:interactionHeat,heatEnergy:interactionHeat*1.4,trail:0}:null);
    thermalUniform.value=heatSource?.heat||0;
    // A reflection study changes only the explicit spine angle. Legacy imported
    // motion amounts and hidden camera/light travel cannot disturb the study.
    const cameraTravel=reflectionStudy?0:wave*s.cameraMotion,lightTravel=reflectionStudy?0:wave*s.lightMotion;
    wordmarkReflector.update(reflectionStudy&&s.reflectionEnabled,s.reflectionStrength,s.reflectionScale,s.reflectionWordmark);
    updateGeometry(s);bakeMetal(s);
    if(reflectionStudy)ensureMetalContext(s);
    metalReflections.update(reflectionStudy,s);

    face.color.set(s.faceColor);face.roughness=s.faceRoughness;face.metalness=s.metalness;
    bevel.color.set(0xe7edf2);bevel.roughness=s.bevelRoughness;bevel.metalness=s.metalness;
    flank.color.set(0x9aa3ab);
    flank.roughness=s.sideRoughness;flank.anisotropy=s.sideAnisotropy;flank.metalness=s.metalness;
    face.envMapIntensity=s.environmentIntensity;
    bevel.envMapIntensity=s.environmentIntensity*(1.9/1.55);
    flank.envMapIntensity=s.environmentIntensity*(.95/1.55);
    cutMetal.color.copy(flank.color);cutMetal.metalness=s.metalness;
    cutMetal.roughness=Math.max(.26,s.sideRoughness);cutMetal.envMapIntensity=flank.envMapIntensity;
    for(const material of [face,bevel,flank,cutMetal]){material.emissive.set(0x000000);material.emissiveIntensity=0;}
    if(heatSource) {
      const heat=heatSource.heat,energy=heatSource.heatEnergy;
      face.color.lerp(hotOrange,heat);bevel.color.lerp(hotOrange,heat);flank.color.lerp(hotOrange,heat);cutMetal.color.lerp(hotOrange,heat);
      for(const [material,emission] of [[face,.82],[bevel,1.08],[flank,.56],[cutMetal,.56]]) {
        material.emissive.copy(hotOrange);material.emissiveIntensity=emission*energy;
        material.envMapIntensity*=1-.93*heat;
        material.metalness=THREE.MathUtils.lerp(s.metalness,.72,heat);
      }
    }
    renderer.toneMappingExposure=s.exposure;

    // The field and physical area light travel together, independently of both
    // camera and object. The enamel keeps its own controlled strip environment.
    const lightAz=s.lightAzimuth+lightTravel;
    envRotation.set(-(s.lightElevation-32)*DEG,lightAz*DEG,0,'YXZ');
    face.envMapRotation.copy(envRotation);bevel.envMapRotation.copy(envRotation);flank.envMapRotation.copy(envRotation);cutMetal.envMapRotation.copy(envRotation);
    spherical(lightOffset,10,lightAz,s.lightElevation);softbox.position.copy(lightOffset);softbox.lookAt(ORIGIN);
    softbox.width=s.lightWidth;softbox.height=s.lightHeight;softbox.intensity=s.lightIntensity;
    enamel.envMapRotation.set(0,lightTravel*.12*DEG,0);

    mark.position.set(0,0,0);mark.scale.setScalar(1);
    basePose.setFromEuler(new THREE.Euler(s.pitch*DEG,s.yaw*DEG,s.roll*DEG,'YXZ'));
    mark.quaternion.copy(basePose);
    if(s.motionPreset==='turntable') {
      objectTurn.setFromAxisAngle(axisY,phase*TAU*s.motionAmount);mark.quaternion.premultiply(objectTurn);
    }
    arrow.visible=s.arrowVisible;dot.visible=s.dotVisible;
    arrow.position.copy(SPINE_POINT);arrow.quaternion.identity();arrow.scale.setScalar(1);
    dot.position.copy(DOT_HOME);dot.rotation.set(.14,0,0);dot.scale.setScalar(1);
    if(s.motionPreset==='spineRoll')arrow.quaternion.setFromAxisAngle(SPINE_AXIS,phase*TAU*s.motionAmount);
    if(reflectionStudy)arrow.quaternion.setFromAxisAngle(SPINE_AXIS,s.spineAngle*DEG+phase*TAU);
    if(s.motionPreset==='reveal') {
      const ap=ease((phase-.18)/.7),dp=ease(phase/.44);
      arrow.position.x-=6.2*(1-ap);arrow.position.y+=.6*(1-ap);arrow.position.z-=.45*(1-ap);
      arrow.quaternion.setFromAxisAngle(SPINE_AXIS,TAU*2*(1-ap)*s.motionAmount);
      dot.position.y+=5.5*(1-dp);dot.position.z-=.15*(1-dp);
    }
    if(s.motionPreset==='reelLaunch') {
      const opening=evaluateReelLaunch(phase,s.motionAmount);
      arrow.quaternion.setFromAxisAngle(SPINE_AXIS,opening.angle);
      arrow.position.addScaledVector(launchDirection,opening.distance);
    }
    trail.visible=Boolean(rocket&&s.arrowVisible&&rocket.trail>.001);
    if(rocket) {
      arrow.quaternion.setFromAxisAngle(SPINE_AXIS,rocket.angle);
      arrow.position.addScaledVector(launchDirection,rocket.distance);
      trail.quaternion.setFromUnitVectors(axisY,launchDirection);
      trail.position.copy(arrow.position).addScaledVector(launchDirection,-rocket.trailLength/2-.04);
      trail.scale.set(1,rocket.trailLength,1);
      plumeMaterial.opacity=clamp(rocket.trail*.54);coreMaterial.opacity=clamp(rocket.trail*.86);
      plumeMaterial.color.copy(hotOrange).multiplyScalar(.85+rocket.trail*.15);
      coreMaterial.color.copy(hotOrange).multiplyScalar(1.3+rocket.trail*.3);
    }

    target.set(s.cameraTargetX,s.cameraTargetY,0);
    spherical(cameraOffset,s.cameraDistance,s.cameraAzimuth+cameraTravel,s.cameraElevation);
    camera.position.copy(target).add(cameraOffset);camera.lookAt(target);
    // Fixed long-lens reference keeps distance and framing independently useful:
    // distance changes perspective; framing acts like a crop/lens multiplier.
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(2.85*Math.max(1,1/aspect)/18));
    camera.zoom=s.framing;camera.updateProjectionMatrix();camera.updateMatrixWorld();
    if(interactionPose){
      if(Number.isFinite(interactionPose.arrowAngle))arrow.quaternion.setFromAxisAngle(SPINE_AXIS,interactionPose.arrowAngle);
      if(Number.isFinite(interactionPose.arrowDistance))arrow.position.addScaledVector(launchDirection,interactionPose.arrowDistance);
      if(Number.isFinite(interactionPose.arrowScale))arrow.scale.setScalar(clamp(interactionPose.arrowScale,0,1));
      const offset=interactionPose.sphereOffset;
      if(Array.isArray(offset)&&offset.length>=2&&offset.every(Number.isFinite)){
        mark.updateWorldMatrix(true,false);
        const world=dot.position.clone().applyMatrix4(mark.matrixWorld);
        world.add(new THREE.Vector3(offset[0],offset[1],0).applyQuaternion(camera.quaternion));
        dot.position.copy(mark.worldToLocal(world));
      }
      if(Number.isFinite(interactionPose.sphereRoll)){
        const rollAxis=new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion).applyQuaternion(mark.quaternion.clone().invert());
        dot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(rollAxis,-interactionPose.sphereRoll));
      }
      // The interactive sphere remains rigid: no squash or stretch override.
    }
    const lightBackdrop=s.background!=='dark';
    const backgroundPreset=BACKGROUND_PRESETS[s.background];
    backdropColor.set(backgroundPreset.color);
    backdropPass.enabled=lightBackdrop;
    backdropPass.uniforms.backgroundColor.value.copy(backdropColor).convertLinearToSRGB();
    backdropPass.uniforms.groundEnabled.value=backgroundPreset.ground?1:0;
    if(backgroundPreset.ground){
      mark.updateWorldMatrix(true,true);
      groundPlane.copy(getReceiverPlane(mark.matrixWorld,Object.values(collisionGeometries||geometries),groundNormal));
      groundPlane.w+=.06; // .08wu minimum clearance instead of legacy .14wu.
      if(interactionPose)groundCenter.copy(DOT_HOME).applyMatrix4(mark.matrixWorld);
      else dot.getWorldPosition(groundCenter);
      groundCenter.addScaledVector(groundNormal,groundPlane.w-groundNormal.dot(groundCenter));
      backdropPass.uniforms.groundPlane.value.copy(groundPlane);
      backdropPass.uniforms.groundCenter.value.copy(groundCenter);
      backdropPass.uniforms.cameraWorld.value.copy(camera.matrixWorld);
      backdropPass.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    }
    backdropPass.uniforms.gradientEnabled.value=backgroundPreset.gradient?1:0;
    if(backgroundPreset.gradient){
      for(const [key,hex] of Object.entries(backgroundPreset.gradient)){
        const uniform='gradient'+key[0].toUpperCase()+key.slice(1);
        backdropPass.uniforms[uniform].value.set(hex).convertLinearToSRGB();
      }
    }
    renderer.setClearColor(lightBackdrop?0x000000:0x0b0d10,0);
    backdropPass.uniforms.shadowStrength.value=0;
    const groundCameraVisible=!backgroundPreset.ground||groundNormal.dot(camera.position)>groundPlane.w+.001;
    if(lightBackdrop&&s.shadowStrength>0&&groundCameraVisible){
      if(!castShadows)castShadows=createCastShadowLayer(renderer,mark,arrow,dot);
      const visibility=castShadows.render(camera,softbox.position,backgroundPreset.ground?{receiverPlane:groundPlane}:undefined);
      backdropPass.uniforms.shadowMap.value=castShadows.texture;
      backdropPass.uniforms.shadowTexel.value.copy(castShadows.texelSize());
      backdropPass.uniforms.shadowStrength.value=s.shadowStrength*visibility*Math.min(1,s.lightIntensity/12);
    }
    scene.background=lightBackdrop?null:((heatSource||brilliantFlash)?inkBackground:null);
    addBloom.uniforms.bloomEnabled.value=0;
    if(heatSource) {
      bloomPass.threshold=.12;bloomPass.radius=.08;
      bloomPass.compositeMaterial.uniforms.bloomFactors.value=[1,.8,.6,.4,.2];
      bloomPass.strength=.09*heatSource.heatEnergy+.035*heatSource.trail;
      addBloom.uniforms.bloomEnabled.value=bloomPass.strength>.001?1:0;
      if(bloomPass.strength>.001) {
        const dotVisibility=dot.visible;dot.visible=false;scene.background=blackBackground;
        const originalMaterials=arrow.children.map(mesh=>mesh.material);
        thermalGlow.color.copy(hotOrange).multiplyScalar(2.2*heatSource.heatEnergy);
        arrow.children.forEach(mesh=>{mesh.material=thermalGlow;});
        bloomComposer.render(0);
        arrow.children.forEach((mesh,i)=>{mesh.material=originalMaterials[i];});
        dot.visible=dotVisibility;scene.background=lightBackdrop?null:inkBackground;
      }
      composer.render(0);
    }else if(brilliantFlash){
      // Local optical bloom from the compact emitter's actual reflected image.
      // The separate sphere and reflected typography never enter this mask.
      bloomPass.threshold=4;bloomPass.radius=0;bloomPass.strength=.004;
      bloomPass.compositeMaterial.uniforms.bloomFactors.value=[1,.3,.07,0,0];
      addBloom.uniforms.bloomEnabled.value=1;
      const dotVisibility=dot.visible;dot.visible=false;scene.background=blackBackground;
      metalReflections.setGlintExtraction(true);
      try{bloomComposer.render(0);}finally{
        metalReflections.setGlintExtraction(false);
        dot.visible=dotVisibility;scene.background=lightBackdrop?null:inkBackground;
      }
      composer.render(0);
    }else if(lightBackdrop)composer.render(0);
    else renderer.render(scene,camera);
    return {phase,settings:s,rocket};
  }

  function inspectGeometry(){return inspectArrowGeometry(geometries);}
  function dispose() {
    if(disposed)return;disposed=true;
    Object.values(geometries).forEach(g=>g.dispose());
    if(collisionGeometries)Object.values(collisionGeometries).forEach(g=>g.dispose());
    collisionParts.length=0;dot.geometry.dispose();plumeGeometry.dispose();
    materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());castShadows?.dispose();wordmarkReflector.dispose();
    metalTarget?.dispose();metalContextTarget?.dispose();enamelTarget?.dispose();bloomPass.dispose();addBloom.dispose();outputPass.dispose();backdropPass.dispose();bloomComposer.dispose();composer.dispose();pmrem.dispose();renderer.dispose();renderer.forceContextLoss();
  }
  resize(canvas.clientWidth||800,canvas.clientHeight||800);render({settings:SETTINGS_DEFAULTS});
  return {resize,render,dispose,inspectGeometry,renderer,scene,camera,mark,arrow,dot,trail,composer,environmentSource,collisionParts};
}
