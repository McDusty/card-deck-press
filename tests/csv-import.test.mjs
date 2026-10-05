import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { fixture } from './fixture.mjs';

const folder=mkdtempSync(join(tmpdir(),'cardforge-csv-'));
after(()=>rmSync(folder,{recursive:true,force:true}));
await build({entryPoints:['src/csv.ts'],outfile:join(folder,'csv.mjs'),bundle:true,platform:'node',format:'esm'});
const {parseCsv,writeCsv,CSV_MAX_BYTES}=await import(pathToFileURL(join(folder,'csv.mjs')));
const preview=(f,source,mapping)=>f.message('csv-preview',{source,mapping,revision:1});
const saved=f=>JSON.parse(JSON.parse(f.page.getPluginData('cardsData')));
function artwork(f,name='dragon.png',parent) {
  const board=parent??new f.Shape(); if(!parent)board.name='Artwork';
  const image=new f.Shape('rectangle');image.name=name; image.fills=[{fillImage:{id:'media-'+image.id}}];board.appendChild(image);return image;
}
function imageField(f) {const field=new f.Shape('rectangle');field.name='#art';field.fills=[{fillImage:{id:'placeholder'}}];f.front.appendChild(field);return field;}

test('CSV preview and apply work in the controller without TextEncoder',()=>{
 const f=fixture();const result=preview(f,'card_id,name\n001,"Queen, 火 🃏"');
 assert.equal(result.type,'CSV_PREVIEW');assert.equal(result.data.errors.length,0);
 f.message('csv-apply',result.data.token);
 assert.deepEqual(saved(f),[{card_id:'001','#name':'Queen, 火 🃏',quantity:'1'}]);
});

test('CSV byte limit counts ASCII, Unicode, surrogate pairs and unpaired surrogates',()=>{
 const header='card_id,name\n001,';
 for(const value of ['a','é','火','🃏','\ud800','\udc00']) {
  const bytes=new TextEncoder().encode(value).length;
  const count=Math.floor((CSV_MAX_BYTES-header.length)/bytes);
  const source=header+value.repeat(count)+'a'.repeat((CSV_MAX_BYTES-header.length)%bytes);
  assert.equal(new TextEncoder().encode(source).length,CSV_MAX_BYTES);
  assert.equal(parseCsv(source).rows.length,1);
  assert.throws(()=>parseCsv(source+'a'),/2 MiB/);
 }
});

test('CSV parses BOM, commas, CRLF, multiline Unicode and escaped quotes without changing IDs',()=>{
 const table=parseCsv('\uFEFFcard_id,name,rules\r\n001,"Queen, red","First line\r\nSecond ""quoted"" line: 火"\r\n');
 assert.deepEqual(table.headers,['card_id','name','rules']);assert.equal(table.rows[0].values[0],'001');
 assert.equal(table.rows[0].values[2],'First line\nSecond "quoted" line: 火');
 assert.deepEqual(parseCsv(writeCsv(table.headers,table.rows.map(r=>r.values))).rows[0].values,table.rows[0].values);
});

test('export retains the artwork name after replacing the image fill', () => {
  const f=fixture(); imageField(f); const image=artwork(f);
  const result=preview(f,'card_id,art\n001,dragon.png'); f.message('csv-apply',result.data.token);
  image.fills=[{fillImage:{id:'replacement-media'}}];
  const exported=f.message('csv-export',null);
  assert.equal(parseCsv(exported.data).rows[0].values[2],'Artwork/dragon.png');
});

