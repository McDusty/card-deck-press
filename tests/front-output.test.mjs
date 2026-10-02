import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';

// Run the built controller through its public message interface. The fake API
// models absolute canvas coordinates, reparenting, cloning, and plugin metadata.

const deck = count => Array.from({ length: count }, (_, i) => ({ '#name': `Card ${i + 1}` }));
function walk(shape) { return [shape, ...(shape.children ?? []).flatMap(walk)]; }

for (const [mode, perPage, counts] of [['fronts-6', 6, [6, 6, 6, 6, 6, 6, 6, 6, 4]], ['fronts-9', 9, [9, 9, 9, 9, 9, 7]]]) {
  test(`${mode}: 52 ordered fronts, incomplete final sheet, no Back template`, () => {
    const f = fixture();
    f.forge(mode, deck(52));
    assert.equal(f.messages.at(-1).type, 'FRONT_OUTPUT_READY');
    assert.equal(f.wasClosed(), false);
    const output = f.output();
    assert.deepEqual(output.children.map(page => page.children.length), counts);
    assert.deepEqual(walk(output).filter(shape => shape.type === 'text').map(shape => shape.characters), deck(52).map(card => card['#name']));
    assert.equal(walk(output).some(shape => shape.name === 'Back'), false);
    const first = output.children[0];
    for (const [i, card] of first.children.entries()) {
      assert.equal(card.width, f.front.width);
      assert.equal(card.height, f.front.height);
      assert.ok(card.x >= first.x && card.x + card.width <= first.x + first.width);
      assert.ok(card.y >= first.y && card.y + card.height <= first.y + first.height);
      const columns = perPage / 3;
      if (i >= columns) assert.ok(card.y > first.children[i - columns].y);
    }
    assert.equal(f.front.children[0].characters, 'Template name');
  });
}

test('single fronts retain template dimensions and data, with no back board', () => {
  const f = fixture();
  f.forge('fronts-single', deck(3));
  assert.equal(f.output().children.length, 3);
  assert.deepEqual(f.output().children.map(shape => [shape.width, shape.height]), [[750, 1039], [750, 1039], [750, 1039]]);
  assert.deepEqual(walk(f.output()).filter(shape => shape.type === 'text').map(shape => shape.characters), ['Card 1', 'Card 2', 'Card 3']);
});

test('regeneration replaces renamed owned output, while unrelated Output boards survive', () => {
  const f = fixture();
  const unrelated = new f.Shape();
  unrelated.name = 'Output';
  const unrelatedFronts = new f.Shape();
  unrelatedFronts.name = 'Fronts Output';
  f.forge('fronts-6', deck(7));
  const old = f.output();
  old.name = 'My renamed generated deck';
  const oldPosition = [old.x, old.y];
  f.forge('fronts-9', [{ '#name': 'Updated' }]);
  assert.equal(f.page.getShapeById(old.id), null);
  assert.equal(f.page.getShapeById(unrelated.id), unrelated);
  assert.equal(f.page.getShapeById(unrelatedFronts.id), unrelatedFronts);
  assert.deepEqual([f.output().x, f.output().y], oldPosition);
  assert.equal(f.output().children.length, 1);
  assert.equal(walk(f.output()).filter(shape => shape.type === 'text')[0].characters, 'Updated');
});

test('clone failure keeps previous output and removes staged cards', () => {
  const f = fixture();
  f.forge('fronts-6', deck(2));
  const old = f.output();
  const before = [...f.shapes.keys()];
  f.failSecondClone();
  f.forge('fronts-9', deck(3));
  assert.equal(f.output(), old);
  assert.deepEqual([...f.shapes.keys()], before);
  assert.equal(f.messages.at(-1).type, 'FORGE_ERROR');
  assert.equal(f.wasClosed(), false);
});

test('empty deck, invalid request, and unsupported crop marks keep previous output', () => {
  const f = fixture();
  f.forge('fronts-single', deck(1));
  const old = f.output();
  for (const [type, cards, extra] of [['fronts-6', [], {}], ['unknown', deck(1), {}], ['fronts-9', [{ '#name': 12 }], {}], ['fronts-single', deck(1), { cutMarks: true }]]) {
    f.forge(type, cards, extra);
    assert.equal(f.output(), old);
    assert.equal(f.messages.at(-1).type, 'FORGE_ERROR');
  }
});

