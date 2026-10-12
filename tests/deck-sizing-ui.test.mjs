import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/deck-sizing-ui.ts'], bundle: true, format: 'cjs', write: false });

test('index defaults stay editable and survive unit changes and switching between index sizes', () => {
  const elements = new Map();
  class Element {
    value = ''; children = []; textContent = ''; listeners = new Map();
    classList = { toggle() {} };
    replaceChildren(...children) { this.children = children; }
    append(child) { this.children.push(child); }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    change(value) { this.value = value; this.listeners.get('change')?.(); }
  }
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('create-deck-orientation').value = 'portrait';
  get('create-deck-style').value = 'title-image';
  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, document: { getElementById: get, createElement: () => new Element() } });
  module.exports.initDeckSizing();
  const size = get('create-deck-size'), style = get('create-deck-style'), orientation = get('create-deck-orientation');
  assert.equal(size.value, '0'); assert.equal(style.value, 'title-image');
  size.change('11'); assert.equal(orientation.value, 'landscape'); assert.equal(style.value, 'blank');
  assert.match(get('create-size-note').textContent, /1500 × 900 px/);
  style.change('ruled'); get('create-deck-units').change('inch');
  assert.match(get('create-size-note').textContent, /5 × 3 in/); assert.equal(style.value, 'ruled');
  orientation.change('portrait'); size.change('12');
  assert.equal(orientation.value, 'portrait'); assert.equal(style.value, 'ruled');
  assert.match(get('create-size-note').textContent, /4 × 6 in/);
  size.change('0'); assert.equal(style.value, 'title-image');
  assert.match(get('create-size-note').textContent, /2.5 × 3.5 in/);
});
