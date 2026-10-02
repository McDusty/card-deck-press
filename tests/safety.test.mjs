import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {fixture} from './fixture.mjs';

const folder=mkdtempSync(join(tmpdir(),'cardforge-safety-'));
after(()=>rmSync(folder,{recursive:true,force:true}));
await build({entryPoints:['src/image-targets.ts'],outfile:join(folder,'images.mjs'),bundle:true,platform:'node',format:'esm'});
const {assignCardImage,ImageTargets}=await import(pathToFileURL(join(folder,'images.mjs')));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const saved=f=>JSON.parse(JSON.parse(f.page.getPluginData('cardsData')));
function importCards(f,source){const preview=f.message('csv-preview',{source,revision:1});assert.equal(preview.data.errors.length,0);f.message('csv-apply',preview.data.token);return saved(f);}
function imageField(f){const field=new f.Shape('rectangle');field.name='#art';field.fills=[{fillImage:{id:'placeholder'}}];f.front.appendChild(field);return field;}
function artwork(f){const board=new f.Shape();board.name='Artwork';const image=new f.Shape('rectangle');image.name='dragon.png';image.fills=[{fillImage:{id:'dragon'}}];board.appendChild(image);return image;}
function startUpload(f,uploadId='upload-1'){
 const target={rowId:f.rowIds()[0],name:'#art',uploadId};
 f.message('create-image-data',{...target,data:new Uint8Array([1]),mimeType:'image/png',filename:'dragon.png'});return target;
}

test('stale saves cannot overwrite another page, even after switching back',()=>{
 const f=fixture(),other=fixture();other.page.id='page-2';
 f.message('save-cards-data',JSON.stringify([{'#name':'First'}]));
 other.message('save-cards-data',JSON.stringify([{'#name':'Second'}]));
 const stale={...f.context(),rowIds:f.rowIds()};
 f.switchPage(other.page);
 f.message('save-cards-data',JSON.stringify([{'#name':'Wrong'}]),stale);
 assert.equal(saved(other)[0]['#name'],'Second');assert.equal(f.messages.at(-1).type,'DECK_ERROR');
 f.switchPage(f.page);f.message('save-cards-data',JSON.stringify([{'#name':'Wrong'}]),stale);
 assert.equal(saved(f)[0]['#name'],'First');
});

test('missing page binding and duplicate row identities cannot mutate a deck',()=>{
 const f=fixture();f.message('save-cards-data',JSON.stringify([{'#name':'Keep'}]));const before=f.page.getPluginData('cardsData');
 f.message('save-cards-data',JSON.stringify([{'#name':'Wrong'}]),{pageId:undefined,session:undefined});assert.equal(f.page.getPluginData('cardsData'),before);
 f.message('save-cards-data',JSON.stringify([{},{}]),{rowIds:['same','same']});assert.equal(f.page.getPluginData('cardsData'),before);
});

for(const mode of ['standard','printplay','tabletop'])test(`${mode}: unclaimed output survives and failed regeneration keeps completed output`,()=>{
 const f=fixture({back:true,height:1050});const unrelated=new f.Shape();unrelated.name='Output';
 f.forge(mode,[{'#name':'Original'}]);assert.equal(f.page.getShapeById(unrelated.id),unrelated);
 const old=f.page.getShapeById(f.page.getPluginData('legacy-output-current'));old.name='Renamed deck';const before=[...f.shapes.keys()];
 f.failSecondClone();f.forge(mode,[{'#name':'New'},{'#name':'Another'}]);
 assert.equal(f.messages.at(-1).type,'FORGE_ERROR');assert.equal(f.page.getShapeById(old.id),old);assert.deepEqual([...f.shapes.keys()],before);
 f.forge(mode,[{'#name':'Replacement'}]);assert.equal(f.page.getShapeById(old.id),null);assert.equal(f.page.getShapeById(unrelated.id),unrelated);
});

