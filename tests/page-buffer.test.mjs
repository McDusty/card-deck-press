import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';
const unit = 300 / 25.4;
const cards = [{ '#name': 'Buffered', quantity: '10' }];
const settings = { paper: 'a4', gapMm: 2, bufferColor: '#123456', cutMarks: true };
const near = (a, b) => assert.ok(Math.abs(a-b) < 0.001, `${a} != ${b}`);

for (const mode of ['fronts-auto', 'backs-auto', 'fronts-9']) {
  test(`${mode}: buffers, paired cuts, physical card sizes and PDF settings agree`, async () => {
    const f = fixture({ back: true, height: 1050 });
    f.forge(mode, cards, settings);
    const output = mode.startsWith('backs') ? f.backOutput() : f.output();
    assert.ok(output, JSON.stringify(f.messages.at(-1)));
    assert.equal(output.children.length, 2);
    for (const [index, sheet] of output.children.entries()) {
      const deck = sheet.children.filter(s => s.type === 'board');
      const buffers = sheet.children.filter(s => s.name === 'Cutting buffer');
      assert.equal(deck.length, index ? 1 : 9);
      assert.equal(buffers.length, deck.length * 4);
      for (const card of deck) { assert.equal(card.width, 750); assert.equal(card.height, 1050); }
      if (!index) { near(deck[1].x - deck[0].x - 750, 2 * unit); near(deck[3].y - deck[0].y - 1050, 2 * unit); }
      for (const strip of buffers) {
        assert.equal(strip.fills[0].fillColor, '#123456');
        assert.ok(strip.x >= sheet.x + 5 * unit - 0.001);
        assert.ok(strip.y >= sheet.y + 5 * unit - 0.001);
        assert.ok(strip.x + strip.width <= sheet.x + sheet.width - 5 * unit + 0.001);
        assert.ok(strip.y + strip.height <= sheet.y + sheet.height - 5 * unit + 0.001);
        for (const card of deck) {
          const overlapX = Math.min(strip.x + strip.width, card.x + card.width) - Math.max(strip.x, card.x);
          const overlapY = Math.min(strip.y + strip.height, card.y + card.height) - Math.max(strip.y, card.y);
          assert.ok(overlapX <= 0.001 || overlapY <= 0.001, 'buffer must not cover card artwork');
        }
      }
      const marks = sheet.children.filter(s => s.name === 'Cut line');
      assert.equal(marks.length, index ? 4 : 12);
      for (const card of deck) for (const edge of [card.x, card.x + card.width]) {
        assert.ok(marks.some(m => m.width < m.height && Math.abs(m.x + m.width / 2 - edge) < 0.001));
      }
    }
    f.reopenSettings(); assert.equal(f.messages.at(-1).data.gapMm, 2); assert.equal(f.messages.at(-1).data.bufferColor, '#123456');
    await f.exportPdf(mode, cards, settings); assert.ok(f.messages.some(m => m.type === 'FRONT_PDF_IMAGES'));
    for (const changed of [{gapMm: 3}, {bufferColor: '#000000'}]) {
      await f.exportPdf(mode, cards, { ...settings, ...changed });
      assert.equal(f.messages.at(-1).type, 'PDF_EXPORT_ERROR');
    }
  });
}

test('larger spacing reduces capacity and rejects fixed grids without replacing prior output', () => {
  const f = fixture({ height: 1050 });
  f.forge('fronts-auto', cards, { ...settings, gapMm: 10 });
  assert.deepEqual(f.output().children.map(s => s.children.filter(c => c.type === 'board').length), [6, 4]);
  const previous = f.output();
  f.forge('fronts-9', cards, { ...settings, gapMm: 10 });
  assert.equal(f.output(), previous); assert.equal(f.messages.at(-1).type, 'FORGE_ERROR');
});