test('failed restoration rolls back dataset, mappings, settings and backup', () => {
  const f=fixture(); let result=preview(f,'card_id,name\n001,Original'); f.message('csv-apply',result.data.token);
  result=preview(f,'card_id,name\n001,Updated'); f.message('csv-apply',result.data.token);
  const keys=['cardsData','csv-import-metadata','outputSettings','csv-import-backup'];
  const before=keys.map(key=>f.page.getPluginData(key)); const write=f.page.setPluginData; let fail=true;
  f.page.setPluginData=(key,value)=>{if(key==='outputSettings' && fail){fail=false;throw new Error('Injected write failure');}write(key,value);};
  f.message('csv-restore',null); assert.equal(f.messages.at(-1).type,'CSV_ERROR');
  assert.deepEqual(keys.map(key=>f.page.getPluginData(key)),before);
});
for(const source of ['', 'card_id,name\n', 'card_id,Name,name\n1,a,b', 'card_id,\n1,b', 'card_id,name\n1,b,c', 'card_id,name\n1,"open', 'card_id,name\n1,b"ad', 'card_id,name\n1,"ok"bad']) {
 test(`malformed CSV is rejected: ${JSON.stringify(source)}`,()=>assert.throws(()=>parseCsv(source)));
}

test('preview leaves saved cards intact; apply stores IDs, quantities, and editable fields',()=>{
 const f=fixture();f.message('save-cards-data',JSON.stringify([{'#name':'Original'}]));const before=f.page.getPluginData('cardsData');
 const result=preview(f,'card_id,quantity,name\n001,3,Queen\n002,0,Joker');
 assert.equal(result.type,'CSV_PREVIEW');assert.deepEqual(Array.from(result.data.errors),[]);assert.equal(result.data.copies,3);
 assert.equal(f.page.getPluginData('cardsData'),before);
 f.message('csv-apply',result.data.token);assert.deepEqual(saved(f),[{card_id:'001',quantity:'3','#name':'Queen'},{card_id:'002',quantity:'0','#name':'Joker'}]);
 assert.equal(f.page.getPluginData('csv-output-stale'),'true');
 f.forge('fronts-9',saved(f),{paper:'letter'});assert.equal(f.output().children[0].children.length,3);
 f.forge('fronts-single',saved(f));assert.equal(f.output().children.length,1);
});

test('column mapping supports renamed headers and explicit ignoring',()=>{
 const f=fixture();const result=preview(f,'ID,Title,Ignore me\n001,Hello,unused',{ID:'card_id',Title:'#name','Ignore me':''});
 assert.equal(result.data.errors.length,0);f.message('csv-apply',result.data.token);assert.equal(saved(f)[0]['#name'],'Hello');
 const next=preview(f,'ID,Title,Ignore me\n001,Updated,unused');assert.equal(next.data.mapping.Title,'#name');assert.equal(next.data.changed,1);
});
for(const [source,match] of [
 ['name\nQueen',/ID/],['card_id,name\n001,A\n001,B',/duplicate/],['card_id,name\n ,A',/required/],
 ['card_id,quantity,name\n001,,A',/quantity/],['card_id,quantity,name\n001,-1,A',/quantity/],
 ['card_id,quantity,name\n001,1.5,A',/quantity/],['card_id,quantity,name\n001,101,A',/100/]
])test(`validation blocks invalid records: ${source}`,()=>{const f=fixture();const result=preview(f,source);assert.match(result.data.errors.join('\n'),match);f.message('csv-apply',result.data.token);assert.equal(f.page.getPluginData('cardsData'),'');});

test('missing and ambiguous image names block import; full paths resolve duplicates',()=>{
 const f=fixture();imageField(f);const first=artwork(f);const container=first.parent;const group=new f.Shape();group.name='alternate';container.appendChild(group);artwork(f,'dragon.png',group);
 let result=preview(f,'card_id,name,art\n001,A,missing.png');assert.match(result.data.errors.join('\n'),/missing image/);
 result=preview(f,'card_id,name,art\n001,A,dragon.png');assert.match(result.data.errors.join('\n'),/multiple images/);
 result=preview(f,'card_id,name,art\n001,A,Artwork/alternate/dragon.png');assert.equal(result.data.errors.length,0);assert.equal(result.data.artworkMatches,1);
 f.message('csv-apply',result.data.token);f.forge('fronts-single',saved(f));assert.equal(f.output().children[0].children.find(shape=>shape.name==='#art').fills[0].fillImage.id,group.children[0].fills[0].fillImage.id);
});

