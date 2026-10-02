import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { fixture } from './fixture.mjs';

const folder = mkdtempSync(join(tmpdir(), 'cardforge-size-'));
after(() => rmSync(folder, { recursive: true, force: true }));
await build({ entryPoints: ['src/card-sizes.ts'], outfile: join(folder, 'sizes.mjs'), bundle: true, platform: 'node', format: 'esm' });
const { cardPresets, cardSizes, toPixels, fromPixels, formatDimensions, resolveDeckSize } = await import(pathToFileURL(join(folder, 'sizes.mjs')));

test('every preset uses its exact physical dimensions without integer-pixel truncation', () => {
  for (const [index, preset] of cardPresets.entries()) {
    assert.ok(Math.abs(fromPixels(cardSizes[index][1], preset.unit) - preset.width) < 1e-10);
    assert.ok(Math.abs(fromPixels(cardSizes[index][2], preset.unit) - preset.height) < 1e-10);
  }
  assert.deepEqual(resolveDeckSize('3', 'portrait', null), { width: 825, height: 1425 });
  assert.deepEqual(resolveDeckSize('0', 'portrait', null), { width: 750, height: 1050 });
  assert.equal(cardPresets.length, 11);
  assert.deepEqual(cardSizes[4], ['Medium', 735, 1185]);
});

test('new Tarot templates use the printer trim size, without adding upload bleed', async () => {
  const f = fixture(); f.front.remove();
  f.message('create-deck', null, { name: 'Tarot', size: '3', orientation: 'portrait' });
  await new Promise(resolve => setImmediate(resolve));
  for (const name of ['Front', 'Back']) {
    const board = f.page.findShapes({ name })[0]; assert.equal(board.width, 825); assert.equal(board.height, 1425);
  }
});

test('poker units agree at 300 ppi and conversion preserves physical size', () => {
  assert.equal(toPixels(2.5, 'inch'), 750);
  assert.equal(toPixels(3.5, 'inch'), 1050);
  assert.ok(Math.abs(toPixels(63.5, 'mm') - 750) < 1e-10);
  assert.equal(formatDimensions(750, 1050, 'mm'), '63.5 × 88.9 mm');
  for (const unit of ['mm', 'inch', 'px']) assert.ok(Math.abs(toPixels(fromPixels(827, unit), unit) - 827) < 1e-10);
});

test('custom card dimensions honor orientation without rounding pixels', () => {
  assert.deepEqual(resolveDeckSize('custom', 'portrait', { width: 901.25, height: 630.5 }), { width: 630.5, height: 901.25 });
  assert.deepEqual(resolveDeckSize('custom', 'landscape', { width: 630.5, height: 901.25 }), { width: 901.25, height: 630.5 });
});

test('invalid size requests leave an empty page and its name intact', async () => {
  for (const [size, orientation, dimensions] of [['invalid', 'portrait', null], ['99', 'portrait', null], ['7', 'other', null], ['custom', 'portrait', { width: -1, height: 1000 }], ['custom', 'portrait', { width: Infinity, height: 1000 }], ['custom', 'portrait', { width: '750', height: 1050 }], ['custom', 'portrait', { width: 12001, height: 1000 }]]) {
    const f = fixture(); f.front.remove(); f.page.name = 'Untouched';
    f.message('create-deck', dimensions, { name: 'New', size, orientation });
    await new Promise(resolve => setImmediate(resolve));
    const result = f.messages.at(-1);
    assert.equal(result.type, 'DECK_SIZE_ERROR'); assert.equal(f.root.children.length, 0); assert.equal(f.page.name, 'Untouched');
  }
});

test('custom deck creation uses the same dimensions for Front, Back, and borders', async () => {
  const f = fixture(); f.front.remove();
  f.message('create-deck', { width: 600.5, height: 900.25 }, { name: 'Custom', size: 'custom', orientation: 'landscape' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.page.name, 'Custom');
  for (const name of ['Front', 'Back']) {
    const board = f.page.findShapes({ name })[0];
    assert.equal(board.width, 900.25); assert.equal(board.height, 600.5);
    assert.equal(board.children[0].width, board.width); assert.equal(board.children[0].height, board.height);
  }
});

test('oversized custom templates are rejected by nine-up generation without shrinking', () => {
  const f = fixture({ width: 1200, height: 1800 });
  f.forge('fronts-9', [{ '#name': 'Too big' }], { paper: 'letter' });
  assert.equal(f.output(), null); assert.match(f.messages.at(-1).data, /do not fit/);
  assert.equal(f.front.width, 1200); assert.equal(f.front.height, 1800);
});
