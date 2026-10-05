import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/google-sheets-ui.ts'], bundle: true, platform: 'browser', format: 'cjs', write: false });
class Element {
  listeners = new Map(); classes = new Set(); attributes = new Map(); textContent = ''; value = ''; disabled = false; hidden = false;
  classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), toggle: (name, on) => { const enabled = on ?? !this.classes.has(name); enabled ? this.classes.add(name) : this.classes.delete(name); return enabled; }, contains: name => this.classes.has(name) };
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() {} showModal() { this.open = true; } close() { this.open = false; }
  click() { this.listeners.get('click')?.({ preventDefault() {} }); }
  submit() { this.listeners.get('submit')?.({ preventDefault() {} }); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const canonical = 'https://docs.google.com/spreadsheets/d/Test_ID/edit?gid=42#gid=42';
function fixture(fetch = async () => csvResponse()) {
  const elements = new Map(); const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const context = { pageId: 'page-1', session: 1, epoch: 0 }; const sent = [], previews = [], authorities = [];
  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, document: { getElementById: element }, crypto: { randomUUID }, URL, URLSearchParams, fetch, AbortController, TextDecoder, TextEncoder, performance, setTimeout, clearTimeout, Date, Error });
  const ui = module.exports.initGoogleSheetsUi({ context: () => context, send: (type, data, binding) => sent.push({ type, data, binding }), preview: (read, binding) => previews.push({ read, binding }), authority: value => authorities.push(value) });
  function begin(url = canonical) { element('google-sheet').click(); element('sheet-link').value = url; element('sheet-form').submit(); return sent.findLast(message => message.type === 'sheet-begin')?.data.requestId; }
  function ack(id) { context.epoch++; ui.contextChanged(); ui.message('SHEET_STARTED', { requestId: id }); }
  return { element, context, sent, previews, authorities, ui, begin, ack };
}
function csvResponse() {
  const response = new Response('card_id,title\n001,Healing', { headers: { 'content-type': 'text/csv' } });
  Object.defineProperty(response, 'url', { value: 'https://docs.google.com/spreadsheets/d/Test_ID/export?format=csv&gid=42' });
  return response;
}

test('missing worksheet gives an actionable Open Sheet link before requesting a read', () => {
  const f = fixture(); f.begin('https://docs.google.com/spreadsheets/d/Test_ID/edit?usp=sharing');
  assert.equal(f.sent.length, 0);
  assert.match(f.element('sheet-error').textContent, /select the worksheet tab/);
  assert.equal(f.element('sheet-open-draft').href, 'https://docs.google.com/spreadsheets/d/Test_ID/edit');
  assert.equal(f.element('sheet-read').disabled, false);
});

test('a rejected host begin clears loading and permits retry', () => {
  const f = fixture(); const first = f.begin();
  assert.equal(f.element('sheet-read').disabled, true);
  f.ui.message('CSV_ERROR', { message: 'A PDF is still being prepared.' });
  assert.equal(f.element('sheet-read').disabled, false);
  assert.match(f.element('sheet-error').textContent, /PDF/);
  assert.equal(f.element('sheet-panel').classList.contains('hidden'), false);
  assert.notEqual(f.begin(), first);
});

test('reading waits for host context and preview retains that exact binding', async () => {
  let reads = 0; const f = fixture(async () => { reads++; return csvResponse(); });
  const id = f.begin(); await flush(); assert.equal(reads, 0);
  f.ack(id); await flush(); await flush();
  assert.equal(reads, 1); assert.equal(f.previews.length, 1);
  assert.equal(f.previews[0].binding.epoch, 1);
  assert.equal(f.previews[0].read.table.rows[0].values[0], '001');
  assert.equal(f.element('sheet-read').disabled, false);
});

test('cancel aborts an in-flight fetch and a late response cannot open preview', async () => {
  let release; const f = fixture(() => new Promise(resolve => { release = resolve; }));
  f.ack(f.begin()); f.element('sheet-cancel').click(); release(csvResponse()); await flush(); await flush();
  assert.equal(f.previews.length, 0);
  assert.equal(f.sent.at(-1).type, 'import-cancel');
  assert.equal(f.element('cards-container').classList.contains('hidden'), false);
  assert.equal(f.element('sheet-read').disabled, false);
});

