import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { fixture } from './fixture.mjs';

const folder = mkdtempSync(join(tmpdir(), 'cardforge-manual-'));
after(() => rmSync(folder, { recursive: true, force: true }));
await build({ entryPoints: ['src/manual-cards.ts'], outfile: join(folder, 'manual.mjs'), bundle: true, format: 'esm', platform: 'node' });
const { newManualCard, duplicateManualCard } = await import(pathToFileURL(join(folder, 'manual.mjs')));

test('manual cards start at quantity one without adding Card ID columns', () => {
  const cards = [{ '#name': 'Joker' }];
  assert.deepEqual(newManualCard(cards), { quantity: '1' });
  const copy = duplicateManualCard(cards[0], cards); copy['#name'] = 'Queen';
  assert.deepEqual(cards[0], { '#name': 'Joker' });
  assert.deepEqual(copy, { '#name': 'Queen' });
});

test('manual additions to CSV decks receive unique IDs and quantity one', () => {
  const cards = [{ card_id: '001', quantity: '3' }, { card_id: 'manual' }, { card_id: 'manual-2' }];
  const next = newManualCard(cards);
  assert.deepEqual(next, { card_id: 'manual-3', quantity: '1' });
  cards.push(next);
  assert.equal(newManualCard(cards).card_id, 'manual-4');
});

test('duplicates retain artwork and quantities without duplicating stable IDs', () => {
  const card = { card_id: '001', quantity: '3', '#name': 'Queen', '#art': 'shape|media' };
  const cards = [card, { card_id: '001-copy' }];
  assert.deepEqual(duplicateManualCard(card, cards), { ...card, card_id: '001-copy-2' });
  assert.equal(card.card_id, '001');
});

for (const [mode, counts] of [['fronts-6', [6, 4]], ['fronts-9', [9, 1]]]) {
  test(`${mode}: one manual Healing row generates ten copies`, () => {
    const f = fixture({ height: 1050 });
    const card = { ...newManualCard([]), quantity: '10', '#name': 'Healing' };
    f.forge(mode, [card]);
    assert.equal(f.messages.at(-1).type, 'FRONT_OUTPUT_READY');
    assert.deepEqual(f.output().children.map(page => page.children.length), counts);
    const cards = f.output().children.flatMap(page => page.children);
    assert.deepEqual(cards.map(card => card.children.find(shape => shape.type === 'text').characters), Array(10).fill('Healing'));
  });
}

test('older manual cards without quantity still print once each', () => {
  const f = fixture({ height: 1050 });
  f.forge('fronts-9', [{ '#name': 'Healing' }, { '#name': 'Shield' }]);
  assert.equal(f.messages.at(-1).type, 'FRONT_OUTPUT_READY');
  assert.equal(f.output().children[0].children.length, 2);
});
