// A simulated Penpot host for local UI verification; never shipped with the plugin.
import { createFakePenpot } from './fake-penpot.mjs';
const f=createFakePenpot({height:1050});
const rules=new f.Shape('text');rules.name='#rules';rules.characters='Template rules';f.front.appendChild(rules);
const art=new f.Shape('rectangle');art.name='#art';art.fills=[{fillImage:{id:'placeholder'}}];f.front.appendChild(art);
const board=new f.Shape();board.name='Artwork';
const image=new f.Shape('rectangle');image.name='dragon.png';image.fills=[{fillImage:{id:'dragon-media'}}];board.appendChild(image);
f.api.uploadMediaData=async(name)=>({id:name,width:100,height:100,mtype:'image/png'});
window.penpot=f.api;
const iframe=document.querySelector('iframe');
f.api.ui.sendMessage=message=>{
 f.messages.push(message);iframe.contentWindow.postMessage(message,'*');
 if(message.type==='CSV_APPLIED')document.getElementById('saved').textContent=JSON.stringify(message.data);
};
window.addEventListener('message',event=>{if(event.source===iframe.contentWindow)f.message(event.data.type,event.data.data,event.data);});
const script=document.createElement('script');script.src='/plugin.js';
script.onload=()=>{iframe.src='/';};document.head.appendChild(script);
