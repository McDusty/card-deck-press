import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const board = (f, name) => f.page.findShapes({ name, type: 'board' })[0];
const inside = template => template.children.find(shape => shape.name === 'inside');
const presets = [['11', 3, 5], ['12', 4, 6], ['13', 5, 8]];

for (const [size, short, long] of presets) {
  for (const orientation of ['portrait', 'landscape']) {
    test(`${short} × ${long} index cards: ${orientation} blank templates and single PDFs retain physical size`, async () => {
      const f = fixture(); f.front.remove();
      f.api.uploadMediaData = async () => { throw new Error('Blank cards should not upload placeholder media'); };
      f.message('create-deck', null, { name: 'Index cards', size, orientation }); await tick();
      const dimensions = orientation === 'portrait' ? [short * 300, long * 300] : [long * 300, short * 300];
      for (const name of ['Front', 'Back']) {
        const template = board(f, name), frame = inside(template);
        assert.deepEqual([template.width, template.height], dimensions);
        assert.equal(frame.children.length, 0);
        assert.equal(frame.borderRadius, 0);
        assert.equal(frame.strokes[0].strokeColor, '#000000');
        assert.equal(frame.strokes[0].strokeAlignment, 'inner');
        assert.equal(frame.strokes[0].strokeWidth, 3);
        assert.equal(frame.fills[0].fillColor, '#FFFFFF');
      }
      f.message('load-card-fields', null);
      assert.equal(f.messages.findLast(m => m.type === 'CARD_FIELDS').data.fields.length, 0);
      for (const mode of ['fronts-single', 'backs-single']) {
        const cards = [{ quantity: '10' }]; f.forge(mode, cards);
        const output = mode.startsWith('fronts') ? f.output() : f.backOutput();
        assert.equal(output.children.length, 1);
        await f.exportPdf(mode, cards);
        const pdf = f.messages.findLast(m => m.type === 'FRONT_PDF_IMAGES').data;
        assert.deepEqual(Array.from(pdf.pageSize), dimensions.map(px => px * 72 / 300));
        assert.equal(pdf.landscape, false); // Explicit single-card dimensions already carry orientation.
      }
    });
  }
}

test('ruled templates have editable quarter-inch lines on both sides and no variable placeholders', async () => {
  const f = fixture(); f.front.remove();
  f.message('create-deck', null, { name: 'Notes', size: '11', orientation: 'landscape', templateStyle: 'ruled' }); await tick();
  for (const name of ['Front', 'Back']) {
    const template = board(f, name), lines = inside(template).children;
    assert.ok(lines.length > 5);
    assert.equal(lines[0].name, 'Heading rule');
    for (const [i, line] of lines.entries()) {
      assert.equal(line.type, 'rectangle'); assert.equal(line.name.startsWith('#'), false);
      assert.ok(line.x > template.x && line.x + line.width < template.x + template.width);
      assert.ok(line.y > template.y && line.y + line.height < template.y + template.height);
      if (i) assert.equal(line.y - lines[i - 1].y, 75);
    }
  }
  f.forge('fronts-auto', [{ quantity: '5' }], { paper: 'letter' });
  assert.deepEqual(f.output().children.map(sheet => sheet.children.length), [4, 1]);
  const generated = inside(f.output().children[0].children[0]);
  assert.equal(generated.children.length, inside(board(f, 'Front')).children.length);
  assert.equal(generated.strokes[0].strokeColor, '#000000');
});

for (const [short, long, letterCapacity, a4Capacity] of [[3, 5, 4, 4], [4, 6, 2, 2], [5, 8, 2, 1]]) {
  for (const [paper, orientation] of ['letter', 'a4'].flatMap(paper => ['portrait', 'landscape'].map(orientation => [paper, orientation]))) {
    test(`${short} × ${long}: automatic ${paper} pages with ${orientation} cards fill at full size, with matching backs and PDF orientation`, async () => {
      const dimensions = orientation === 'portrait' ? [short * 300, long * 300] : [long * 300, short * 300];
      const f = fixture({ back: true, width: dimensions[0], height: dimensions[1] });
      const capacity = paper === 'letter' ? letterCapacity : a4Capacity;
      const cards = [{ '#name': 'Notes', quantity: String(capacity + 1) }];
      for (const mode of ['fronts-auto', 'backs-auto']) {
        f.forge(mode, cards, { paper, cutMarks: true });
        const output = mode.startsWith('fronts') ? f.output() : f.backOutput();
        assert.equal(output.children.length, 2);
        for (const [index, sheet] of output.children.entries()) {
          const copies = sheet.children.filter(child => child.type === 'board');
          assert.equal(copies.length, index === 0 ? capacity : 1);
          for (const card of copies) {
            assert.deepEqual([card.width, card.height], dimensions);
            const margin = 5 * 300 / 25.4 - 0.001;
            assert.ok(card.x >= sheet.x + margin && card.y >= sheet.y + margin);
            assert.ok(card.x + card.width <= sheet.x + sheet.width - margin);
            assert.ok(card.y + card.height <= sheet.y + sheet.height - margin);
          }
          const marks = sheet.children.filter(child => child.name === 'Cut line');
          const positions = marks.map(mark => `${mark.x},${mark.y},${mark.width},${mark.height}`);
          assert.ok(marks.length); assert.equal(new Set(positions).size, marks.length);
        }
        await f.exportPdf(mode, cards, { paper, cutMarks: true });
        const pdf = f.messages.findLast(m => m.type === 'FRONT_PDF_IMAGES').data;
        assert.equal(pdf.paper, paper); assert.equal(pdf.pages.length, 2);
        assert.equal(pdf.landscape, output.children[0].width > output.children[0].height);
        assert.equal(pdf.pageSize, undefined);
      }
      assert.equal(f.output().children[0].width, f.backOutput().children[0].width);
      assert.equal(f.output().children[0].height, f.backOutput().children[0].height);
    });
  }
}

test('automatic pages reject oversized cards without shrinking or removing previous output', () => {
  const f = fixture({ width: 1500, height: 2400 });
  f.forge('fronts-auto', [{ '#name': 'Keep' }]); const previous = f.output();
  f.front.resize(3600, 3600);
  f.forge('fronts-auto', [{ '#name': 'Too big' }]);
  assert.equal(f.output(), previous); assert.match(f.messages.at(-1).data, /does not fit/);
  assert.deepEqual([f.front.width, f.front.height], [3600, 3600]);
});

test('invalid template styles and interrupted rule creation leave an empty page unchanged', async () => {
  for (const style of ['invalid', 'ruled']) {
    const f = fixture(); f.front.remove(); f.page.name = 'Original';
    const create = f.api.createRectangle;
    f.api.createRectangle = () => { const line = create(); line.resize = () => { throw new Error('Rule creation failed'); }; return line; };
    f.message('create-deck', null, { name: 'Notes', size: '11', orientation: 'landscape', templateStyle: style }); await tick();
    assert.equal(f.root.children.length, 0); assert.equal(f.page.name, 'Original');
    assert.equal(f.messages.at(-1).type, 'DECK_SIZE_ERROR');
  }
});
