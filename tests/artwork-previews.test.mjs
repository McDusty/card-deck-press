import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/artwork-previews.ts'], bundle: true, format: 'cjs', platform: 'browser', write: false });
function fixture(lazy = false) {
  const sent = [], created = [], revoked = [];
  let observer;
  class Image {
    isConnected = true; hidden = false; src = ''; title = ''; onerror = null;
    removeAttribute(name) { if (name === 'src') this.src = ''; }
  }
  class Observer {
    targets = new Set();
    constructor(callback) { this.callback = callback; observer = this; }
    observe(image) { this.targets.add(image); }
    unobserve(image) { this.targets.delete(image); }
    disconnect() { this.targets.clear(); }
    visible(image) { this.callback([{ target: image, isIntersecting: true }]); }
  }
  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, Uint8Array, Blob, queueMicrotask,
    IntersectionObserver: lazy ? Observer : undefined,
    URL: { createObjectURL(blob) { created.push(blob); return `blob:preview-${created.length}`; }, revokeObjectURL(url) { revoked.push(url); } } });
  const ui = new module.exports.ArtworkPreviews((reference, requestId) => sent.push({ reference, requestId }));
  const reply = (request, type = 'ARTWORK_THUMBNAIL', data = new Uint8Array([137, 80, 78, 71])) => ui.message(type, { reference: request.reference, data }, request.requestId);
  return { ui, sent, created, revoked, Image, reply, observer: () => observer };
}

test('duplicate cards share one Penpot preview request and one cached blob', () => {
  const f = fixture(), first = new f.Image(), second = new f.Image();
  f.ui.show(first, 'shape-1|media-1'); f.ui.show(second, 'shape-1|media-1');
  assert.equal(f.sent.length, 1); assert.equal(first.src, '');
  f.reply(f.sent[0]); assert.equal(first.src, 'blob:preview-1'); assert.equal(second.src, first.src);
  const third = new f.Image(); f.ui.show(third, 'shape-1|media-1');
  assert.equal(third.src, first.src); assert.equal(f.sent.length, 1); assert.equal(f.created.length, 1);
});

test('previews load near the viewport and export at most two images at once', () => {
  const f = fixture(true), images = Array.from({ length: 4 }, () => new f.Image());
  images.forEach((image, i) => f.ui.show(image, `shape-${i}|media-${i}`));
  assert.equal(f.sent.length, 0);
  images.forEach(image => f.observer().visible(image)); assert.equal(f.sent.length, 2);
  f.reply(f.sent[0]); assert.equal(f.sent.length, 3);
  f.reply(f.sent[1]); assert.equal(f.sent.length, 4);
});

test('without an observer, cells assembled before attachment still load their preview', async () => {
  const f = fixture(), image = new f.Image(); image.isConnected = false;
  f.ui.show(image, 'shape-1|media-1'); assert.equal(f.sent.length, 0);
  image.isConnected = true;
  await Promise.resolve(); assert.equal(f.sent.length, 1);
  f.reply(f.sent[0]); assert.equal(image.src, 'blob:preview-1');
});

test('late previews cannot overwrite an image chosen while the old export was running', () => {
  const f = fixture(), image = new f.Image();
  f.ui.show(image, 'shape-1|old'); const old = f.sent[0];
  f.ui.show(image, 'shape-1|new'); const current = f.sent[1];
  f.reply(current); const url = image.src;
  f.reply(old); assert.equal(image.src, url); assert.equal(image.hidden, false);
});

test('preview failures hide the broken image without blocking a different assignment', () => {
  const f = fixture(), image = new f.Image();
  f.ui.show(image, 'shape-1|media-1'); f.reply(f.sent[0], 'ARTWORK_THUMBNAIL_ERROR');
  assert.equal(image.hidden, true); assert.equal(image.src, ''); assert.match(image.title, /assignment is unchanged/);
  f.ui.show(image, 'shape-2|media-2'); f.reply(f.sent[1]);
  assert.equal(image.hidden, false); assert.equal(image.title, '');
  image.onerror(); assert.equal(image.hidden, true); assert.equal(image.src, '');
});

test('page/source resets revoke cached blobs and ignore outstanding results', () => {
  const f = fixture(), first = new f.Image(), pending = new f.Image();
  f.ui.show(first, 'shape-1|media-1'); f.reply(f.sent[0]);
  f.ui.show(pending, 'shape-2|media-2'); const old = f.sent[1];
  f.ui.reset(); assert.deepEqual(f.revoked, ['blob:preview-1']);
  const current = new f.Image(); f.ui.show(current, 'shape-2|media-2');
  f.reply(old); assert.equal(current.src, '');
  f.reply(f.sent[2]); assert.equal(current.src, 'blob:preview-2');
});

test('queued detached rows are skipped and malformed preview bytes are rejected', () => {
  const f = fixture(), images = Array.from({ length: 3 }, () => new f.Image());
  images.forEach((image, i) => f.ui.show(image, `shape-${i}|media-${i}`));
  images[2].isConnected = false;
  f.reply(f.sent[0], 'ARTWORK_THUMBNAIL', [300]);
  assert.equal(images[0].hidden, true); assert.equal(f.created.length, 0); assert.equal(f.sent.length, 2);
});