test('legacy publication failure restores the old output pointer and removes staging',()=>{
 const f=fixture({back:true});f.forge('standard',[{'#name':'Old'}]);const before=[...f.shapes.keys()];const old=f.page.getPluginData('legacy-output-current');
 const write=f.page.setPluginData;let fail=true;f.page.setPluginData=(key,value)=>{write(key,value);if(key==='legacy-output-current'&&fail){fail=false;throw new Error('Publication failed');}};
 f.forge('standard',[{'#name':'New'}]);assert.equal(f.messages.at(-1).type,'FORGE_ERROR');assert.equal(f.page.getPluginData('legacy-output-current'),old);assert.deepEqual([...f.shapes.keys()],before);
});

test('legacy Standard and Tabletop use absolute positions without overlaps',()=>{
 for(const mode of ['standard','tabletop']){
  const f=fixture({back:true,height:1050});f.forge(mode,Array.from({length:11},(_,i)=>({'#name':String(i)})));
  const output=f.page.getShapeById(f.page.getPluginData('legacy-output-current'));const back=output.children.at(-1);
  assert.equal(back.x,output.x+output.width-back.width);
  for(const card of output.children)assert.ok(card.x>=output.x && card.x+card.width<=output.x+output.width);
  if(mode==='tabletop'){assert.equal(output.children[9].y,output.children[0].y);assert.equal(output.children[10].x,output.x);assert.equal(output.children[10].y,output.y+1050);}
 }
});

// Correct a partial clone failure, not only an error before cloning starts.
test('partial Front clone failures leave the last good output and no orphan copy',()=>{
 const f=fixture();f.forge('fronts-9',[{'#name':'Old'}]);const old=f.output();const before=[...f.shapes.keys()];
 const child=f.front.children[0];const clone=child.clone;child.clone=()=>{throw new Error('Nested clone failed');};
 f.forge('fronts-9',[{'#name':'New'}]);child.clone=clone;
 assert.equal(f.output(),old);assert.deepEqual([...f.shapes.keys()],before);
});

test('upload completion is discarded after row deletion or page change',async()=>{
 for(const change of ['delete','page']){
  const f=fixture();imageField(f);f.message('save-cards-data',JSON.stringify([{'#name':'A'},{'#name':'B'}]));
  let finish;f.api.uploadMediaData=()=>new Promise(resolve=>finish=resolve);startUpload(f);
  if(change==='delete')f.message('save-cards-data',JSON.stringify([{'#name':'B'}]),{rowIds:[f.rowIds()[1]]});
  else{const other=fixture();other.page.id='page-2';f.switchPage(other.page);}
  finish({id:'media',width:100,height:200});await tick();assert.equal(f.messages.some(message=>message.type==='IMAGE_CREATED'),false);assert.equal(f.page.findShapes({name:'Artwork'}).length,0);
 }
});

test('upload follows its card when rows move and only the latest upload is applied',async()=>{
 const f=fixture();imageField(f);const cards=[{'#name':'A'},{'#name':'B'}];f.message('save-cards-data',JSON.stringify(cards));const originalRows=f.rowIds();
 const pending=[];f.api.uploadMediaData=()=>new Promise(resolve=>pending.push(resolve));const old=startUpload(f,'older');const latest=startUpload(f,'latest');
 cards.reverse();const rows=[...originalRows].reverse();f.message('save-cards-data',JSON.stringify(cards),{rowIds:rows});
 pending[1]({id:'latest-media',width:100,height:200});await tick();const result=f.messages.find(message=>message.type==='IMAGE_CREATED');assert.equal(result.data.rowId,originalRows[0]);
 const targets=new ImageTargets();targets.start(old);targets.start(latest);assert.equal(targets.matches(old),false);
 assert.equal(assignCardImage(cards,rows,result.data,`${result.data.imageId}|${result.data.id}`),true);assert.equal(cards[1]['#name'],'A');assert.match(cards[1]['#art'],/latest-media/);assert.equal(cards[0]['#art'],undefined);
 pending[0]({id:'older-media',width:100,height:200});await tick();assert.equal(f.messages.filter(message=>message.type==='IMAGE_CREATED').length,1);
 cards.splice(1,1);rows.splice(1,1);assert.equal(assignCardImage(cards,rows,latest,'wrong'),false);
});