test('CSV image filenames match Artwork layers with omitted extensions',()=>{
 const f=fixture();imageField(f);const image=artwork(f,'spade-ace');
 const result=preview(f,'card_id,art\n001,spade-ace.png');
 assert.equal(result.data.errors.length,0);assert.equal(result.data.artworkMatches,1);
 f.message('csv-apply',result.data.token);
 assert.equal(saved(f)[0]['#art'].split('|')[0],image.id);
});

test('blank mapped image clears artwork while unmapped fields retain the template',()=>{
 const f=fixture();imageField(f);let result=preview(f,'card_id,art\n001,');f.message('csv-apply',result.data.token);
 f.forge('fronts-single',saved(f));assert.equal(f.output().children[0].children.find(s=>s.name==='#art').fills.length,0);assert.equal(f.output().children[0].children.find(s=>s.name==='#name').characters,'Template name');
});

test('deck, page, and artwork changes invalidate an apply token',()=>{
 const f=fixture();const source='card_id,name\n001,A';let result=preview(f,source);
 f.message('save-cards-data',JSON.stringify([{'#name':'Manual edit'}]));f.message('csv-apply',result.data.token);assert.equal(f.messages.at(-1).type,'CSV_ERROR');assert.equal(saved(f)[0]['#name'],'Manual edit');
 result=preview(f,source);f.page.id='page-2';f.message('csv-apply',result.data.token);assert.equal(f.messages.at(-1).type,'CSV_ERROR');
 result=preview(f,source);artwork(f);f.message('csv-apply',result.data.token);assert.equal(f.messages.at(-1).type,'CSV_ERROR');
});

test('reimport reports added/changed/removed and restoration recovers data and settings',()=>{
 const f=fixture();f.page.setPluginData('outputSettings',JSON.stringify({type:'fronts-9',paper:'letter'}));
 let result=preview(f,'card_id,name\n001,A\n002,B');f.message('csv-apply',result.data.token);
 result=preview(f,'card_id,name\n001,Updated\n003,C');assert.equal(result.data.added,1);assert.equal(result.data.changed,1);assert.equal(result.data.removed,1);f.message('csv-apply',result.data.token);
 f.page.setPluginData('outputSettings','changed');f.message('csv-restore',null);assert.equal(saved(f)[0]['#name'],'A');assert.equal(saved(f)[1].card_id,'002');assert.match(f.page.getPluginData('outputSettings'),/fronts-9/);
 const exported=f.message('csv-export',null);assert.equal(exported.type,'CSV_EXPORT');assert.equal(parseCsv(exported.data).rows[0].values[0],'001');
});

test('renamed mapped field prevents generation until explicit remapping',()=>{
 const f=fixture();let result=preview(f,'card_id,name\n001,A');f.message('csv-apply',result.data.token);f.forge('fronts-single',saved(f));const old=f.output();
 f.front.children[0].name='#title';f.forge('fronts-single',saved(f));assert.equal(f.output(),old);assert.match(f.messages.at(-1).data,/changed since CSV import/);
 result=preview(f,'card_id,name\n001,A');assert.ok(result.data.errors.length);
 result=preview(f,'card_id,name\n001,A',{card_id:'card_id',name:'#title'});assert.equal(result.data.errors.length,0);
});

