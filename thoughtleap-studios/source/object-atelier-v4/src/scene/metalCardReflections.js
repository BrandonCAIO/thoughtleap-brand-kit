import * as THREE from 'three';

/** Single source of the existing authored metal studio. Position, dimensions,
 * radiance, and gradient direction match the original PMREM scene exactly. */
function flashWidth(settings){
  return settings.motionPreset==='reflectionStudy'&&Number.isFinite(settings.polishFlashWidth)?settings.polishFlashWidth:1;
}

export function brilliantFlashEnabled(settings){
  return settings.motionPreset==='reflectionStudy'&&settings.brilliantFlash===true;
}

export function metalStudioKey(settings){
  return `${settings.lightWidth}/${settings.lightHeight}/${settings.lightIntensity}/${flashWidth(settings)}/${brilliantFlashEnabled(settings)}/${brilliantFlashEnabled(settings)&&settings.secondBevelLight===true}/${settings.finishPreset==='platinum'}`;
}

export function metalCardDescriptors(settings) {
  const power=settings.lightIntensity/12;
  const cards=[
    [settings.lightWidth,settings.lightHeight,0,5.3,8.5,[36,36.7,38],false,true],
    [14,.6,7,4.4,4.5,[13,13.4,14],false,true],
    [12,.4,-6.7,4.8,4.6,[7,7.3,7.8],false,true],
    [18,2.6*flashWidth(settings),-7.8,8,3.2,[12,12.3,12.8],false,true],
    [9,14,7,-4.8,5.5,[3.4,3.5,3.7],true,true],
    [19,8,-4.5,1.5,12,[2.0,2.04,2.1],true,false],
    [17,10,4,-.3,-12,[6,6.1,6.3],true,false],
    [12,2.5,-.5,-5.2,-8,[4.2,4.3,4.5],false,false],
  ].map(([width,height,x,y,z,radiance,gradient,key])=>({width,height,position:[x,y,z],radiance:radiance.map(v=>v*(key?power:1)),gradient}));
  if(brilliantFlashEnabled(settings)){
    // A compact fixed emitter replaces the long bench. Alignment is authored
    // for the upper bevel at 36deg spine rotation with the 60wu camera preset.
    // Its world-space direction was transformed into the existing studio's
    // default rotation; subsequent light/camera edits change the encounter.
    // Pale polished metal gets a readable reflected field between the accent
    // encounters. Compact flash emitters below keep their authored radiance.
    const platinum=settings.finishPreset==='platinum';
    for(let i=0;i<cards.length;i++)cards[i].radiance=cards[i].radiance.map(v=>v*(platinum?(i<5?.08:.35):(i<5?.003:.025)));
    cards[3]={width:.7,height:.7,position:[2.202959890197653,-.925617990461784,9.710315071153351],radiance:[90,91.5,94].map(v=>v*power),gradient:false};
    if(settings.secondBevelLight===true){
      // A second fixed studio emitter, aligned with the outer precision cut at
      // 55deg. It never follows the object or uses an animation-phase gate.
      // Independent of geometry so single/double bevels can share exact lighting.
      cards[2]={width:.4,height:.5,position:[4.003681993262637,-.4705375660096845,9.1514547966866],radiance:[90,91.5,94].map(v=>v*power),gradient:false};
    }
  }
  return cards;
}

const declarations=`
  uniform sampler2D uSharpStudioContext;
  uniform vec3 uStudioCenter[8],uStudioU[8],uStudioV[8],uStudioRadiance[8];
  uniform vec2 uStudioSize[8];
  uniform float uStudioGradient[8];
`;

