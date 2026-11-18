/** Shared contract for the object atelier, browser inspector and Remotion. */
export const FINISH_PRESETS = Object.freeze({
  darkMirror: {label:'Dark mirror', description:'Smooth graphite mirror, platinum bevel, directional satin flank.', values:{faceColor:'#32383e',faceRoughness:.065,bevelRoughness:.018,sideRoughness:.34,metalness:1,environmentIntensity:1.45}},
  platinum: {label:'Polished platinum', description:'A continuous pale metal face with a restrained satin edge.', values:{faceColor:'#c9ced2',faceRoughness:.035,bevelRoughness:.018,sideRoughness:.38,metalness:1,environmentIntensity:.82}},
  recipe: {label:'Hero C recipe', description:'Supplied material values with the requested smooth face and physically reflected bevel.', values:{faceColor:'#0b0d10',faceRoughness:.22,bevelRoughness:.018,sideRoughness:.38,metalness:1,environmentIntensity:1.55}},
});

export const BACKGROUND_PRESETS = Object.freeze({
  dark:{label:'Dark',color:'#0B0D10'},
  darkStage:{label:'Dark stage',color:'#03070D',ground:true},
  deepBlue:{label:'Deep blue',color:'#03070D',gradient:{top:'#03070D',middle:'#082B4B',bottom:'#185D8B'}},
  ivory:{label:'Warm ivory',color:'#F3F0EA'},
  white:{label:'White',color:'#FFFFFF'},
});

/** Match the shader receiver behind the centered, contained 16:9 composition.
 * Endpoint colors extend through letterboxing; the final canvas is opaque. */
export function backgroundCSS(background,width=1920,height=1080){
  const preset=BACKGROUND_PRESETS[background]||BACKGROUND_PRESETS.dark;
  if(!preset.gradient)return preset.color;
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const {top,middle,bottom}=Object.fromEntries(Object.entries(preset.gradient).map(([key,color])=>[key,rgb(color)]));
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const compositionHeight=Math.min(width/1920,height/1080)*1080;
  const start=(height-compositionHeight)/2/height*100,extent=compositionHeight/height*100;
  const stops=Array.from({length:65},(_,i)=>{
    const t=i/64,a=smooth(0,.72,t),b=smooth(.38,1,t);
    const color=top.map((v,c)=>((v+(middle[c]-v)*a)*(1-b)+bottom[c]*b).toFixed(3));
    return `rgb(${color.join(' ')}) ${(start+extent*t).toFixed(4)}%`;
  });
  return `linear-gradient(180deg,${stops.join(',')})`;
}

export const SETTINGS_DEFAULTS = Object.freeze({
  background:'dark', shadowStrength:.24,
  finishPreset:'darkMirror', ...FINISH_PRESETS.darkMirror.values,
  bevelWidth:.15, thickness:.4, doubleBevel:false, sideEngraving:false, engravingDepth:.005,
  sideAnisotropy:1,
  lightAzimuth:-18, lightElevation:32, lightWidth:12, lightHeight:1.4, lightIntensity:12, polishFlashWidth:1, brilliantFlash:false, secondBevelLight:false,
  exposure:1.05,
  yaw:-15, pitch:8, roll:-2,
  cameraDistance:18, cameraAzimuth:0, cameraElevation:0, framing:1,
  cameraTargetX:0, cameraTargetY:0,
  dotVisible:true, arrowVisible:true,
  motionPreset:'rocketLaunch', motionDuration:10, motionLoop:false, motionAmount:1,
  spinSpeed:4, heatStrength:1, trailStrength:1,
  spineAngle:0, reflectionEnabled:false, reflectionStrength:1, reflectionScale:1, reflectionWordmark:'studios',
  cameraMotion:0, lightMotion:12,
});