for (const cutMarks of [false, true]) test(`fold-over buffer preserves joined pairs (cut marks ${cutMarks})`, async () => {
  const f = fixture({ back: true, height: 1050 });
  f.forge('printplay', cards, { ...settings, cutMarks });
  const output = f.page.getShapeById(f.page.getPluginData('legacy-output-current'));
  assert.ok(output, JSON.stringify(f.messages.at(-1)));
  assert.deepEqual(output.children.map(sheet => sheet.children.filter(s => s.type === 'board').length), [4, 4, 2]);
  for (const sheet of output.children) {
    const pairs = sheet.children.filter(s => s.type === 'board');
    const buffers = sheet.children.filter(s => s.name === 'Cutting buffer');
    const marks = sheet.children.filter(s => s.name === 'Cut line');
    assert.equal(buffers.length, 4 * pairs.length);
    assert.equal(marks.length, cutMarks ? pairs.length * 2 + 2 : 0);
    for (const pair of pairs) {
      assert.equal(pair.width, 750); assert.equal(pair.height, 2100);
      const faces = pair.children.filter(s => s.type === 'board');
      assert.equal(faces.length, 2); near(faces[1].y - faces[0].y, 1050);
      if (cutMarks) {
        for (const edge of [pair.x, pair.x + pair.width]) {
          assert.ok(marks.some(m => m.width < m.height && Math.abs(m.x + m.width / 2 - edge) < 0.001));
        }
        for (const edge of [pair.y, pair.y + pair.height]) {
          assert.ok(marks.some(m => m.height < m.width && Math.abs(m.y + m.height / 2 - edge) < 0.001));
        }
        assert.ok(!marks.some(m => m.height < m.width && Math.abs(m.y + m.height / 2 - (pair.y + 1050)) < 0.001), 'the fold must not have a cut line');
      }
    }
    for (let i = 1; i < pairs.length; i++) {
      const left = pairs[i - 1], right = pairs[i];
      near(right.x - left.x - left.width, 2 * unit);
      const rightStrip = buffers.find(s => Math.abs(s.x - left.x - left.width) < 0.001 && s.height === left.height);
      const leftStrip = buffers.find(s => Math.abs(s.x + s.width - right.x) < 0.001 && s.height === right.height);
      assert.ok(rightStrip && leftStrip);
      near(rightStrip.x + rightStrip.width, leftStrip.x);
      assert.equal(rightStrip.fills[0].fillColor, '#123456');
      assert.equal(leftStrip.fills[0].fillColor, '#123456');
    }
    for (const strip of buffers) {
      assert.ok(strip.x >= sheet.x + 5 * unit - 0.001);
      assert.ok(strip.y >= sheet.y + 5 * unit - 0.001);
      assert.ok(strip.x + strip.width <= sheet.x + sheet.width - 5 * unit + 0.001);
      assert.ok(strip.y + strip.height <= sheet.y + sheet.height - 5 * unit + 0.001);
    }
  }
  await f.exportPdf('printplay', cards, {...settings, cutMarks});
  assert.ok(f.messages.some(m => m.type === 'FRONT_PDF_IMAGES'));
});

test('invalid settings leave prior output intact; zero spacing and single cards stay unchanged', () => {
  const f = fixture({ height: 1050 });
  f.forge('fronts-9', cards); const previous = f.output();
  for (const input of [{gapMm: -1}, {gapMm: 11}, {gapMm: NaN}, {gapMm: '2'}, {bufferColor: 'red'}]) {
    f.forge('fronts-9', cards, input); assert.equal(f.output(), previous); assert.equal(f.messages.at(-1).type, 'FORGE_ERROR');
  }
  assert.equal(previous.children[0].children.some(s => s.name === 'Cutting buffer'), false);
  f.forge('fronts-single', cards, { gapMm: 2, bufferColor: '#000000' });
  assert.equal(f.output().children.length, 1); assert.equal(f.output().children[0].width, 750);
  f.reopenSettings(); assert.equal(f.messages.at(-1).data.gapMm, 0);
});
