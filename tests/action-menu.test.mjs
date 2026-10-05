import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/action-menu.ts'], bundle: true, platform: 'browser', format: 'cjs', write: false });
function fixture() {
  const document = { activeElement: null, listeners: new Map(), addEventListener(type, handler) { this.listeners.set(type, handler); } };
  class Element {
    disabled = false; hidden = false; classes = new Set(); attributes = new Map(); listeners = new Map(); children = [];
    classList = { contains: value => this.classes.has(value) };
    setAttribute(name, value) { this.attributes.set(name, value); }
    addEventListener(type, handler) { const list = this.listeners.get(type) ?? []; list.push(handler); this.listeners.set(type, list); }
    querySelectorAll() { return this.children; }
    contains(target) { return this === target || this.children.includes(target); }
    focus() { document.activeElement = this; }
    event(type, key) { let prevented = false; for (const handler of this.listeners.get(type) ?? []) handler({ key, preventDefault() { prevented = true; } }); return prevented; }
  }
  const trigger = new Element(), menu = new Element(); menu.hidden = true;
  const first = new Element(), disabled = new Element(), hidden = new Element(), last = new Element();
  disabled.disabled = true; hidden.classes.add('hidden'); menu.children = [first, disabled, hidden, last];
  const module = { exports: {} }; vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, document, Node: Element });
  const ui = module.exports.initActionMenu(trigger, menu);
  return { document, trigger, menu, first, last, disabled, Element, ui };
}

test('menu keyboard navigation skips disabled/hidden actions and Escape returns focus', () => {
  const f = fixture(); assert.equal(f.trigger.event('keydown', 'ArrowDown'), true);
  assert.equal(f.menu.hidden, false); assert.equal(f.document.activeElement, f.first);
  assert.equal(f.trigger.attributes.get('aria-expanded'), 'true');
  f.menu.event('keydown', 'ArrowDown'); assert.equal(f.document.activeElement, f.last);
  f.menu.event('keydown', 'ArrowDown'); assert.equal(f.document.activeElement, f.first);
  f.menu.event('keydown', 'End'); assert.equal(f.document.activeElement, f.last);
  f.menu.event('keydown', 'Home'); assert.equal(f.document.activeElement, f.first);
  f.menu.event('keydown', 'Escape'); assert.equal(f.menu.hidden, true);
  assert.equal(f.document.activeElement, f.trigger); assert.equal(f.trigger.attributes.get('aria-expanded'), 'false');
});

test('menu actions keep their handlers and close after selection', () => {
  const f = fixture(); let calls = 0; f.last.addEventListener('click', () => calls++);
  f.trigger.event('click'); f.last.event('click');
  assert.equal(calls, 1); assert.equal(f.menu.hidden, true); assert.equal(f.document.activeElement, f.trigger);
});

test('outside click, Tab, and explicit context cleanup dismiss the menu', () => {
  const f = fixture(); f.trigger.event('click');
  f.document.listeners.get('pointerdown')({ target: f.first }); assert.equal(f.menu.hidden, false);
  f.document.listeners.get('pointerdown')({ target: new f.Element() }); assert.equal(f.menu.hidden, true);
  f.trigger.event('keydown', 'ArrowUp'); assert.equal(f.document.activeElement, f.last);
  f.menu.event('keydown', 'Tab'); assert.equal(f.menu.hidden, true); assert.equal(f.document.activeElement, f.trigger);
  f.trigger.event('click'); f.ui.close(); assert.equal(f.menu.hidden, true);
});