test('impossible A4 and Letter layouts fail without shrinking or replacing output', () => {
  const f = fixture({ height: 1100 });
  f.forge('fronts-9', deck(9));
  const old = f.output();
  f.forge('fronts-9', deck(9), { paper: 'letter' });
  assert.equal(f.output(), old);
  assert.match(f.messages.at(-1).data, /do not fit on US Letter/);
  f.front.resize(1600, 1800);
  f.forge('fronts-6', deck(6));
  assert.equal(f.output(), old);
  assert.match(f.messages.at(-1).data, /do not fit on A4/);
  assert.equal(f.front.width, 1600);
});

test('copied page identity cannot replace source-owned output', () => {
  const f = fixture();
  f.forge('fronts-single', deck(1));
  const old = f.output();
  f.page.id = 'copied-page';
  f.forge('fronts-single', deck(2));
  assert.equal(f.page.getShapeById(old.id), old);
  assert.notEqual(f.output().id, old.id);
});

test('output choices persist and can be reloaded', () => {
  const f = fixture();
  f.forge('fronts-6', deck(2), { paper: 'letter' });
  f.reopenSettings();
  assert.equal(f.messages.at(-1).type, 'OUTPUT_SETTINGS');
  assert.equal(f.messages.at(-1).data.type, 'fronts-6');
  assert.equal(f.messages.at(-1).data.paper, 'letter');
});

