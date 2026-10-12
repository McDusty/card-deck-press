import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/front-layout.ts'], bundle: true, format: 'esm', write: false });
const { calculateFrontLayout, CANVAS_UNITS_PER_MM } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const px = mm => mm * CANVAS_UNITS_PER_MM;

for (const orientation of ['portrait', 'auto']) {
  test(`exact-width buffered custom cards fit A4 with ${orientation} orientation`, () => {
    const layout = calculateFrontLayout('fronts-auto', px(45), px(60), 17, 'a4', orientation, 5);
    assert.equal(layout.columns, 4);
    assert.equal(layout.rows, 4);
    assert.equal(layout.pageCount, 2);
    assert.ok(Math.abs(layout.startX - layout.gap / 2 - layout.margin) < 1e-7);
  });

  test(`exact-height buffered custom cards fit A4 with ${orientation} orientation`, () => {
    const layout = calculateFrontLayout('fronts-auto', px(40), px(282), 5, 'a4', orientation, 5);
    assert.equal(layout.columns, 4);
    assert.equal(layout.rows, 1);
    assert.equal(layout.pageCount, 2);
  });
}

test('fixed grids fit when card spacing exactly fills the printable width', () => {
  const layout = calculateFrontLayout('fronts-6', px(95), px(80), 6, 'a4', 'portrait', 5);
  assert.equal(layout.perPage, 6);
  assert.equal(layout.pageCount, 1);
});

test('real overflow still reduces automatic capacity and rejects fixed grids', () => {
  const automatic = calculateFrontLayout('fronts-auto', px(45) + 0.001, px(60), 16, 'a4', 'portrait', 5);
  assert.equal(automatic.columns, 3);
  assert.equal(automatic.pageCount, 2);
  assert.throws(() => calculateFrontLayout('fronts-6', px(95) + 0.001, px(80), 6, 'a4', 'portrait', 5), /do not fit/);
  assert.throws(() => calculateFrontLayout('fronts-auto', px(40), px(282) + 0.001, 1, 'a4', 'portrait', 5), /does not fit/);
});
