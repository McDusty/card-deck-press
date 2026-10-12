import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'card-layout-choices-'));
after(() => rmSync(dir, { recursive: true, force: true }));
await build({ entryPoints: ['src/layout-choices.ts'], outfile: join(dir, 'choices.mjs'), bundle: true, platform: 'node', format: 'esm' });
const { updateLayoutChoices } = await import(pathToFileURL(join(dir, 'choices.mjs')));
const select = (value = 'fronts-single') => ({ value, options: ['fronts', 'backs'].flatMap(face => ['single', 'auto', '6', '9'].map(suffix => ({ value: `${face}-${suffix}`, hidden: false, disabled: false }))) });
const option = (s, value) => s.options.find(o => o.value === value);
const templates = (width, height) => ['Front', 'Back'].map(name => ({ name, width, height }));

for (const [width, height, capacity] of [[1500, 900, 4], [1800, 1200, 2], [2400, 1500, 2], [900, 1500, 4]]) {
  test(`${width} by ${height} index cards hide grids that do not fit Letter`, () => {
    const s = select();
    updateLayoutChoices(s, templates(width, height), 'letter', 'auto');
    for (const face of ['fronts', 'backs']) {
      for (const n of [6, 9]) { assert.equal(option(s, `${face}-${n}`).hidden, true); assert.equal(option(s, `${face}-${n}`).disabled, true); }
      assert.match(option(s, `${face}-auto`).textContent, new RegExp(`${capacity} per page`));
      assert.equal(option(s, `${face}-single`).disabled, false);
    }
  });
}

test('paper and orientation changes restore eligible grids and preserve the selected face on fallback', () => {
  const s = select('backs-9'); const cards = templates(750, 1050);
  updateLayoutChoices(s, cards, 'letter', 'auto');
  assert.equal(s.value, 'backs-9'); assert.equal(option(s, 'backs-9').hidden, false);
  assert.equal(updateLayoutChoices(s, cards, 'letter', 'landscape'), true);
  assert.equal(s.value, 'backs-auto'); assert.equal(option(s, 'backs-9').hidden, true);
  updateLayoutChoices(s, cards, 'letter', 'portrait');
  assert.equal(option(s, 'backs-9').hidden, false); assert.equal(option(s, 'backs-9').disabled, false);
  const custom = templates(790, 900);
  updateLayoutChoices(s, custom, 'letter', 'auto'); assert.equal(option(s, 'fronts-9').hidden, false);
  updateLayoutChoices(s, custom, 'a4', 'auto'); assert.equal(option(s, 'fronts-9').hidden, true);
});

test('Front and Back use their own dimensions and updated templates recalculate availability', () => {
  const s = select('fronts-9');
  updateLayoutChoices(s, [{ name: 'Front', width: 1500, height: 900 }, { name: 'Back', width: 750, height: 1050 }], 'letter', 'auto');
  assert.equal(s.value, 'fronts-auto'); assert.equal(option(s, 'fronts-9').hidden, true);
  assert.equal(option(s, 'backs-9').hidden, false);
  updateLayoutChoices(s, templates(750, 1050), 'letter', 'auto');
  assert.equal(option(s, 'fronts-9').hidden, false);
});

test('unknown dimensions keep choices available; oversized cards retain single and paper configuration options', () => {
  const s = select(); updateLayoutChoices(s, [], 'letter', 'auto');
  assert.ok(s.options.every(o => !o.disabled));
  updateLayoutChoices(s, templates(4000, 4000), 'letter', 'auto');
  assert.equal(option(s, 'fronts-single').disabled, false);
  assert.equal(option(s, 'fronts-auto').disabled, false);
  assert.equal(option(s, 'fronts-6').hidden, true);
});

test('buffer spacing updates availability and automatic page capacity', () => {
  const s = select('fronts-9');
  updateLayoutChoices(s, templates(750, 1050), 'a4', 'auto', 2);
  assert.equal(option(s, 'fronts-9').hidden, false);
  assert.match(option(s, 'fronts-auto').textContent, /9 per page/);
  updateLayoutChoices(s, templates(750, 1050), 'a4', 'auto', 10);
  assert.equal(option(s, 'fronts-9').hidden, true);
  assert.equal(s.value, 'fronts-auto');
  assert.match(option(s, 'fronts-auto').textContent, /6 per page/);
  updateLayoutChoices(s, templates(750, 1050), 'a4', 'auto', 0);
  assert.equal(option(s, 'fronts-9').hidden, false);
});

test('2 mm spacing reduces Letter poker capacity to eight without shrinking cards', () => {
  const s = select('fronts-9');
  updateLayoutChoices(s, templates(750, 1050), 'letter', 'auto', 2);
  assert.equal(option(s, 'fronts-9').hidden, true);
  assert.match(option(s, 'fronts-auto').textContent, /8 per page/);
});
