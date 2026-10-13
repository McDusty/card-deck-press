import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';
import { PDFDocument, PDFName, PDFPage } from 'pdf-lib';
const folder=mkdtempSync(join(tmpdir(),'selected-pdf-'));
after(()=>rmSync(folder,{recursive:true,force:true}));
await build({entryPoints:['src/selected-pdf.ts','src/selected-layout.ts'],outdir:folder,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',plugins:[{name:'shared-pdf-lib',setup(b){b.onResolve({filter:/^pdf-lib$/},()=>({path:join(process.cwd(),'node_modules/pdf-lib/cjs/index.js'),external:true}));}}]});
const {createSelectedPdf}=await import(pathToFileURL(join(folder,'selected-pdf.mjs')));
const {packSelectedFrames}=await import(pathToFileURL(join(folder,'selected-layout.mjs')));
const settings={paper:'letter',paperOrientation:'portrait',allowRotation:true,marginMm:5,gapMm:2,bufferColor:'#123456',cutMarks:true};
function data(frames,changes={}) {const s={...settings,...changes}; return {frames,settings:s,layout:packSelectedFrames(frames,s),images:frames.map(f=>png(f.width,f.height)),token:'test',name:'Test'};}
function png(width, height, shade = 255) {
  function chunk(name, bytes) {
    const type = Buffer.from(name);
    const input = Buffer.concat([type, bytes]);
    let crc = 0xffffffff;
    for (const byte of input) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, input, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height, shade);
  for (let row = 0; row < height; row++) pixels[row * stride] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}


test('selected-frame PDFs have exact Letter/A4 paper sizes and prohibit automatic print scaling',async()=>{
 for(const [paper,points] of [['letter',[612,792]],['a4',[210*72/25.4,297*72/25.4]]]){
  const d=data(Array.from({length:5},(_,i)=>({id:String(i),name:'Card',width:1500,height:900})),{paper});
  const pdf=await PDFDocument.load(await createSelectedPdf(d));assert.equal(pdf.getPageCount(),d.layout.pages.length);
  for(const p of pdf.getPages()){assert.ok(Math.abs(p.getWidth()-points[0])<1e-6);assert.ok(Math.abs(p.getHeight()-points[1])<1e-6);}
  assert.equal(pdf.catalog.lookup(PDFName.of('ViewerPreferences')).get(PDFName.of('PrintScaling')).toString(),'/None');
 }
});
test('rotation preserves physical artwork size and buffer stays outside the card',async()=>{
 const d=data([{id:'a',name:'Wide',width:2900,height:1000}]);const card=d.layout.pages[0][0];assert.equal(card.rotated,true);
 const draw=PDFPage.prototype.drawImage,rect=PDFPage.prototype.drawRectangle;const images=[],rects=[];
 PDFPage.prototype.drawImage=function(img,o){images.push(o);return draw.call(this,img,o);};
 PDFPage.prototype.drawRectangle=function(o){rects.push(o);return rect.call(this,o);};
 try{await createSelectedPdf(d);}finally{PDFPage.prototype.drawImage=draw;PDFPage.prototype.drawRectangle=rect;}
 assert.equal(images.length,1);assert.equal(images[0].width,2900*.24);assert.equal(images[0].height,1000*.24);assert.equal(images[0].rotate.angle,90);
 const x=card.x*.24,y=(d.layout.height-card.y-card.height)*.24,w=card.width*.24,h=card.height*.24;
 assert.equal(images[0].x,x+w);assert.equal(images[0].y,y);assert.equal(rects.length,5);
 for(const r of rects.slice(1)) assert.ok(r.x+r.width<=x+1e-6||r.x>=x+w-1e-6||r.y+r.height<=y+1e-6||r.y>=y+h-1e-6);
});
test('adjacent frames share one trim line, and no lines cross their interiors',async()=>{
 const d=data([{id:'a',name:'A',width:500,height:500},{id:'b',name:'B',width:500,height:500}],{gapMm:0});
 const original=PDFPage.prototype.drawLine,lines=[];PDFPage.prototype.drawLine=function(o){lines.push(o);return original.call(this,o);};
 try{await createSelectedPdf(d);}finally{PDFPage.prototype.drawLine=original;}
 assert.equal(lines.length,5);
 for(const l of lines) for(const c of d.layout.pages[0]){
  const x=c.x*.24,y=(d.layout.height-c.y-c.height)*.24,w=c.width*.24,h=c.height*.24;
  const mx=(l.start.x+l.end.x)/2,my=(l.start.y+l.end.y)/2;
  assert.ok(!(mx>x+1e-6&&mx<x+w-1e-6&&my>y+1e-6&&my<y+h-1e-6));
 }
});
test('bad image bounds and canceled snapshots stop PDF creation',async()=>{
 const d=data([{id:'a',name:'Card',width:100,height:100}]);d.images=[png(1010,100)];
 await assert.rejects(createSelectedPdf(d),/Card.*frame size/);
 d.images=[png(100,100)];await assert.rejects(createSelectedPdf(d,()=>{throw new Error('changed');}),/changed/);
 d.images=[];await assert.rejects(createSelectedPdf(d),/Invalid/);
});
