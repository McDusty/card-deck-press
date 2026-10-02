import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const request = f => f.message('create-deck', null, { name: 'Starter deck', size: '0', orientation: 'portrait' });

test('new decks expose Title and Image fields with a real image fill and keep Back free of variables', async () => {
  const f = fixture(); f.front.remove(); request(f); await tick();
  const front = f.page.findShapes({ name: 'Front' })[0];
  const back = f.page.findShapes({ name: 'Back' })[0];
  const title = front.children.find(shape => shape.name === '#title');
  const image = front.children.find(shape => shape.name === '#image');
  assert.equal(title.characters, 'Card title'); assert.equal(title.type, 'text');
  assert.equal(image.type, 'rectangle'); assert.equal(image.fills.length, 1);
  assert.ok(image.fills[0].fillImage.id);
  assert.ok(image.x >= front.x && image.y + image.height <= front.y + front.height);
  assert.equal(back.children.some(shape => shape.name.startsWith('#')), false);
  f.message('load-card-fields', null);
  assert.deepEqual(JSON.parse(JSON.stringify(f.messages.findLast(message => message.type === 'CARD_FIELDS').data.fields.map(field => [field.name, field.type]))), [['#title', 'text'], ['#image', 'image']]);
  f.forge('fronts-single', [{ quantity: '1', '#title': 'Healing', '#image': '' }]);
  const card = f.output().children[0];
  assert.equal(card.children.find(shape => shape.name === '#title').characters, 'Healing');
  assert.equal(card.children.find(shape => shape.name === '#image').fills.length, 0);
});

test('placeholder upload failure leaves an empty page unchanged and permits retry', async () => {
  const f = fixture(); f.front.remove(); const name = f.page.name;
  f.api.uploadMediaData = async () => { throw new Error('Upload failed'); };
  request(f); await tick();
  assert.equal(f.root.children.length, 0); assert.equal(f.page.name, name);
  assert.match(f.messages.at(-1).data, /Upload failed/);
  f.api.uploadMediaData = async () => ({ id: 'placeholder', width: 100, height: 100 });
  request(f); await tick(); assert.equal(f.page.findShapes({ name: 'Front' }).length, 1);
});

test('creation rejects page changes and new page content while uploading the placeholder', async () => {
  for (const change of ['page', 'content']) {
    const f = fixture(); f.front.remove(); let finish;
    f.api.uploadMediaData = () => new Promise(resolve => { finish = resolve; });
    request(f);
    if (change === 'page') { const other = fixture(); other.page.id = 'page-2'; f.switchPage(other.page); }
    else new f.Shape('rectangle').name = 'User artwork';
    finish({ id: 'placeholder', width: 100, height: 100 }); await tick();
    assert.equal(f.page.findShapes({ name: 'Front' }).length, 0);
    assert.equal(f.root.children.length, change === 'content' ? 1 : 0);
  }
});

test('failed title creation removes partial templates and restores the page name', async () => {
  const f = fixture(); f.front.remove(); const name = f.page.name; f.api.createText = () => null;
  request(f); await tick();
  assert.equal(f.root.children.length, 0); assert.equal(f.page.name, name);
  assert.match(f.messages.at(-1).data, /title placeholder/);
});
