import {mountObject} from './brand-sites/shared/mountObject.js';
const canvas=document.querySelector('#object'),status=document.querySelector('#status');
const pause=document.querySelector('#pause'),reset=document.querySelector('#reset'),inspect=document.querySelector('#inspect');
async function initialize(){
try {
 await Promise.all([document.fonts.load('760 100px Archivo'),document.fonts.load('400 20px Plex')]);
 const object=await mountObject(canvas,{variant:'studios',onState:state=>{pause.textContent=state.paused?'Resume':'Pause';}});
 for(const button of [pause,reset,inspect])button.disabled=false;
 status.textContent='Production settings. Enable manipulation to drag the arrow or sphere.';
 pause.addEventListener('click',()=>object.pause(!object.getState().paused));
 reset.addEventListener('click',()=>object.reset());
 let interactive=false;
 inspect.addEventListener('click',()=>{interactive=!interactive;object.setInteractive(interactive);inspect.setAttribute('aria-pressed',String(interactive));inspect.textContent=interactive?'Disable manipulation':'Enable manipulation';});
} catch(error){status.textContent='Unable to initialize WebGL: '+error.message;console.error(error);}
}
initialize();