test('missing image stops generation before touching completed output', () => {
  const f = fixture();
  const artwork = new f.Shape('rectangle');
  artwork.name = '#art';
  artwork.fills = [{ fillImage: { id: 'media' } }];
  f.front.appendChild(artwork);
  f.forge('fronts-single', deck(1));
  const old = f.output();
  f.forge('fronts-single', [{ '#art': 'deleted|media' }]);
  assert.equal(f.output(), old);
  assert.match(f.messages.at(-1).data, /Card 1.*#art.*missing/);
});

for (const mode of ['standard', 'printplay', 'tabletop']) {
  test(`existing ${mode} layout still generates with a Back template`, () => {
    const f = fixture({ back: true });
    f.forge(mode, deck(2));
    assert.equal(f.messages.length, 0);
    assert.equal(f.wasClosed(), true);
    assert.equal(f.page.findShapes({ name: 'Output', type: 'board' }).length, 1);
  });
}

test('fronts-and-backs layout reports missing Back without deleting old Output', () => {
  const f = fixture();
  const output = new f.Shape();
  output.name = 'Output';
  f.forge('standard', deck(1));
  assert.equal(f.page.getShapeById(output.id), output);
  assert.match(f.messages.at(-1).data, /needs Front and Back/);
});


test('Letter and enabled straight cut lines are sheet defaults', () => {
  const f = fixture();
  f.forge('fronts-9', deck(9), { paper: undefined, cutMarks: undefined });
  const sheet = f.output().children[0];
  assert.ok(Math.abs(sheet.width - 2550) < 0.001);
  assert.ok(Math.abs(sheet.height - 3300) < 0.001);
  const lines = sheet.children.filter(shape => shape.name === 'Cut line');
  assert.equal(lines.length, 8);
  assert.equal(lines.filter(line => line.height / line.width > 100).length, 4);
  assert.equal(lines.filter(line => line.width / line.height > 100).length, 4);
  const cards = sheet.children.filter(shape => shape.type === 'board');
  for (const card of cards) {
    for (const edge of [card.x, card.x + card.width]) assert.ok(lines.some(line => Math.abs(line.x + line.width / 2 - edge) < 0.001 && line.height > 3000));
    for (const edge of [card.y, card.y + card.height]) assert.ok(lines.some(line => Math.abs(line.y + line.height / 2 - edge) < 0.001 && line.width > 2400));
  }
  const dimensions = cards.map(card => [card.x, card.y, card.width, card.height]);
  f.forge('fronts-9', deck(9), { paper: 'letter', cutMarks: false });
  for (const [index, card] of f.output().children[0].children.entries()) {
    for (const [axis, value] of [card.x, card.y, card.width, card.height].entries()) assert.ok(Math.abs(value - dimensions[index][axis]) < 0.001);
  }
});

for (const [mode, counts] of [['backs-6', [6, 6, 1]], ['backs-9', [9, 4]], ['backs-single', [1]]]) {
  test(`${mode}: shared Back works without Front and repeats to the deck count`, () => {
    const f = fixture({ back: true });
    f.front.remove();
    const back = f.page.findShapes({ name: 'Back' })[0];
    const text = new f.Shape('text');
    text.name = '#name';
    text.characters = 'Shared back';
    back.appendChild(text);
    f.forge(mode, deck(13), { paper: 'letter' });
    const output = f.backOutput();
    assert.ok(output);
    const actual = mode === 'backs-single' ? [output.children.length] : output.children.map(sheet => sheet.children.length);
    assert.deepEqual(actual, counts);
    assert.ok(walk(output).filter(shape => shape.type === 'text').every(shape => shape.characters === 'Shared back'));
    assert.equal(f.wasClosed(), mode === 'backs-single');
  });
}

test('fronts and backs replace their own outputs independently', () => {
  const f = fixture({ back: true });
  f.forge('fronts-9', deck(10));
  const fronts = f.output();
  f.forge('backs-9', deck(10));
  const backs = f.backOutput();
  assert.equal(f.output(), fronts);
  f.forge('backs-6', deck(3));
  assert.equal(f.page.getShapeById(backs.id), null);
  assert.equal(f.output(), fronts);
  const newBacks = f.backOutput();
  f.forge('fronts-6', deck(3));
  assert.equal(f.backOutput(), newBacks);
});

for (const mode of ['fronts-6', 'backs-9']) {
  test(`${mode}: PDF export checks settings and template, and reports rendering failures`, async () => {
    const f = fixture({ back: true });
    const cards = deck(10);
    f.forge(mode, cards);
    await f.exportPdf(mode, cards);
    assert.equal(f.messages.at(-1).type, 'FRONT_PDF_IMAGES');
    assert.equal(f.messages.at(-1).data.pages.length, 2);
    await f.exportPdf(mode, deck(1));
    assert.equal(f.messages.at(-1).type, 'PDF_EXPORT_ERROR');
    assert.match(f.messages.at(-1).data, /Forge again/);
    const output = mode.startsWith('backs') ? f.backOutput() : f.output();
    output.children[1].export = async () => { throw new Error('Rendering failure'); };
    const before = f.messages.filter(message => message.type === 'FRONT_PDF_IMAGES').length;
    await f.exportPdf(mode, cards);
    assert.equal(f.messages.at(-1).type, 'PDF_EXPORT_ERROR');
    assert.match(f.messages.at(-1).data, /Sheet 2.*Rendering failure/);
    assert.equal(f.messages.filter(message => message.type === 'FRONT_PDF_IMAGES').length, before);
    assert.equal(f.page.getShapeById(output.id), output);
    const template = f.page.findShapes({ name: mode.startsWith('backs') ? 'Back' : 'Front' })[0];
    template.resize(749, 1039);
    await f.exportPdf(mode, cards);
    assert.match(f.messages.at(-1).data, /Forge again/);
  });
}


for (const orientation of ['portrait','landscape']) {
  test(`new poker deck matches the Affinity reference (${orientation})`, () => {
    const f = fixture();
    f.createDeck(orientation);
    const expected = orientation === 'portrait' ? [750,1050] : [1050,750];
    for (const name of ['Front','Back']) {
      const template = f.page.findShapes({ name, type: 'board' })[0];
      assert.deepEqual([template.width,template.height],expected);
      const inside = template.children[0];
      assert.deepEqual([inside.width,inside.height],expected);
      assert.deepEqual([inside.x,inside.y],[template.x,template.y]);
    }
    assert.equal(f.wasClosed(),true);
  });
}

for (const mode of ['fronts-6','fronts-9','backs-6','backs-9']) {
  test(`${mode}: corrected 750 × 1050 poker cards fit Letter at full size`, () => {
    const f = fixture({back:true,height:1050});
    f.forge(mode,deck(9),{paper:'letter',cutMarks:true});
    const output = mode.startsWith('backs') ? f.backOutput() : f.output();
    assert.ok(output);
    for (const sheet of output.children) {
      for (const card of sheet.children.filter(shape=>shape.type==='board')) {
        assert.deepEqual([card.width,card.height],[750,1050]);
        assert.ok(card.y>=sheet.y+4*300/25.4);
        assert.ok(card.y+card.height<=sheet.y+sheet.height-4*300/25.4);
      }
    }
  });
}


test('nine-up fronts and backs share edges at their exact card dimensions', () => {
  const f = fixture({back:true,height:1050});
  for (const mode of ['fronts-9','backs-9']) {
    f.forge(mode,deck(9),{paper:'letter'});
    const sheet = (mode.startsWith('backs') ? f.backOutput() : f.output()).children[0];
    const cards = sheet.children;
    assert.ok(Math.abs(cards[1].x-cards[0].x-cards[0].width)<0.001);
    assert.ok(Math.abs(cards[3].y-cards[0].y-cards[0].height)<0.001);
    assert.ok(cards[0].y>=sheet.y+5*300/25.4);
    assert.ok(cards[8].y+cards[8].height<=sheet.y+sheet.height-5*300/25.4);
  }
});


for (const orientation of ['portrait', 'landscape']) {
  test(`correct older ${orientation} poker templates and inset borders while preserving artwork`, () => {
    const f = fixture({ back: true, width: orientation === 'portrait' ? 750 : 1039, height: orientation === 'portrait' ? 1039 : 750 });
    const templates = ['Front','Back'].map(name => f.page.findShapes({name,type:'board'})[0]);
    const nestedArtwork = [];
    for (const template of templates) {
      const border = new f.Shape();
      border.name = 'inside';
      border.resize(template.width-48,template.height-48);
      template.appendChild(border);
      border.x = template.x+24;
      border.y = template.y+24;
      const artwork = new f.Shape('text');
      artwork.name = '#description';
      artwork.characters = 'Keep my design';
      artwork.resize(200,80);
      border.appendChild(artwork);
      artwork.x = template.x+100;
      artwork.y = template.y+120;
      nestedArtwork.push([artwork,artwork.x,artwork.y]);
    }
    const oldInfo = f.templateSize();
    assert.equal(oldInfo.canCorrectPoker,true);
    assert.equal(oldInfo.templates[0].height,orientation==='portrait'?1039:750);
    const mode = orientation === 'portrait' ? 'fronts-9' : 'fronts-single';
    f.forge(mode,deck(9),{paper:'letter'});
    const oldOutput = f.output();
    f.correctPokerSize();
    assert.equal(f.messages.at(-1).type,'POKER_SIZE_CORRECTED');
    const expected = orientation === 'portrait' ? [750,1050] : [1050,750];
    for (const template of templates) {
      assert.deepEqual([template.width,template.height],expected);
      const border = template.children.find(shape=>shape.name==='inside');
      assert.deepEqual([border.width,border.height],expected);
      assert.deepEqual([border.x,border.y],[template.x,template.y]);
    }
    for (const [artwork,x,y] of nestedArtwork) {
      assert.deepEqual([artwork.x,artwork.y,artwork.width,artwork.height],[x,y,200,80]);
      assert.equal(artwork.characters,'Keep my design');
    }
    assert.equal(f.page.getShapeById(oldOutput.id),oldOutput);
    assert.equal(f.templateSize().canCorrectPoker,false);
    assert.equal(f.undoBlocks.length,2);
    assert.equal(f.undoBlocks[0][1],f.undoBlocks[1][1]);
    f.forge(mode,deck(9),{paper:'letter'});
    assert.equal(f.page.getShapeById(oldOutput.id),null);
    const cards = mode === 'fronts-single' ? f.output().children : f.output().children[0].children;
    assert.ok(cards.every(card=>card.width===expected[0]&&card.height===expected[1]));
  });
}

test('already resized poker boards can correct the older inset border', () => {
  const f = fixture({height:1050});
  const border = new f.Shape();
  border.name='inside'; border.resize(702,991); f.front.appendChild(border);
  border.x=f.front.x+24; border.y=f.front.y+24;
  f.correctPokerSize();
  assert.equal(f.messages.at(-1).type,'POKER_SIZE_CORRECTED');
  assert.deepEqual([border.width,border.height],[750,1050]);
});

test('poker correction leaves custom dimensions and unrelated boards intact', () => {
  const f = fixture({width:900,height:1300});
  const unrelated = new f.Shape(); unrelated.name='Fronts Output'; unrelated.resize(750,1039);
  const before = walk(f.root).map(shape=>[shape.id,shape.x,shape.y,shape.width,shape.height]);
  assert.equal(f.templateSize().canCorrectPoker,false);
  f.correctPokerSize();
  assert.equal(f.messages.at(-1).type,'TEMPLATE_SIZE_ERROR');
  assert.deepEqual(walk(f.root).map(shape=>[shape.id,shape.x,shape.y,shape.width,shape.height]),before);
});

test('duplicate templates block correction before changing either board', () => {
  const f = fixture();
  const duplicate = f.front.clone();
  f.correctPokerSize();
  assert.equal(f.messages.at(-1).type,'TEMPLATE_SIZE_ERROR');
  assert.match(f.messages.at(-1).data,/only one top-level Front/);
  assert.equal(f.front.height,1039);
  assert.equal(duplicate.height,1039);
});

test('failed correction restores template size and finishes its undo block', () => {
  const f = fixture({back:true});
  const back = f.page.findShapes({name:'Back'})[0];
  const resize = back.resize;
  let fail = true;
  back.resize = function(width,height) { if(fail) { fail=false; throw new Error('Resize failed'); } return resize.call(this,width,height); };
  f.correctPokerSize();
  assert.equal(f.messages.at(-1).type,'TEMPLATE_SIZE_ERROR');
  assert.equal(f.front.height,1039);
  assert.equal(back.height,1039);
  assert.equal(f.undoBlocks.length,2);
});


for (const mode of ['fronts-6','fronts-9','backs-6','backs-9']) {
  test(`${mode}: one cut per shared edge without changing card size`, () => {
    const f = fixture({back:true,height:1050});
    f.forge(mode,deck(mode.endsWith('-6') ? 6 : 9),{paper:'letter',cutMarks:true});
    const sheet = (mode.startsWith('backs') ? f.backOutput() : f.output()).children[0];
    const cards = sheet.children.filter(shape=>shape.type==='board');
    const lines = sheet.children.filter(shape=>shape.name==='Cut line');
    const columns = mode.endsWith('-6') ? 2 : 3;
    assert.equal(lines.length,columns+1+4);
    for(let column=1;column<columns;column++) {
      const left = cards[column-1]; const right = cards[column];
      assert.ok(Math.abs(left.x+left.width-right.x)<0.001);
      assert.equal(lines.filter(line=>line.height>line.width && Math.abs(line.x+line.width/2-right.x)<0.001).length,1);
    }
    for(let row=1;row<3;row++) {
      const top = cards[(row-1)*columns]; const bottom = cards[row*columns];
      assert.ok(Math.abs(top.y+top.height-bottom.y)<0.001);
      assert.equal(lines.filter(line=>line.width>line.height && Math.abs(line.y+line.height/2-bottom.y)<0.001).length,1);
    }
    assert.ok(cards.every(card=>card.width===750 && card.height===1050));
  });
}

test('fractional template dimensions do not create duplicate shared cut lines', () => {
  const f = fixture({width:749.1234,height:1049.5678});
  f.forge('fronts-9',deck(9),{paper:'letter',cutMarks:true});
  assert.equal(f.output().children[0].children.filter(shape=>shape.name==='Cut line').length,8);
});