test('all-zero quantities retain old output, and large imports are blocked',()=>{
 const f=fixture();f.forge('fronts-single',[{'#name':'Original'}]);const old=f.output();
 let result=preview(f,'card_id,quantity,name\n001,0,A');f.message('csv-apply',result.data.token);f.forge('fronts-9',saved(f));assert.equal(f.output(),old);assert.match(f.messages.at(-1).data,/All quantities are zero/);
 result=preview(f,'card_id,quantity,name\n'+Array.from({length:11},(_,i)=>`${i},100,A`).join('\n'));assert.match(result.data.errors.join('\n'),/1,000/);
 assert.throws(()=>parseCsv('card_id\n'+Array.from({length:501},(_,i)=>i).join('\n')),/500/);
});

test('new decks create visible Artwork; legacy _Images resolves existing references',async()=>{
 const f=fixture();const image=artwork(f);image.parent.name='_Images';image.parent.hidden=true;imageField(f);
 const result=preview(f,'card_id,art\n001,dragon.png');assert.equal(result.data.errors.length,0);
 f.createDeck();await new Promise(resolve=>setImmediate(resolve));const boards=f.page.findShapes({name:'Artwork',type:'board'});assert.equal(boards.length,1);assert.equal(boards[0].hidden,false);
});

test('sheet PDF accepts the unexpanded imported dataset',async()=>{
 const f=fixture();const result=preview(f,'card_id,quantity,name\n001,7,A');f.message('csv-apply',result.data.token);const cards=saved(f);
 f.forge('fronts-6',cards);await f.exportPdf('fronts-6',cards);assert.equal(f.messages.at(-1).type,'FRONT_PDF_IMAGES');assert.equal(f.messages.at(-1).data.pages.length,2);
});

test('a fully blank CSV data row is validated rather than silently discarded',()=>{
 const f=fixture();const result=preview(f,'card_id,name\n001,A\n,');assert.match(result.data.errors.join('\n'),/Row 3.*required/);
});

test('deleted artwork blocks legacy output replacement after CSV import',()=>{
 const f=fixture({back:true});imageField(f);const image=artwork(f);const result=preview(f,'card_id,name,art\n001,A,dragon.png');f.message('csv-apply',result.data.token);
 const old=new f.Shape();old.name='Output';image.remove();f.forge('standard',saved(f));assert.equal(f.page.getShapeById(old.id),old);assert.match(f.messages.at(-1).data,/artwork.*missing/);
});

test('reordering CSV columns does not report unchanged cards as changed',()=>{
 const f=fixture();const result=preview(f,'card_id,name,quantity\n001,A,2');f.message('csv-apply',result.data.token);
 const next=preview(f,'quantity,name,card_id\n2,A,001');assert.equal(next.data.changed,0);
});

test('batch artwork upload preserves filenames and reveals legacy storage without changing IDs',async()=>{
 const f=fixture();const image=artwork(f);const board=image.parent;board.name='_Images';board.hidden=true;
 f.api.uploadMediaData=async name=>({id:'uploaded-'+name,width:100,height:200});
 f.message('upload-artwork',[{name:'new.png',mimeType:'image/png',data:new Uint8Array([1])}]);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.messages.at(-1).type,'ARTWORK_READY');assert.equal(board.name,'Artwork');assert.equal(board.hidden,false);assert.equal(board.children[0].id,image.id);assert.equal(board.children[1].name,'new.png');
});

test('spreadsheet viewing export protects formula text while raw export remains lossless', () => {
  const f = fixture();
  const values = ['=1+1', '+SUM(1)', '-1+1', '@SUM(1)', '\t=1+1', ' =1+1', '＝1+1', 'ordinary, "quoted" text'];
  f.message('save-cards-data', JSON.stringify(values.map(value => ({'#name': value}))));
  const raw = parseCsv(f.message('csv-export', {spreadsheetSafe:false}).data);
  assert.deepEqual(raw.rows.map(row => row.values[2]), values);
  const safe = parseCsv(f.message('csv-export', {spreadsheetSafe:true}).data);
  assert.deepEqual(safe.rows.map(row => row.values[2]), values.map((value, index) => index < values.length-1 ? '\t'+value : value));
});
