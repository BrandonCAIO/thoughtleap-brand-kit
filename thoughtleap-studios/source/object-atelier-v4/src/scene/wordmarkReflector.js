import * as THREE from 'three';
import thoughtLeapArtwork from '../../../brand-assets/thoughtleap-wordmark-source.js';

/** A stationary, emissive typography card in world space. The polished face
 * samples this card along its real reflection ray: no object UVs, decal, normal
 * texture, or camera-following card is involved. A separate shader variant
 * leaves the pre-existing material shader untouched whenever disabled. */
export async function createWordmarkReflector(material) {
  // Kayla Griffin's ThoughtLeap lettering is supplied artwork, never typeset.
  // The generated source module embeds the same SVG in web, Remotion, and portable builds.
  const artworkReady=new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('The original ThoughtLeap wordmark could not be rasterized.'));
    image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(thoughtLeapArtwork);
  });
  const fontsReady=document.fonts?.load
    ?Promise.all([document.fonts.load('750 280px Archivo'),document.fonts.load('420 280px Archivo')])
    :Promise.resolve();
  const [artwork]=await Promise.all([artworkReady,fontsReady]);
  const canvas=document.createElement('canvas');
  // The texture and stationary card both have a 64:21 aspect ratio. Keeping
  // these identical preserves the artwork's proportions in world space.
  canvas.width=4096;canvas.height=1344;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('The reflected wordmark needs a 2D canvas.');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;
  let currentWordmark='';
  function setWordmark(identity){
    const next=identity==='humans'?'humans':'studios';
    if(next===currentWordmark)return;
    currentWordmark=next;
    const fontSize=280;
    context.setTransform(1,0,0,1,0,0);
    context.clearRect(0,0,canvas.width,canvas.height);
    context.textAlign='left';context.fillStyle='#ffffff';
    if(next==='studios'){
      const artworkHeight=fontSize,artworkWidth=artworkHeight*467/72,gap=fontSize*.24;
      context.font=`420 ${fontSize}px Archivo`;
      const descriptorWidth=context.measureText('Studios').width;
      const width=artworkWidth+gap+descriptorWidth,scale=Math.min(1,(canvas.width-240)/width);
      context.translate((canvas.width-width*scale)/2,canvas.height/2);
      context.scale(scale,scale);
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
      context.drawImage(artwork,0,-artworkHeight/2,artworkWidth,artworkHeight);
      // The supplied artwork's baseline is near y=55.5 in its 72-unit viewBox.
      // Only the separate Studios descriptor is typeset alongside that baseline.
      context.textBaseline='alphabetic';
      context.fillText('Studios',artworkWidth+gap,artworkHeight*(55.5/72-.5));
    }else{
      const left='For the',right=' Humans';
      context.textBaseline='middle';
      context.font=`420 ${fontSize}px Archivo`;const leftWidth=context.measureText(left).width;
      context.font=`750 ${fontSize}px Archivo`;const rightWidth=context.measureText(right).width;
      const width=leftWidth+rightWidth,scale=Math.min(1,(canvas.width-240)/width);
      context.translate((canvas.width-width*scale)/2,canvas.height/2);
      context.scale(scale,scale);
      context.font=`420 ${fontSize}px Archivo`;context.fillText(left,0,0);
      context.font=`750 ${fontSize}px Archivo`;context.fillText(right,leftWidth,0);
    }
    texture.needsUpdate=true;
  }
  setWordmark('studios');

  // Authored once for the resting pose (-15 yaw, 8 pitch, -2 roll), not updated
  // when the arrow or viewer moves. Only reflected rays can see this virtual card.
  const ray=new THREE.Vector3(-.483238165182437,-.23664049401227,.842901033517424);
  const cardU=new THREE.Vector3(.875488935230544,-.130616977020094,.465250824398002);
  const cardV=ray.clone().cross(cardU).normalize();
  const focus=new THREE.Vector3(.183889547656928,.554540848003021,.359957055992269);
  // A close, finite card gives the reflected words time to travel through the
  // face during a slow turn. Perspective compensation retains the resting size.
  const distance=1.25,perspectiveScale=(17.65+distance)/(17.65+5.5);
  const uniforms={
    uWordmarkTexture:{value:texture},
    uWordmarkCenter:{value:focus.clone().addScaledVector(ray,distance)},
    uWordmarkNormal:{value:ray},uWordmarkU:{value:cardU},uWordmarkV:{value:cardV},
    uWordmarkSize:{value:new THREE.Vector2(3.2,1.05).multiplyScalar(perspectiveScale)},uWordmarkStrength:{value:1},
  };
  const originalCompile=material.onBeforeCompile,originalCacheKey=material.customProgramCacheKey;
  let enabled=false;
  material.onBeforeCompile=(shader,renderer)=>{
    originalCompile.call(material,shader,renderer);
    if(!enabled)return;
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWordmarkWorldPosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vWordmarkWorldPosition=(modelMatrix*vec4(transformed,1.0)).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vWordmarkWorldPosition;
      uniform sampler2D uWordmarkTexture;
      uniform vec3 uWordmarkCenter,uWordmarkNormal,uWordmarkU,uWordmarkV;
      uniform vec2 uWordmarkSize;
      uniform float uWordmarkStrength;`);
    shader.fragmentShader=shader.fragmentShader.replace('vec3 totalSpecular =',`
      // Mirror a finite studio emitter using the physical surface normal.
      vec3 wordmarkEye=normalize(cameraPosition-vWordmarkWorldPosition);
      vec3 wordmarkNormal=inverseTransformDirection(normal,viewMatrix);
      vec3 wordmarkRay=reflect(-wordmarkEye,wordmarkNormal);
      float wordmarkDenominator=dot(wordmarkRay,uWordmarkNormal);
      if(abs(wordmarkDenominator)>0.005){
        float wordmarkDistance=dot(uWordmarkCenter-vWordmarkWorldPosition,uWordmarkNormal)/wordmarkDenominator;
        if(wordmarkDistance>0.0){
          vec3 wordmarkHit=vWordmarkWorldPosition+wordmarkRay*wordmarkDistance-uWordmarkCenter;
          vec2 wordmarkUV=vec2(dot(wordmarkHit,uWordmarkU),dot(wordmarkHit,uWordmarkV))/uWordmarkSize+0.5;
          if(all(greaterThanEqual(wordmarkUV,vec2(0.0)))&&all(lessThanEqual(wordmarkUV,vec2(1.0)))){
            vec4 wordmark=texture2D(uWordmarkTexture,wordmarkUV,material.roughness*12.0);
            float wordmarkNV=clamp(dot(wordmarkNormal,wordmarkEye),0.0,1.0);
            vec3 wordmarkFresnel=material.specularColor+(vec3(1.0)-material.specularColor)*pow(1.0-wordmarkNV,5.0);
            reflectedLight.indirectSpecular+=wordmark.rgb*wordmark.a*wordmarkFresnel*(20.0*uWordmarkStrength)*(1.0-material.roughness);
          }
        }
      }
      vec3 totalSpecular =`);
  };
  material.customProgramCacheKey=()=>originalCacheKey.call(material)+(enabled?'|stationary-wordmark-reflector-v1':'');
  return {
    update(active,strength=1,scale=1,identity='studios'){
      setWordmark(identity);
      const next=Boolean(active);
      if(next!==enabled){enabled=next;material.needsUpdate=true;}
      uniforms.uWordmarkStrength.value=Math.max(0,Math.min(2,Number(strength)||0));
      // Enlarge the stationary studio lettering; the metal outline naturally
      // crops its true reflection as the arrow turns. No surface decal.
      const size=typeof scale==='number'&&Number.isFinite(scale)?Math.max(.5,Math.min(6,scale)):1;
      uniforms.uWordmarkSize.value.set(3.2,1.05).multiplyScalar(perspectiveScale*size);
    },
    dispose(){texture.dispose();},
  };
}
