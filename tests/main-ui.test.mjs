import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

// Expose setup only; message handling and row event handlers remain the real UI.
const bundle = await build({ entryPoints: ['src/main.ts'], bundle: true, platform: 'browser', format: 'cjs', loader: { '.css': 'empty' }, write: false, footer: { js: 'globalThis.__mainUi = { listen: initMessageListener, localAuthority: () => { rowsReadOnly = false; } };' } });
function fixture() {
  const all = []; const ids = new Map();
  class Element {
    listeners = new Map(); children = []; classes = new Set(); attributes = new Map(); value = ''; textContent = ''; dataset = {}; disabled = false; validity = { valid: true };
    classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), toggle: (name, on) => { const enabled = on ?? !this.classes.has(name); enabled ? this.classes.add(name) : this.classes.delete(name); }, contains: name => this.classes.has(name) || (this.className ?? '').split(' ').includes(name) };
    constructor(tag = 'div') { this.tagName = tag; all.push(this); }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    appendChild(item) { this.children.push(item); item.parent = this; return item; }
    insertBefore(item, before) { const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, item); item.parent = this; }
    remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
    reportValidity() { return true; }
    input(value) { this.value = value; this.valueAsNumber = Number(value); this.listeners.get('input')?.(); }
    focus() {}
  }
  const element = id => { if (!ids.has(id)) ids.set(id, new Element()); return ids.get(id); };
  const document = { documentElement: new Element(), referrer: '', getElementById: element, createElement: tag => new Element(tag), querySelector: () => new Element(), querySelectorAll: selector => all.filter(item => !item.removed && selector.startsWith('.') && item.classList.contains(selector.slice(1))) };
  const listeners = new Map(); const sent = []; const parent = { postMessage: message => sent.push(message) };
  const window = { addEventListener: (type, handler) => listeners.set(type, handler) };
  const context = { module: { exports: {} }, exports: {}, document, window, parent, location: { search: '', hash: '' }, URL, URLSearchParams, crypto: { randomUUID }, Uint8Array, TextEncoder, TextDecoder, setTimeout, clearTimeout, console };
  vm.runInNewContext(bundle.outputFiles[0].text, context); context.__mainUi.listen();
  const message = data => listeners.get('message')({ source: parent, data });
  return { context, sent, message, element, quantity() { const row = element('card-list').children.findLast(item => item.classList.contains('card-entry')); return row.children.find(item => item.className === 'card-quantity').children[0]; } };
}

test('saved local rows remain editable after a Sheets attempt is canceled on the same page', () => {
  const f = fixture();
  f.message({ type: 'PAGE_CONTEXT', pageId: 'page-1', session: 1, epoch: 0 });
  f.context.__mainUi.localAuthority();
  f.message({ type: 'CARDS_DATA', pageId: 'page-1', session: 1, epoch: 0, data: '[{"quantity":"1"}]', rowIds: ['row-1'] });
  const original = f.quantity(); original.input('2'); assert.equal(f.sent.at(-1).type, 'save-cards-data'); assert.equal(f.sent.at(-1).epoch, 0);
  // sheet-begin advances the epoch; cancel advances it again without changing page/session.
  f.message({ type: 'SOURCE_CONTEXT', pageId: 'page-1', session: 1, epoch: 1 });
  f.message({ type: 'SOURCE_CONTEXT', pageId: 'page-1', session: 1, epoch: 2 });
  const count = f.sent.filter(item => item.type === 'save-cards-data').length;
  original.input('9'); assert.equal(f.sent.filter(item => item.type === 'save-cards-data').length, count);
  const current = f.quantity(); current.input('3');
  assert.equal(f.sent.at(-1).type, 'save-cards-data'); assert.equal(f.sent.at(-1).epoch, 2);
  assert.equal(JSON.parse(f.sent.at(-1).data)[0].quantity, '3');
});