const functions=`
#if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
  vec3 sampleAnalyticStudio(vec3 direction,float surfaceRoughness,vec3 context){
    float distances[8];
    float coverage[8];
    vec3 colors[8];
    for(int i=0;i<8;i++){
      vec3 planeNormal=cross(uStudioU[i],uStudioV[i]);
      float denominator=dot(direction,planeNormal);
      float safeDenominator=denominator<0.0?min(denominator,-0.00001):max(denominator,0.00001);
      float distanceToCard=dot(uStudioCenter[i],planeNormal)/safeDenominator;
      vec3 hit=direction*distanceToCard-uStudioCenter[i];
      vec2 position=vec2(dot(hit,uStudioU[i]),dot(hit,uStudioV[i]));
      // Screen-space AA prevents a sharp emitter edge crawling between pixels.
      // A continuous angular footprint broadens it as the finish grows rough.
      vec2 footprint=max(fwidth(position)*0.65,vec2(0.00001));
      footprint+=vec2(2.0*surfaceRoughness*surfaceRoughness*abs(distanceToCard));
      vec2 edge=uStudioSize[i]*0.5-abs(position);
      vec2 edgeCoverage=smoothstep(-footprint,footprint,edge);
      // Near a plane's horizon, projected derivatives diverge. A finite card
      // cannot be hit beyond its corner radius; reject that remote footprint
      // before it can leak a line of coverage back across the object.
      float cornerRadius=sqrt(dot(uStudioCenter[i],uStudioCenter[i])+dot(uStudioSize[i],uStudioSize[i])*0.25);
      float visible=denominator< -0.00001&&distanceToCard>0.0&&distanceToCard<cornerRadius*1.1?1.0:0.0;
      coverage[i]=edgeCoverage.x*edgeCoverage.y*visible;
      distances[i]=distanceToCard;
      float u=clamp(position.x/uStudioSize[i].x+0.5,0.0,1.0);
      float gradient=mix(1.0,0.24+0.76*smoothstep(0.0,1.0,1.0-u),uStudioGradient[i]);
      // Original card pixels are sRGB; convert that authored gradient to
      // linear radiance exactly as the existing CanvasTexture sampler does.
      gradient=pow((gradient+0.055)/1.055,2.4); // gradient is always >= .24
      colors[i]=uStudioRadiance[i]*gradient;
    }
    // Front-to-back opacity, without relying on mesh sorting or adding the
    // same cards twice. Fractional edge coverage reveals the farther emitters.
    vec3 radiance=vec3(0.0);
    float contextVisibility=1.0;
    for(int i=0;i<8;i++){
      float visibility=coverage[i];
      contextVisibility*=1.0-coverage[i];
      for(int j=0;j<8;j++){
        if(distances[j]<distances[i]||(distances[j]==distances[i]&&j<i))visibility*=1.0-coverage[j];
      }
      radiance+=colors[i]*visibility;
    }
    return radiance+context*contextVisibility;
  }
  vec3 getSharpStudioRadiance(vec3 viewDir,vec3 surfaceNormal,float brdfRoughness,float samplingRoughness){
    vec3 original=getIBLRadiance(viewDir,surfaceNormal,brdfRoughness);
    float sharpWeight=1.0-smoothstep(0.025,0.12,samplingRoughness);
    if(sharpWeight<=0.0)return original;
    // Same origin-at-infinity convention as the existing environment. Only
    // the independent wordmark uses finite, per-surface parallax.
    vec3 ray=reflect(-viewDir,surfaceNormal);
    ray=normalize(mix(ray,surfaceNormal,samplingRoughness*samplingRoughness));
    ray=envMapRotation*inverseTransformDirection(ray,viewMatrix);
    float contextFloor=exp2(-0.5*CUBEUV_MAX_MIP)/1.16;
    vec3 context=textureCubeUV(uSharpStudioContext,ray,max(samplingRoughness,contextFloor)).rgb;
    vec3 sharp=sampleAnalyticStudio(ray,samplingRoughness,context)*envMapIntensity;
    return mix(original,sharp,sharpWeight);
  }
  #ifdef USE_ANISOTROPY
    vec3 getSharpStudioAnisotropyRadiance(vec3 viewDir,vec3 surfaceNormal,float brdfRoughness,vec3 bitangent,float anisotropy,float samplingRoughness){
      if(samplingRoughness>=0.12)return getIBLAnisotropyRadiance(viewDir,surfaceNormal,brdfRoughness,bitangent,anisotropy);
      vec3 bentNormal=normalize(cross(cross(bitangent,viewDir),bitangent));
      bentNormal=normalize(mix(bentNormal,surfaceNormal,pow2(pow2(1.0-anisotropy*(1.0-brdfRoughness)))));
      return getSharpStudioRadiance(viewDir,bentNormal,brdfRoughness,samplingRoughness);
    }
  #endif
#endif
`;

/** Opt-in IBL radiance replacement. GGX/LTC equations, material.roughness, DFG,
 * multiscattering, diffuse IBL, and the wordmark's own response stay untouched.
 * The separate brilliant-flash variant flags broad direct light off the metal.
 * All materials share one set of studio uniforms, including any future facets. */