test('failed image upload reports an error without publishing an image',async()=>{
 const f=fixture();imageField(f);f.message('save-cards-data',JSON.stringify([{}]));f.api.uploadMediaData=async()=>{throw new Error('Upload failed');};const target=startUpload(f);await tick();
 assert.equal(f.messages.at(-1).type,'IMAGE_ERROR');assert.equal(f.messages.at(-1).data.uploadId,target.uploadId);assert.match(f.messages.at(-1).data.message,/Upload failed/);assert.equal(f.page.findShapes({name:'Artwork'}).length,0);
});

test('CSV replacement invalidates a pending manual upload',async()=>{
 const f=fixture();imageField(f);f.message('save-cards-data',JSON.stringify([{'#name':'Old'}]));let finish;f.api.uploadMediaData=()=>new Promise(resolve=>finish=resolve);startUpload(f);
 importCards(f,'card_id,name\n1,Replacement');finish({id:'media',width:100,height:200});await tick();assert.equal(f.messages.some(message=>message.type==='IMAGE_CREATED'),false);
});

test('backs-only ignores Front changes, and zero-quantity artwork does not block fronts',()=>{
 const f=fixture({back:true,height:1050});imageField(f);const image=artwork(f);const cards=importCards(f,'card_id,quantity,name,art\n1,0,Excluded,dragon.png\n2,1,Included,');
 image.remove();f.forge('fronts-9',cards);assert.ok(f.output());assert.equal(f.output().children[0].children.length,1);
 f.front.remove();f.forge('backs-9',cards);assert.ok(f.backOutput());assert.equal(f.backOutput().children[0].children.length,1);
});

test('card edits during PDF rendering prevent a stale result',async()=>{
 const f=fixture({height:1050});const cards=[{'#name':'Old'}];f.message('save-cards-data',JSON.stringify(cards));f.forge('fronts-9',cards);let finish;
 f.output().children[0].export=()=>new Promise(resolve=>finish=resolve);
 f.message('export-front-pdf',{type:'fronts-9',cardsData:cards,paper:'a4',cutMarks:false},{requestId:'pdf-1'});
 f.message('save-cards-data',JSON.stringify([{'#name':'New'}]));finish(new Uint8Array([1,2,3]));await tick();
 assert.equal(f.messages.at(-1).type,'PDF_EXPORT_ERROR');assert.equal(f.messages.at(-1).requestId,'pdf-1');assert.match(f.messages.at(-1).data,/changed during export/);assert.equal(f.messages.some(message=>message.type==='FRONT_PDF_IMAGES'),false);
});

test('switching away and back during PDF rendering invalidates the old session',async()=>{
 const f=fixture();const cards=[{'#name':'Old'}];f.forge('fronts-9',cards);let finish;f.output().children[0].export=()=>new Promise(resolve=>finish=resolve);
 f.message('export-front-pdf',{type:'fronts-9',cardsData:cards,paper:'a4',cutMarks:false});const other=fixture();other.page.id='page-2';f.switchPage(other.page);f.switchPage(f.page);
 finish(new Uint8Array([1,2,3]));await tick();assert.equal(f.messages.at(-1).type,'PDF_EXPORT_ERROR');assert.equal(f.messages.some(message=>message.type==='FRONT_PDF_IMAGES'),false);
});

test('Front publication failure restores its completed output and pointer',()=>{
 const f=fixture();f.forge('fronts-9',[{'#name':'Old'}]);const before=[...f.shapes.keys()];const old=f.output();
 const write=f.page.setPluginData;let fail=true;f.page.setPluginData=(key,value)=>{write(key,value);if(key==='front-output-current'&&fail){fail=false;throw new Error('Publication failed');}};
 f.forge('fronts-9',[{'#name':'New'}]);assert.equal(f.messages.at(-1).type,'FORGE_ERROR');assert.equal(f.output(),old);assert.deepEqual([...f.shapes.keys()],before);
});

test('PDF export refuses an already outdated saved dataset',async()=>{
 const f=fixture();const old=[{'#name':'Old'}];f.message('save-cards-data',JSON.stringify(old));f.forge('fronts-9',old);
 f.message('save-cards-data',JSON.stringify([{'#name':'New'}]));await f.exportPdf('fronts-9',old);
 assert.equal(f.messages.at(-1).type,'PDF_EXPORT_ERROR');assert.match(f.messages.at(-1).data,/deck changed/);
});
