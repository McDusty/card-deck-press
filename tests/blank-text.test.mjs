import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';

const walk = shape => [shape, ...(shape.children ?? []).flatMap(walk)];
for (const mode of ['fronts-single', 'fronts-auto', 'standard', 'printplay', 'tabletop']) {
  test(`${mode}: blank tarot text generates without retaining placeholder text or changing saved rows`, () => {
    const f = fixture({ back: true, width: 900, height: 1500 });
    const cards = [{ '#name': '', quantity: '1' }, { '#name': 'The Fool\n0', quantity: '1' }];
    f.message('save-cards-data', JSON.stringify(cards));
    f.forge(mode, cards, { paper: 'letter' });
    const output = mode.startsWith('fronts-') ? f.output() : f.page.getShapeById(f.page.getPluginData('legacy-output-current'));
    assert.ok(output, JSON.stringify(f.messages.at(-1)));
    const texts = walk(output).filter(s => s.type === 'text' && s.name === '#name');
    assert.equal(texts.length, 2);
    assert.equal(texts[0].characters.trim(), '');
    assert.equal(texts[1].characters, 'The Fool\n0');
    assert.equal(f.front.children[0].characters, 'Template name');
    assert.deepEqual(JSON.parse(JSON.parse(f.page.getPluginData('cardsData'))), cards);
    const csv = f.message('csv-export', null);
    assert.equal(csv.type, 'CSV_EXPORT');
    assert.match(csv.data, /manual-1,1,\r\n/);
  });
}

test('missing fields preserve template text, whitespace is preserved, and unexpected API errors identify the field', () => {
  const f = fixture();
  f.forge('fronts-single', [{ quantity: '1' }, { '#name': '  ' }]);
  const texts = walk(f.output()).filter(s => s.type === 'text');
  assert.deepEqual(texts.map(s => s.characters), ['Template name', '  ']);
  const previous = f.output();
  const descriptor = Object.getOwnPropertyDescriptor(f.Shape.prototype, 'characters');
  Object.defineProperty(f.Shape.prototype, 'characters', { ...descriptor, set(value) {
    if (value === 'Rejected') throw new Error('Simulated text failure');
    descriptor.set.call(this, value);
  } });
  f.forge('fronts-single', [{ '#name': 'Rejected' }]);
  assert.equal(f.output(), previous);
  assert.match(f.messages.at(-1).data, /Could not update #name on .*Simulated text failure/);
});
