import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
const bundle=await build({entryPoints:['src/selected-print-ui.ts'],bundle:true,platform:'browser',format:'cjs',write:false});
function fixture(){
 const ids=new Map(),sent=[],timers=new Map();let timer=0;
 class Element {
  value='';checked=false;disabled=false;textContent='';children=[];listeners=new Map();attributes=new Map();classes=new Set();
  classList={toggle:(n,on)=>on?this.classes.add(n):this.classes.delete(n)};
  get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
  addEventListener(n,f){this.listeners.set(n,f);}dispatchEvent(e){this.listeners.get(e.type)?.(e);}
  setAttribute(n,v){this.attributes.set(n,v);}replaceChildren(){this.children=[];}append(...items){this.children.push(...items);}
  querySelectorAll(){return [...ids.entries()].filter(([id])=>/selected-print-(paper|orientation|gap|margin|color|rotate|cuts|refresh|cancel|download)$/.test(id)).map(([,e])=>e);}
  getContext(){return null;}
  focus(){document.activeElement=this;}
 }
 const el=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);};
 const document={getElementById:el,createElement:()=>new Element()};
 const context={module:{exports:{}},exports:{},document,crypto:{randomUUID},Uint8Array,TextEncoder,TextDecoder,URL,console,setTimeout:f=>{timers.set(++timer,f);return timer;},clearTimeout:id=>timers.delete(id),Event:class{constructor(type){this.type=type;}}};context.exports=context.module.exports;
 vm.runInNewContext(bundle.outputFiles[0].text,context);
 for(const [id,value] of Object.entries({paper:'letter',orientation:'auto',gap:'0',margin:'5',color:'#FFFFFF'}))el('selected-print-'+id).value=value;
 el('selected-print-rotate').checked=true;el('selected-print-cuts').checked=true;
 const ui=context.module.exports.initSelectedPrintUi((type,data,requestId)=>sent.push({type,data,requestId}));
 const event=(id,type)=>el(id).dispatchEvent({type,preventDefault(){}});
 const select=()=>event('export-mode-selection','click');
 const reply=(type,data,requestId=sent.at(-1).requestId)=>ui.message({type,data,requestId});
 const preview={token:'one',frames:[{id:'a',name:'Card',width:1500,height:900}],settings:{marginMm:5,bufferColor:'#FFFFFF'},layout:{width:2550,height:3300,gap:0,pages:[[{id:'a',x:60,y:60,width:1500,height:900,rotated:false}]]}};
 return {ui,el,event,select,reply,preview,sent,timers,document};
}
test('selection mode requests settings and displays preview with margins',()=>{
 const f=fixture();f.select();assert.equal(f.sent.at(-1).type,'selection-print-preview');assert.equal(f.sent.at(-1).data.marginMm,5);
 assert.equal(f.el('box-forge').classes.has('hidden'),true);f.reply('SELECTION_PRINT_PREVIEW',f.preview);
 assert.equal(f.el('selected-print-download').disabled,false);assert.match(f.el('selected-print-summary').textContent,/1 frame.*5 mm margins/);
 assert.equal(f.el('selected-print-pages').children.length,1);f.ui.reset();
});
test('changing margin invalidates download and ignores an outdated preview',()=>{
 const f=fixture();f.select();const old=f.sent.at(-1).requestId;f.el('selected-print-margin').value='20';f.event('selected-print-form','change');
 assert.equal(f.sent.at(-1).data.marginMm,20);f.reply('SELECTION_PRINT_PREVIEW',f.preview,old);assert.equal(f.el('selected-print-download').disabled,true);
 f.reply('SELECTION_PRINT_PREVIEW',{...f.preview,settings:{...f.preview.settings,marginMm:20}});assert.match(f.el('selected-print-summary').textContent,/20 mm margins/);f.ui.reset();
});
test('export errors stop busy text and allow retry; stale completion cannot restart it',()=>{
 const f=fixture();f.select();f.reply('SELECTION_PRINT_PREVIEW',f.preview);f.event('selected-print-form','submit');const id=f.sent.at(-1).requestId;
 assert.equal(f.sent.at(-1).type,'selection-print-export');assert.equal(f.el('export-mode-deck').disabled,true);
 f.reply('SELECTION_PRINT_ERROR','A frame changed',id);assert.equal(f.el('selected-print-status').textContent,'');assert.equal(f.el('selected-print-status').attributes.get('aria-busy'),'false');
 assert.equal(f.el('export-mode-deck').disabled,false);assert.equal(f.el('selected-print-download').disabled,true);assert.match(f.el('selected-print-error').textContent,/changed/);
 f.reply('SELECTION_PRINT_PROGRESS',{current:1,total:3},id);assert.equal(f.el('selected-print-status').textContent,'');f.ui.reset();
});
test('page reset cancels active export and timeout clears a missing response',()=>{
 const f=fixture();f.select();f.reply('SELECTION_PRINT_PREVIEW',f.preview);f.event('selected-print-form','submit');const id=f.sent.at(-1).requestId;
 f.ui.reset();assert.equal(f.sent.at(-1).type,'selection-print-finish');assert.equal(f.sent.at(-1).requestId,id);
 f.event('selected-print-refresh','click');[...f.timers.values()].at(-1)();assert.match(f.el('selected-print-error').textContent,/did not respond/);assert.equal(f.el('selected-print-status').textContent,'');f.ui.reset();
});

test('export tabs switch panels without fetching twice and Back restores focus',()=>{
 const f=fixture();f.select();const count=f.sent.length;f.select();assert.equal(f.sent.length,count);
 assert.equal(f.el('export-mode-selection').attributes.get('aria-selected'),'true');
 assert.equal(f.el('export-mode-deck').tabIndex,-1);
 f.reply('SELECTION_PRINT_PREVIEW',f.preview);f.event('selected-print-cancel','click');
 assert.equal(f.el('selected-print-form').classes.has('hidden'),true);assert.equal(f.el('box-forge').classes.has('hidden'),false);
 assert.equal(f.el('export-mode-deck').attributes.get('aria-selected'),'true');assert.equal(f.el('export-mode-deck').tabIndex,0);
 assert.equal(f.document.activeElement,f.el('export-mode-deck'));f.ui.reset();
});
test('arrow, Home, and End keys navigate export tabs; exporting locks mode changes',()=>{
 const f=fixture();let prevented=0;
 const key=(id,key)=>f.el(id).dispatchEvent({type:'keydown',key,preventDefault(){prevented++;}});
 key('export-mode-deck','ArrowRight');assert.equal(f.document.activeElement,f.el('export-mode-selection'));
 key('export-mode-selection','ArrowRight');assert.equal(f.document.activeElement,f.el('export-mode-deck'));
 key('export-mode-deck','End');key('export-mode-selection','Home');key('export-mode-deck','ArrowLeft');
 assert.equal(prevented,5);assert.equal(f.el('export-mode-selection').attributes.get('aria-selected'),'true');
 f.reply('SELECTION_PRINT_PREVIEW',f.preview);f.event('selected-print-form','submit');
 assert.equal(f.el('export-mode-selection').disabled,true);key('export-mode-selection','Home');
 assert.equal(f.el('export-mode-selection').attributes.get('aria-selected'),'true');assert.equal(prevented,5);f.ui.reset();
});