export function createMetalCardReflections(materials) {
  const uniforms={
    uSharpStudioContext:{value:null},
    uStudioDirectScale:{value:1},
    uStudioGlintExtraction:{value:0},
    uStudioSecondaryAccent:{value:0},
    uStudioCenter:{value:Array.from({length:8},()=>new THREE.Vector3())},
    uStudioU:{value:Array.from({length:8},()=>new THREE.Vector3())},
    uStudioV:{value:Array.from({length:8},()=>new THREE.Vector3())},
    uStudioRadiance:{value:Array.from({length:8},()=>new THREE.Vector3())},
    uStudioSize:{value:Array.from({length:8},()=>new THREE.Vector2())},
    uStudioGradient:{value:new Float32Array(8)},
  };
  let enabled=false,brilliant=false,studioKey='';
  for(const material of materials){
    const originalCompile=material.onBeforeCompile,originalKey=material.customProgramCacheKey;
    material.onBeforeCompile=(shader,renderer)=>{
      originalCompile.call(material,shader,renderer);
      if(!enabled)return;
      Object.assign(shader.uniforms,uniforms);
      const glintDeclarations=brilliant?'uniform float uStudioDirectScale,uStudioGlintExtraction,uStudioSecondaryAccent; vec3 studioAccentRadiance=vec3(0.0);\n':'';
      const studioFunctions=brilliant?functions
        .replace('radiance+=colors[i]*visibility;','radiance+=colors[i]*visibility; if(i==3||(i==2&&uStudioSecondaryAccent>0.5))studioAccentRadiance+=colors[i]*visibility;')
        .replace('return mix(original,sharp,sharpWeight);','studioAccentRadiance*=envMapIntensity*sharpWeight; return mix(original,sharp,sharpWeight);'):functions;
      shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',declarations+glintDeclarations+THREE.ShaderChunk.envmap_physical_pars_fragment+studioFunctions);
      const maps=THREE.ShaderChunk.lights_fragment_maps
        .replace('getIBLRadiance( geometryViewDir, geometryNormal, material.roughness )','getSharpStudioRadiance( geometryViewDir, geometryNormal, material.roughness, min(roughnessFactor+geometryRoughness,1.0) )')
        .replace('getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy )','getSharpStudioAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy, min(roughnessFactor+geometryRoughness,1.0) )');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',maps);
      if(brilliant){
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',`#include <lights_fragment_begin>
        // In the glint experiment the broad softbox is flagged off the metal;
        // the separate sphere still receives its original illumination.
        if(uStudioDirectScale<1.0){
          reflectedLight.directSpecular*=uStudioDirectScale;
          reflectedLight.directDiffuse*=uStudioDirectScale;
        }`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        if(uStudioGlintExtraction>0.5){
          // Only photons from the compact emitter enter this optical-glow mask.
          // Real reflected rays, finite-card occlusion, roughness and the metal's
          // Fresnel response determine it. No phase gate or screen-space flash.
          float glintNV=clamp(dot(normal,geometryViewDir),0.0,1.0);
          vec3 glintFresnel=material.specularColor+(vec3(1.0)-material.specularColor)*pow(1.0-glintNV,5.0);
          outgoingLight=studioAccentRadiance*glintFresnel;
        }
        #include <opaque_fragment>
      `);
      }
    };
    material.customProgramCacheKey=()=>originalKey.call(material)+(enabled?'|analytic-metal-studio-v1'+(brilliant?'|compact-reflection-glint-v1':''):'');
  }
  return {
    setContext(texture){uniforms.uSharpStudioContext.value=texture;},
    setGlintExtraction(active){uniforms.uStudioGlintExtraction.value=active?1:0;},
    update(active,settings){
      const next=Boolean(active&&uniforms.uSharpStudioContext.value);
      const nextBrilliant=next&&brilliantFlashEnabled(settings);
      if(next!==enabled||nextBrilliant!==brilliant){enabled=next;brilliant=nextBrilliant;for(const material of materials)material.needsUpdate=true;}
      if(!next)return;
      uniforms.uStudioDirectScale.value=brilliantFlashEnabled(settings)?0.015:1;
      uniforms.uStudioSecondaryAccent.value=settings.secondBevelLight===true?1:0;
      const key=metalStudioKey(settings);
      if(key===studioKey)return;studioKey=key;
      metalCardDescriptors(settings).forEach((card,i)=>{
        const center=uniforms.uStudioCenter.value[i].fromArray(card.position);
        const normal=center.clone().normalize().negate();
        const u=uniforms.uStudioU.value[i].set(0,1,0).cross(normal).normalize();
        uniforms.uStudioV.value[i].copy(normal).cross(u).normalize();
        uniforms.uStudioSize.value[i].set(card.width,card.height);
        uniforms.uStudioRadiance.value[i].fromArray(card.radiance);
        uniforms.uStudioGradient.value[i]=card.gradient?1:0;
      });
    },
  };
}
