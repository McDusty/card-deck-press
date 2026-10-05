import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/csv-ui.ts'], bundle: true, platform: 'browser', format: 'cjs', write: false });
class Element {
  listeners = new Map(); children = []; classes = new Set(); attributes = new Map(); textContent = ''; value = ''; disabled = false; hidden = false;
  classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), toggle: (name, on) => { const enabled = on ?? !this.classes.has(name); enabled ? this.classes.add(name) : this.classes.delete(name); return enabled; }, contains: name => this.classes.has(name) };
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() {} showModal() { this.open = true; } close() { this.open = false; }
  click() { return this.listeners.get('click')?.({ preventDefault() {} }); }
  change() { return this.listeners.get('change')?.({ preventDefault() {} }); }
  append(...items) { this.children.push(...items); } appendChild(item) { this.children.push(item); return item; }
  replaceChildren(...items) { this.children = [...items]; }
}
const source = 'card_id,title\n001,Healing';
const read = { source, fetchedAt: '2026-10-05T12:00:00.000Z', link: { kind: 'worksheet', spreadsheetId: 'Test_ID', worksheetId: '42', openUrl: 'https://docs.google.com/spreadsheets/d/Test_ID/edit?gid=42#gid=42' } };
function fixture() {
  const elements = new Map(); const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const context = { pageId: 'page-1', session: 1, epoch: 0 }; const sent = [], applied = []; let invalidated = 0;
  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, document: { getElementById: element, createElement: () => new Element() }, URL, URLSearchParams, TextDecoder, TextEncoder, Date, Error });
  const ui = module.exports.initCsvUi({ context: () => context, send: (type, data, binding) => sent.push({ type, data, binding }), apply: cards => applied.push(cards), invalidate: () => invalidated++ });
  const preview = (overrides = {}) => { const request = sent.findLast(message => message.type === 'csv-preview'); ui.message('CSV_PREVIEW', { revision: request.data.revision, token: 'token-1', headers: ['card_id', 'title'], fields: [{ name: '#title', type: 'text', ids: ['title-1'] }], mapping: { card_id: 'card_id', title: '#title' }, rows: [{ line: 2, values: ['001', 'Healing'] }], records: 1, copies: 1, added: 0, changed: 0, removed: 0, addedIds: [], changedIds: [], removedIds: [], orderChanged: false, errors: [], artworkMatches: 0, ...overrides }); };
  return { element, context, sent, ui, applied, invalidated: () => invalidated, preview };
}
function deferredFile(name, type = 'text/csv') {
  let resolve, reject; const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { file: { name, type, size: 20, arrayBuffer: () => pending }, resolve, reject };
}
for (const transition of ['page', 'epoch']) {
  test(`restore confirmation closes and cannot apply after a ${transition} change`, () => {
    const f = fixture(); f.ui.message('CSV_STATUS', { canRestore: true, stale: false, restoreToken: 17, restoreTarget: { mode: 'google-sheet', openUrl: read.link.openUrl } });
    f.element('csv-restore').click(); assert.equal(f.element('csv-restore-dialog').open, true);
    assert.match(f.element('csv-restore-copy').textContent, /reconnects/);
    if (transition === 'page') { f.context.pageId = 'page-2'; f.context.session++; f.ui.message('CSV_RESET', null); }
    else { f.context.epoch++; f.ui.contextChanged(); }
    assert.equal(f.element('csv-restore-dialog').open, false);
    f.element('csv-restore-confirm').click(); assert.equal(f.sent.filter(message => message.type === 'csv-restore').length, 0);
  });
}

test('valid restore sends the captured binding and describes local destination', () => {
  const f = fixture(); f.ui.message('CSV_STATUS', { canRestore: true, stale: false, restoreToken: 17, restoreTarget: { mode: 'local' } });
  f.element('csv-restore').click(); assert.match(f.element('csv-restore-copy').textContent, /local editing mode/);
  f.element('csv-restore-confirm').click(); const message = f.sent.find(item => item.type === 'csv-restore');
  assert.equal(message.data, 17); assert.equal(message.binding.pageId, 'page-1'); assert.equal(message.binding.session, 1); assert.equal(message.binding.epoch, 0);
});

test('Restore sends the backup token shown when the dialog opened', () => {
  const f = fixture(); f.ui.message('CSV_STATUS', { canRestore: true, stale: false, restoreToken: 17, restoreTarget: { mode: 'local' } });
  f.element('csv-restore').click();
  f.ui.message('CSV_STATUS', { canRestore: true, stale: false, restoreToken: 18, restoreTarget: { mode: 'google-sheet', openUrl: read.link.openUrl } });
  f.element('csv-restore-confirm').click();
  assert.equal(f.sent.find(item => item.type === 'csv-restore').data, 17);
});

for (const kind of ['CSV file', 'artwork file']) {
  for (const outcome of ['rejected', 'resolved']) {
    test(`a stale ${outcome} ${kind} read cannot overwrite the next page's preview`, async () => {
      const f = fixture(); f.ui.openSheet(read, { ...f.context }); f.preview();
      const deferred = deferredFile(kind === 'CSV file' ? 'old.csv' : 'old.png', kind === 'CSV file' ? 'text/csv' : 'image/png');
      const input = f.element(kind === 'CSV file' ? 'csv-file' : 'artwork-files'); input.files = [deferred.file]; const promise = input.change();
      f.context.pageId = 'page-2'; f.context.session++; f.context.epoch++; f.ui.message('CSV_RESET', null);
      f.ui.openSheet({ ...read, source: 'card_id,title\n002,Shield' }, { ...f.context }); f.preview();
      const summary = f.element('csv-summary').textContent; const filename = f.element('csv-filename').textContent;
      if (outcome === 'rejected') deferred.reject(new Error('Old read failed.'));
      else deferred.resolve(new TextEncoder().encode('card_id,title\nold,Old card').buffer);
      await promise;
      assert.equal(f.element('csv-error').textContent, ''); assert.equal(f.element('csv-summary').textContent, summary);
      assert.equal(f.element('csv-filename').textContent, filename); assert.equal(f.element('csv-apply').disabled, false);
      assert.equal(f.sent.filter(message => message.type === 'upload-artwork').length, 0);
      assert.equal(f.sent.filter(message => message.type === 'csv-preview').length, 2);
    });
  }
}

test('metadata-only apply keeps existing output and sends the reviewed binding', () => {
  const f = fixture(); f.ui.openSheet(read, { ...f.context }); f.preview(); f.element('csv-apply').click();
  const request = f.sent.find(item => item.type === 'csv-apply'); assert.equal(request.binding.epoch, 0); assert.equal(request.data, 'token-1');
  f.ui.message('CSV_APPLIED', [{ card_id: '001', '#title': 'Healing' }], { outputChanged: false });
  assert.equal(f.invalidated(), 0); assert.equal(f.applied.length, 1);
});

test('preview exposes every changed ID and distinguishes changed order from a no-op', () => {
  const f = fixture(); f.ui.openSheet(read, { ...f.context });
  const ids = Array.from({ length: 30 }, (_, index) => `card-${index}`); f.preview({ removed: 30, removedIds: ids, orderChanged: true });
  const detail = f.element('csv-changes').children[2]; assert.equal(detail.children[1].textContent, ids.join(', '));
  assert.match(f.element('csv-changes').children[3].textContent, /order changes/);
  assert.doesNotMatch(f.element('csv-summary').textContent, /No card changes/);
  f.preview(); assert.match(f.element('csv-summary').textContent, /No card changes/);
});
