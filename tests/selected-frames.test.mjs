import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createFakePenpot } from './fake-penpot.mjs';
import { fixture } from './fixture.mjs';
const b=await build({entryPoints:['src/selected-frames.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {SelectedFramesPrinter}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const settings={paper:'letter',paperOrientation:'auto',allowRotation:true,marginMm:5,gapMm:2,bufferColor:'#123456',cutMarks:true};
const setup=()=>{const f=createFakePenpot({width:1500,height:900});f.api.selection=[f.front];return {...f,printer:new SelectedFramesPrinter(f.api)};};
test('selected frames work without deck data, and never change originals or outputs',async()=>{
 const f=setup(), before=JSON.stringify({ids:f.root.children.map(s=>s.id),x:f.front.x,y:f.front.y,width:f.front.width,height:f.front.height,children:f.front.children.map(s=>s.id)});
 const p=f.printer.preview(settings); const result=await f.printer.export(p.token,'export',()=>{});
 assert.equal(result.images.length,1); f.printer.check(p.token,'export'); f.printer.finish('export');
 assert.equal(JSON.stringify({ids:f.root.children.map(s=>s.id),x:f.front.x,y:f.front.y,width:f.front.width,height:f.front.height,children:f.front.children.map(s=>s.id)}),before);
 assert.equal(f.page.getPluginData('cardsData'),'');assert.equal(f.page.getPluginData('outputSettings'),'');
});
test('nested selected frames are printed once; loose shapes and rotated/hidden frames are rejected',()=>{
 const f=setup(), child=f.api.createBoard();child.name='Nested';child.resize(20,30);f.front.appendChild(child);f.api.selection=[f.front,child];
 assert.equal(f.printer.preview(settings).frames.length,1);
 f.api.selection=[f.front.children[0]];assert.throws(()=>f.printer.preview(settings),/frames only/);
 f.api.selection=[f.front];f.front.rotation=90;assert.throws(()=>f.printer.preview(settings),/already rotated/);
 f.front.rotation=0;f.front.hidden=true;assert.throws(()=>f.printer.preview(settings),/hidden/);
});
test('changed text, frame dimensions, page or deleted frames invalidate preview',async()=>{
 for(const mutate of [f=>f.front.children[0].characters='Changed',f=>f.front.resize(1400,900),f=>f.api.currentPage={...f.page,id:'elsewhere'},f=>f.front.remove()]){
  const f=setup(),p=f.printer.preview(settings);mutate(f);
  await assert.rejects(f.printer.export(p.token,'export',()=>{}),/changed|removed/);
 }
});
test('changes during rendering or final PDF assembly prevent download confirmation',async()=>{
 const f=setup(),p=f.printer.preview(settings);
 f.front.export=async()=>{f.front.children[0].characters='Changed';return new Uint8Array([1]);};
 await assert.rejects(f.printer.export(p.token,'first',()=>{}),/changed/);
 f.front.export=async()=>new Uint8Array([1]);const next=f.printer.preview(settings);
 await f.printer.export(next.token,'second',()=>{});f.front.children[0].characters='Changed again';
 assert.throws(()=>f.printer.check(next.token,'second'),/changed/);f.printer.finish('second');
 assert.ok(f.printer.preview(settings));
});
test('busy requests cannot replace snapshots, cancellation releases work, and old finishes cannot cancel newer work',async()=>{
 const f=setup(); const p=f.printer.preview(settings);let release;
 f.front.export=()=>new Promise(resolve=>release=resolve);
 const run=f.printer.export(p.token,'first',()=>{});
 assert.throws(()=>f.printer.preview(settings),/Wait/);f.printer.finish('first');release(new Uint8Array([1]));
 await assert.rejects(run,/canceled/);
 f.front.export=async()=>new Uint8Array([1]);const q=f.printer.preview(settings);await f.printer.export(q.token,'second',()=>{});
 f.printer.finish('first');assert.doesNotThrow(()=>f.printer.check(q.token,'second'));f.printer.finish('second');
});
test('plugin selection route is independent of malformed deck metadata and rejects stale page contexts',async()=>{
 const f=fixture({height:1050});f.api.selection=[f.front];f.page.setPluginData('deck-source','broken');
 f.message('selection-print-preview',settings,{requestId:'preview'});
 const preview=f.messages.at(-1);assert.equal(preview.type,'SELECTION_PRINT_PREVIEW');
 f.message('selection-print-export',preview.data.token,{requestId:'render'});await new Promise(r=>setImmediate(r));
 assert.equal(f.messages.at(-1).type,'SELECTION_PRINT_IMAGES');
 f.message('selection-print-check',preview.data.token,{requestId:'render'});assert.equal(f.messages.at(-1).type,'SELECTION_PRINT_CHECKED');
 f.message('selection-print-finish',null,{requestId:'render'});
 f.message('selection-print-preview',settings,{requestId:'stale',pageId:'different'});assert.equal(f.messages.at(-1).type,'SELECTION_PRINT_ERROR');
});

test('changing deck source releases selected-frame printing immediately',async()=>{
 const f=fixture();f.api.selection=[f.front];f.message('selection-print-preview',settings,{requestId:'preview'});
 const p=f.messages.at(-1).data;f.message('selection-print-export',p.token,{requestId:'render'});await new Promise(r=>setImmediate(r));
 f.message('sheet-begin',{requestId:'sheet'});
 f.message('selection-print-preview',settings,{requestId:'fresh'});
 assert.equal(f.messages.at(-1).type,'SELECTION_PRINT_PREVIEW');
});