const range=(key,label,group,min,max,step,unit='')=>({key,label,group,type:'range',min,max,step,unit});
export const SETTINGS_SCHEMA = Object.freeze([
  {key:'background',label:'Background',group:'Backdrop',type:'select',options:Object.entries(BACKGROUND_PRESETS).map(([value,p])=>({value,label:p.label}))},
  range('shadowStrength','Shadow strength','Backdrop',0,1,.01),
  {key:'finishPreset',label:'Finish study',group:'Finish',type:'select',options:Object.entries(FINISH_PRESETS).map(([value,p])=>({value,label:p.label}))},
  {key:'faceColor',label:'Face metal',group:'Finish',type:'color'},
  range('faceRoughness','Face roughness','Finish',.018,.5,.001),
  range('bevelRoughness','Mirror roughness','Finish',.012,.18,.001),
  range('sideRoughness','Flank roughness','Finish',.012,.65,.001),
  range('sideAnisotropy','Directional satin','Finish',0,1,.05),
  range('metalness','Metalness','Finish',.65,1,.01),
  range('bevelWidth','Planar bevel width','Geometry',.05,.26,.005,'wu'),
  range('thickness','Body thickness','Geometry',.18,.7,.01,'wu'),
  {key:'doubleBevel',label:'Second polished bevel',group:'Geometry',type:'boolean'},
  {key:'sideEngraving',label:'Engraved sides',group:'Geometry',type:'boolean'},
  range('engravingDepth','Engraving depth','Geometry',.001,.012,.001,'wu'),
  {key:'arrowVisible',label:'Arrow',group:'Geometry',type:'boolean'},
  {key:'dotVisible',label:'Orange sphere',group:'Geometry',type:'boolean'},
  range('lightAzimuth','Softbox azimuth','Lighting',-180,180,1,'°'),
  range('lightElevation','Softbox elevation','Lighting',-70,80,1,'°'),
  range('lightWidth','Softbox width','Lighting',3,22,.25,'wu'),
  range('lightHeight','Softbox height','Lighting',.15,6,.05,'wu'),
  range('polishFlashWidth','Upper bevel flash width','Lighting',.2,1.5,.05,'×'),
  {key:'brilliantFlash',label:'Brilliant flash experiment',group:'Lighting',type:'boolean'},
  {key:'secondBevelLight',label:'Second edge light',group:'Lighting',type:'boolean'},
  range('lightIntensity','Softbox intensity','Lighting',0,35,.25),
  range('environmentIntensity','Reflected field','Lighting',.15,3,.05),
  range('exposure','Exposure','Lighting',.5,1.6,.01),
  range('yaw','Object yaw','Pose',-180,180,1,'°'),
  range('pitch','Object pitch','Pose',-180,180,1,'°'),
  range('roll','Object roll','Pose',-180,180,1,'°'),
  range('cameraDistance','Camera distance','Camera',5,80,.1,'wu'),
  range('framing','Framing','Camera',.5,5,.01,'×'),
  range('cameraAzimuth','Camera azimuth','Camera',-180,180,1,'°'),
  range('cameraElevation','Camera elevation','Camera',-70,70,1,'°'),
  range('cameraTargetX','Detail target X','Camera',-2.5,2.5,.02,'wu'),
  range('cameraTargetY','Detail target Y','Camera',-2.5,2.5,.02,'wu'),
  {key:'motionPreset',label:'Motion study',group:'Motion',type:'select',options:[{value:'reflectionStudy',label:'Reflection study · slow spine turn'},{value:'rocketLaunch',label:'Rocket launch · spin, heat, fly'},{value:'still',label:'Still inspection'},{value:'lightSweep',label:'Light across the facets'},{value:'turntable',label:'Full object turn'},{value:'spineRoll',label:'Roll about the arrow spine'},{value:'reveal',label:'Weighted assembly'},{value:'reelLaunch',label:'Reel opening · spin to launch'}]},
  range('spineAngle','Spine angle','Motion',0,360,.1,'°'),
  {key:'reflectionEnabled',label:'Reflected wordmark',group:'Motion',type:'boolean'},
  range('reflectionStrength','Reflection brightness','Motion',0,2,.05,'×'),
  range('reflectionScale','Reflection size','Motion',.5,6,.1,'×'),
  {key:'reflectionWordmark',label:'Reflected identity',group:'Motion',type:'select',options:[{value:'studios',label:'ThoughtLeap Studios'},{value:'humans',label:'For the Humans'}]},
  range('spinSpeed','Peak spin speed','Motion',.5,6,.1,'rev/s'),
  range('heatStrength','Orange heat','Motion',0,1.5,.05,'×'),
  range('trailStrength','Rocket trail','Motion',0,2,.05,'×'),
  range('motionDuration','Duration','Motion',2,30,.5,'s'),
  {key:'motionLoop',label:'Loop playback',group:'Motion',type:'boolean'},
  range('motionAmount','Object motion amount','Motion',0,2,.05,'×'),
  range('cameraMotion','Camera travel','Motion',0,30,.5,'°'),
  range('lightMotion','Light travel','Motion',0,150,1,'°'),
]);

/** Named preset applies material fields only; all geometry, camera and motion stay. */
export function applyFinishPreset(input={},name='darkMirror') {
  const preset=FINISH_PRESETS[name]||FINISH_PRESETS.darkMirror;
  return sanitizeSettings({...input,...preset.values,finishPreset:FINISH_PRESETS[name]?name:'darkMirror'});
}

/** Deterministic, finite, bounded settings. Unknown keys are deliberately omitted. */
export function sanitizeSettings(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))input={};
  const preset=FINISH_PRESETS[input.finishPreset]||FINISH_PRESETS.darkMirror;
  const source={...SETTINGS_DEFAULTS,...preset.values,...input},out={};
  for(const field of SETTINGS_SCHEMA) {
    const value=source[field.key],fallback=SETTINGS_DEFAULTS[field.key];
    if(field.type==='range')out[field.key]=typeof value==='number'&&Number.isFinite(value)?Math.max(field.min,Math.min(field.max,value)):fallback;
    else if(field.type==='boolean')out[field.key]=typeof value==='boolean'?value:fallback;
    else if(field.type==='color')out[field.key]=typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)?value:fallback;
    else out[field.key]=field.options.some(o=>o.value===value)?value:fallback;
  }
  return out;
}
