import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const bundle = await build({ entryPoints:['src/selected-layout.ts'], bundle:true, platform:'node', format:'esm', write:false });
const { packSelectedFrames, parseSelectionSettings } = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const unit=300/25.4;
const defaults={paper:'letter',paperOrientation:'auto',allowRotation:true,marginMm:5,gapMm:0,bufferColor:'#000000',cutMarks:true};
const frames=(n,w=1500,h=900)=>Array.from({length:n},(_,i)=>({id:String(i),name:`Card ${i}`,width:w,height:h}));
function safe(layout,input,settings){
  const ids=[];
  for(const cards of layout.pages){
    assert.ok(cards.length);
    for(const c of cards){
      ids.push(c.id); const original=input.find(f=>f.id===c.id);
      assert.equal(c.width,c.rotated?original.height:original.width);assert.equal(c.height,c.rotated?original.width:original.height);
      if(!settings.allowRotation) assert.equal(c.rotated,false);
      const e=0.000001,half=layout.gap/2,margin=settings.marginMm*unit;
      assert.ok(c.x-half>=margin-e);assert.ok(c.y-half>=margin-e);
      assert.ok(c.x+c.width+half<=layout.width-margin+e);assert.ok(c.y+c.height+half<=layout.height-margin+e);
      for(const other of cards) if(other!==c) assert.ok(c.x+c.width+layout.gap<=other.x+e||other.x+other.width+layout.gap<=c.x+e||c.y+c.height+layout.gap<=other.y+e||other.y+other.height+layout.gap<=c.y+e,'frames/buffers overlap');
    }
  }
  assert.deepEqual(ids.sort(),input.map(f=>f.id).sort());
}
test('ten landscape index cards produce three full-size Letter pages',()=>{
  const input=frames(10),s={...defaults,allowRotation:false};const result=packSelectedFrames(input,s);
  assert.deepEqual(result.pages.map(p=>p.length),[4,4,2]);safe(result,input,s);
});
test('rotation is optional and fits frames that otherwise exceed portrait sheet width',()=>{
  const input=frames(1,2900,1000),s={...defaults,paperOrientation:'portrait'};
  assert.throws(()=>packSelectedFrames(input,{...s,allowRotation:false}),/does not fit/);
  const r=packSelectedFrames(input,s);assert.equal(r.pages[0][0].rotated,true);safe(r,input,s);
});
test('mixed sizes use remaining space rather than a largest-card grid',()=>{
  const input=[...frames(1,1500,2400),{id:'small',name:'Small',width:900,height:900}];const r=packSelectedFrames(input,defaults);
  assert.equal(r.pages.length,1);safe(r,input,defaults);
});
test('exact-fit millimeter cards and colored halos respect print margins',()=>{
  const input=frames(16,45*unit,60*unit),s={...defaults,paper:'a4',paperOrientation:'portrait',gapMm:5};const r=packSelectedFrames(input,s);
  assert.equal(r.pages.length,1);safe(r,input,s);
});
test('bounded mixed-size cases preserve every card without overlap or scaling',()=>{
  let seed=12; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let n=0;n<20;n++){
    const input=Array.from({length:30},(_,i)=>({id:String(i),name:`Card ${i}`,width:200+Math.floor(random()*1300),height:200+Math.floor(random()*1500)}));
    const s={...defaults,paper:n%2?'a4':'letter',allowRotation:!!(n%3),gapMm:n%11};const r=packSelectedFrames(input,s);safe(r,input,s);
    assert.deepEqual(packSelectedFrames(input,s),r,'packing must be deterministic');
  }
});
test('selection and settings boundaries reject invalid inputs',()=>{
  assert.throws(()=>packSelectedFrames([],defaults),/Select between/);
  assert.throws(()=>packSelectedFrames(frames(501),defaults),/Select between/);
  assert.throws(()=>packSelectedFrames([{id:'a',name:'Huge',width:10000,height:10000}],defaults),/Huge.*does not fit/);
  assert.throws(()=>packSelectedFrames([{id:'a',name:'Broken',width:NaN,height:100}],defaults),/invalid dimensions/);
  for(const change of [{marginMm:NaN},{marginMm:-1},{marginMm:51},{gapMm:NaN},{gapMm:11},{gapMm:-1},{bufferColor:'red'},{allowRotation:'true'},{paper:'a3'},{paperOrientation:'sideways'}]) assert.throws(()=>parseSelectionSettings({...defaults,...change}));
});

test('page margins change capacity while keeping frames and colored buffers inside the printable area',()=>{
 const input=frames(4,1500,900),small={...defaults,marginMm:0},large={...defaults,marginMm:50,gapMm:2};
 const a=packSelectedFrames(input,small),b=packSelectedFrames(input,large);
 assert.equal(a.pages.length,1);assert.equal(b.pages.length,4);safe(a,input,small);safe(b,input,large);
 const edge=frames(1,2550,3300);assert.equal(packSelectedFrames(edge,small).pages.length,1);
 assert.throws(()=>packSelectedFrames(edge,defaults),/5 mm margins/);
});