test('same-page epoch change aborts a read and restores the card view', async () => {
  let release; const f = fixture(() => new Promise(resolve => { release = resolve; }));
  f.ack(f.begin()); f.context.epoch++; f.ui.contextChanged(); release(csvResponse()); await flush(); await flush();
  assert.equal(f.previews.length, 0);
  assert.equal(f.element('sheet-panel').classList.contains('hidden'), true);
  assert.equal(f.element('cards-container').classList.contains('hidden'), false);
});

test('linked decks replace local actions with identified source controls and disconnect confirmation', () => {
  const f = fixture(); const source = { version: 1, mode: 'google-sheet', revision: 1, spreadsheetId: 'Test_ID', worksheetId: '42', openUrl: canonical, lastApplied: '2026-10-05T12:00:00.000Z' };
  f.ui.message('SHEET_STATUS', { source, recovery: false });
  assert.equal(f.authorities.at(-1), true);
  for (const id of ['upload-csv', 'google-sheet', 'add-card']) assert.equal(f.element(id).classList.contains('hidden'), true);
  assert.equal(f.element('sheet-open').href, canonical); assert.match(f.element('sheet-open').textContent, /42/);
  f.element('sheet-disconnect').click(); assert.equal(f.element('sheet-disconnect-dialog').open, true); assert.equal(f.sent.length, 0);
  f.element('sheet-disconnect-confirm').click(); assert.equal(f.sent.at(-1).type, 'sheet-disconnect');
  f.ui.message('SHEET_STATUS', { source: { version: 1, mode: 'local', revision: 2 }, recovery: false });
  assert.equal(f.authorities.at(-1), false); assert.equal(f.element('add-card').classList.contains('hidden'), false);
});

test('failed transaction blocks edits and exposes the recovery action', () => {
  const f = fixture(); f.ui.message('SHEET_STATUS', { source: { version: 1, mode: 'local', revision: 0 }, recovery: true });
  assert.equal(f.authorities.at(-1), true); assert.equal(f.element('add-card').classList.contains('hidden'), true);
  assert.equal(f.element('sheet-recover').classList.contains('hidden'), false);
  assert.equal(f.element('sheet-disconnect').classList.contains('hidden'), true);
  f.element('sheet-recover').click(); assert.equal(f.sent.at(-1).type, 'source-recover');
});

test('local entry actions wait for source authority after switching pages', () => {
  const f = fixture(); f.ui.awaitStatus();
  for (const id of ['upload-csv', 'google-sheet', 'add-card']) assert.equal(f.element(id).disabled, true);
  f.ui.message('SHEET_STATUS', { source: { version: 1, mode: 'local', revision: 0 }, recovery: false });
  for (const id of ['upload-csv', 'google-sheet', 'add-card']) assert.equal(f.element(id).disabled, false);
});

for (const transition of ['page', 'epoch']) {
  test(`disconnect confirmation cannot follow a ${transition} change to another deck`, () => {
    const f = fixture(); f.element('sheet-disconnect').click();
    assert.equal(f.element('sheet-disconnect-dialog').open, true);
    if (transition === 'page') { f.context.pageId = 'page-2'; f.context.session++; f.ui.reset(); }
    else { f.context.epoch++; f.ui.contextChanged(); }
    assert.equal(f.element('sheet-disconnect-dialog').open, false);
    f.element('sheet-disconnect-confirm').click();
    assert.equal(f.sent.filter(message => message.type === 'sheet-disconnect').length, 0);
  });
}

test('disconnect confirmation sends the captured deck binding', () => {
  const f = fixture(); f.element('sheet-disconnect').click(); f.element('sheet-disconnect-confirm').click();
  const request = f.sent.find(message => message.type === 'sheet-disconnect');
  assert.equal(request.binding.pageId, 'page-1'); assert.equal(request.binding.session, 1); assert.equal(request.binding.epoch, 0);
});
