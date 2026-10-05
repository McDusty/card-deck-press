import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function artwork(f) {
  const board = new f.Shape(); board.name = 'Artwork';
  const image = new f.Shape('rectangle'); image.name = 'spade-ace'; image.resize(750, 1050);
  image.fills = [{ fillImage: { id: 'spade-media' } }]; board.appendChild(image);
  return { image, reference: `${image.id}|spade-media` };
}

test('Penpot supplies a bounded PNG thumbnail without changing cards or artwork', async () => {
  const f = fixture(), { image, reference } = artwork(f); const exports = [];
  f.message('save-cards-data', JSON.stringify([{ '#name': 'Ace', '#image': reference }]));
  const saved = f.page.getPluginData('cardsData'), fills = JSON.stringify(image.fills);
  image.export = async config => { exports.push(config); return new Uint8Array([137, 80, 78, 71]); };
  // Real Penpot may return a fresh proxy each time an ID is resolved.
  const get = f.page.getShapeById; f.page.getShapeById = id => { const shape = get(id); return shape ? Object.assign(Object.create(Object.getPrototypeOf(shape)), shape) : null; };
  f.message('artwork-thumbnail', reference, { requestId: 'preview-1' }); await tick();
  const result = f.messages.findLast(m => m.type === 'ARTWORK_THUMBNAIL');
  assert.equal(result.requestId, 'preview-1'); assert.equal(result.data.reference, reference);
  assert.equal(exports[0].type, 'png'); assert.equal(exports[0].scale, 128 / 1050);
  assert.equal(f.page.getPluginData('cardsData'), saved); assert.equal(JSON.stringify(image.fills), fills);
});

test('wrong media IDs and non-image shapes cannot return thumbnails', async () => {
  const f = fixture(), { image } = artwork(f);
  f.message('artwork-thumbnail', `${image.id}|wrong-media`, { requestId: 'bad-media' }); await tick();
  assert.equal(f.messages.at(-1).type, 'ARTWORK_THUMBNAIL_ERROR');
  f.message('artwork-thumbnail', `${f.front.id}|spade-media`, { requestId: 'bad-shape' }); await tick();
  assert.equal(f.messages.at(-1).type, 'ARTWORK_THUMBNAIL_ERROR');
});

test('artwork changed during export cannot return a stale preview', async () => {
  const f = fixture(), { image, reference } = artwork(f); let finish;
  image.export = () => new Promise(resolve => { finish = resolve; });
  f.message('artwork-thumbnail', reference, { requestId: 'preview-1' });
  image.fills = [{ fillImage: { id: 'replacement' } }]; finish(new Uint8Array([1])); await tick();
  assert.equal(f.messages.at(-1).type, 'ARTWORK_THUMBNAIL_ERROR');
});

test('page A→B→A and source changes discard pending thumbnail results', async () => {
  for (const change of ['page', 'source']) {
    const f = fixture(), { image, reference } = artwork(f); let finish;
    image.export = () => new Promise(resolve => { finish = resolve; });
    f.message('artwork-thumbnail', reference, { requestId: 'old-preview' });
    if (change === 'page') { const next = fixture(); next.page.id = 'page-2'; f.switchPage(next.page); f.switchPage(f.page); }
    else f.message('sheet-begin', { requestId: 'read-sheet' });
    finish(new Uint8Array([1])); await tick();
    assert.equal(f.messages.some(m => m.type === 'ARTWORK_THUMBNAIL' && m.requestId === 'old-preview'), false);
  }
});
