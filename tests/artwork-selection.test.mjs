import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const saved = f => JSON.parse(JSON.parse(f.page.getPluginData('cardsData')));
function setup() {
  const f = fixture({ height: 1050 });
  const field = new f.Shape('rectangle'); field.name = '#art'; field.fills = [{ fillImage: { id: 'placeholder' } }]; f.front.appendChild(field);
  const board = new f.Shape(); board.name = 'Artwork';
  const image = new f.Shape('rectangle'); image.name = 'healing.png'; image.fills = [{ fillImage: { id: 'healing-media' } }]; board.appendChild(image);
  f.message('save-cards-data', JSON.stringify([{ '#name': 'Healing', quantity: '10' }]));
  return { f, field, board, image };
}
function choose(f, value, extra = {}) {
  return f.message('select-artwork', { rowId: f.rowIds()[0], name: '#art', uploadId: 'selection-1', value, ...extra });
}
function apply(f, result) {
  assert.equal(result.type, 'ARTWORK_SELECTED');
  const cards = saved(f); cards[f.rowIds().indexOf(result.data.rowId)][result.data.name] = result.data.reference;
  f.message('save-cards-data', JSON.stringify(cards));
  return cards;
}

test('manual row chooses existing Artwork by filename, generates copies, and exports its name', () => {
  const { f, image } = setup(); const count = f.shapes.size;
  const result = choose(f, 'healing.png');
  assert.equal(result.data.reference, `${image.id}|healing-media`);
  const cards = apply(f, result); assert.equal(f.shapes.size, count);
  f.forge('fronts-9', cards); assert.equal(f.output().children.length, 2);
  assert.equal(f.output().children[0].children[0].children.find(shape => shape.name === '#art').fills[0].fillImage.id, 'healing-media');
  assert.match(f.message('csv-export', null).data, /Artwork\/healing.png/);
});

test('duplicate names require a full path; missing names preserve saved cards', () => {
  const { f, board } = setup(); const folder = new f.Shape(); folder.name = 'alternate'; board.appendChild(folder);
  const duplicate = new f.Shape('rectangle'); duplicate.name = 'healing.png'; duplicate.fills = [{ fillImage: { id: 'alternate-media' } }]; folder.appendChild(duplicate);
  const before = f.page.getPluginData('cardsData');
  assert.match(choose(f, 'healing.png').data.message, /Multiple Artwork/);
  assert.match(choose(f, 'missing.png').data.message, /No Artwork/);
  assert.equal(f.page.getPluginData('cardsData'), before);
  assert.equal(choose(f, 'Artwork/alternate/healing.png').data.reference, `${duplicate.id}|alternate-media`);
});

test('clear removes the card fill while keeping the reusable Artwork source', () => {
  const { f, image } = setup(); apply(f, choose(f, 'healing.png'));
  const cards = apply(f, choose(f, '')); assert.equal(cards[0]['#art'], '');
  f.forge('fronts-single', cards);
  assert.equal(f.output().children[0].children.find(shape => shape.name === '#art').fills.length, 0);
  assert.equal(f.page.getShapeById(image.id), image);
});

test('selection and refreshed catalog use the current fill after artwork replacement', () => {
  const { f, image } = setup(); image.fills = [{ fillImage: { id: 'replacement-media' } }];
  const assets = f.message('load-artwork', null).data;
  assert.equal(assets[0].reference, `${image.id}|replacement-media`);
  assert.equal(choose(f, 'healing.png').data.reference, `${image.id}|replacement-media`);
});

test('removed rows, changed fields, and old page sessions cannot select Artwork', () => {
  const { f, field } = setup();
  assert.match(choose(f, 'healing.png', { rowId: 'deleted-row' }).data.message, /removed/);
  field.name = '#renamed'; assert.match(choose(f, 'healing.png').data.message, /field changed/);
  field.name = '#art'; const context = f.context(); const other = fixture(); other.page.id = 'page-2';
  f.switchPage(other.page); f.switchPage(f.page);
  const result = f.message('select-artwork', { rowId: f.rowIds()[0], name: '#art', uploadId: 'old', value: 'healing.png' }, context);
  assert.equal(result.type, 'DECK_ERROR'); assert.equal(saved(f)[0]['#art'], undefined);
});

test('choosing Artwork supersedes an unfinished row upload', async () => {
  const { f, image, board } = setup(); let finish;
  f.api.uploadMediaData = () => new Promise(resolve => { finish = resolve; });
  f.message('create-image-data', { rowId: f.rowIds()[0], name: '#art', uploadId: 'pending-upload', filename: 'late.png', mimeType: 'image/png', data: new Uint8Array([1]) });
  apply(f, choose(f, 'healing.png')); finish({ id: 'late-media', width: 100, height: 100 }); await tick();
  assert.equal(saved(f)[0]['#art'], `${image.id}|healing-media`);
  assert.equal(board.children.length, 1);
  assert.equal(f.messages.some(message => message.type === 'IMAGE_CREATED'), false);
});

test('row Upload adds an image to Artwork and makes it available to other rows', async () => {
  const { f, board } = setup(); f.api.uploadMediaData = async () => ({ id: 'uploaded-media', width: 100, height: 200 });
  f.message('create-image-data', { rowId: f.rowIds()[0], name: '#art', uploadId: 'upload-new', filename: 'new.png', mimeType: 'image/png', data: new Uint8Array([1]) });
  await tick(); const created = f.messages.findLast(message => message.type === 'IMAGE_CREATED');
  assert.equal(f.page.getShapeById(created.data.imageId).parent, board);
  assert.equal(f.page.getShapeById(created.data.imageId).name, 'new.png');
  assert.equal(choose(f, 'new.png').data.reference, `${created.data.imageId}|uploaded-media`);
});
