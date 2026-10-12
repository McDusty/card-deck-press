import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const stored = f => JSON.parse(JSON.parse(f.page.getPluginData('cardsData')));
const descendants = shape => [shape, ...(shape.children ?? []).flatMap(descendants)];

test('stale manual saves preserve external changes, reload the editor, and reject queued edits', () => {
  const f = fixture();
  f.message('save-cards-data', JSON.stringify([{ '#name': 'Original' }]));
  const staleContext = f.context();
  const newer = [{ '#name': 'Changed elsewhere' }, { '#name': 'Added elsewhere' }];
  f.page.setPluginData('cardsData', JSON.stringify(JSON.stringify(newer)));
  f.message('save-cards-data', JSON.stringify([{ '#name': 'Stale edit' }]));
  assert.deepEqual(stored(f), newer);
  assert.match(f.messages.at(-1).data, /latest cards have been reloaded.*last edit was not saved/);
  assert.deepEqual(JSON.parse(f.messages.findLast(m => m.type === 'CARDS_DATA').data), newer);
  f.message('save-cards-data', JSON.stringify([{ '#name': 'Queued stale edit' }]), staleContext);
  assert.deepEqual(stored(f), newer);
  f.message('save-cards-data', JSON.stringify([{ ...newer[0], quantity: '2' }, newer[1]]));
  assert.deepEqual(stored(f), [{ ...newer[0], quantity: '2' }, newer[1]]);
});

test('successive manual saves and edits after import or restore keep their saved baseline', () => {
  const f = fixture();
  for (const name of ['First', 'Second']) {
    f.message('save-cards-data', JSON.stringify([{ '#name': name }]));
    assert.equal(stored(f)[0]['#name'], name);
  }
  const preview = f.message('csv-preview', { source: 'card_id,name\n001,Imported', revision: 1 });
  f.message('csv-apply', preview.data.token);
  f.message('save-cards-data', JSON.stringify([{ ...stored(f)[0], '#name': 'Edited import' }]));
  assert.equal(stored(f)[0]['#name'], 'Edited import');
  f.restore();
  f.message('save-cards-data', JSON.stringify([{ ...stored(f)[0], '#name': 'Edited restore' }]));
  assert.equal(stored(f)[0]['#name'], 'Edited restore');
  assert.equal(f.messages.some(m => m.type === 'DECK_ERROR'), false);
});

for (const mode of ['fronts-auto', 'backs-auto', 'printplay', 'standard']) {
  test(`${mode}: stale generation preserves completed output and reloads current saved cards`, () => {
    const f = fixture({ back: true, height: 1050 });
    const original = [{ '#name': 'Original', quantity: '1' }];
    f.message('save-cards-data', JSON.stringify(original));
    f.forge(mode, original);
    const outputKey = mode.startsWith('fronts-') ? 'front-output-current' : mode.startsWith('backs-') ? 'back-output-current' : 'legacy-output-current';
    const outputId = f.page.getPluginData(outputKey);
    assert.ok(outputId);
    const settings = f.page.getPluginData('outputSettings');
    const staleContext = f.context();
    const latest = [{ '#name': 'Changed elsewhere', quantity: '2' }];
    f.page.setPluginData('cardsData', JSON.stringify(JSON.stringify(latest)));
    f.page.setPluginData('csv-output-stale', 'true');

    f.forge(mode, original);

    assert.equal(f.messages.at(-1).type, 'FORGE_ERROR');
    assert.match(f.messages.at(-1).data, /latest cards have been reloaded.*existing output was kept/);
    assert.equal(f.page.getPluginData(outputKey), outputId);
    assert.ok(f.page.getShapeById(outputId));
    assert.equal(f.page.getPluginData('outputSettings'), settings);
    assert.equal(f.page.getPluginData('csv-output-stale'), 'true');
    assert.deepEqual(stored(f), latest);
    assert.deepEqual(JSON.parse(f.messages.findLast(m => m.type === 'CARDS_DATA').data), latest);

    // Work queued by the stale editor cannot overwrite the reloaded rows.
    f.message('save-cards-data', JSON.stringify(original), staleContext);
    assert.deepEqual(stored(f), latest);
    f.forge(mode, latest);
    assert.notEqual(f.page.getPluginData(outputKey), outputId);
    assert.equal(f.page.getPluginData('csv-output-stale'), 'false');
  });
}

for (const mode of ['fronts-auto', 'printplay']) {
  for (const failure of ['settings-before-write', 'settings-after-write', 'stale-after-write', 'clone']) {
    test(`${mode}: ${failure} failure preserves output and restores saved generation settings`, () => {
      const f = fixture({ back: true, height: 1050 });
      const cards = [{ '#name': 'Healing', quantity: '1' }];
      f.message('save-cards-data', JSON.stringify(cards));
      f.forge(mode, cards);
      const outputKey = mode === 'printplay' ? 'legacy-output-current' : 'front-output-current';
      const outputId = f.page.getPluginData(outputKey);
      assert.ok(outputId);
      const settings = f.page.getPluginData('outputSettings');
      f.page.setPluginData('csv-output-stale', 'true');
      const set = f.page.setPluginData.bind(f.page);
      let failed = false;
      if (failure === 'clone') f.failNextClone();
      else f.page.setPluginData = (key, value) => {
        const target = failure === 'stale-after-write' ? 'csv-output-stale' : 'outputSettings';
        if (!failed && key === target) {
          failed = true;
          if (failure !== 'settings-before-write') set(key, value);
          throw new Error(`Injected ${failure} failure`);
        }
        set(key, value);
      };

      f.forge(mode, cards, { gapMm: 2, bufferColor: '#000000' });

      assert.equal(f.messages.at(-1).type, 'FORGE_ERROR');
      assert.match(f.messages.at(-1).data, /Injected/);
      assert.equal(f.page.getPluginData(outputKey), outputId);
      assert.ok(f.page.getShapeById(outputId));
      assert.equal(f.page.getPluginData('outputSettings'), settings);
      assert.equal(f.page.getPluginData('csv-output-stale'), 'true');
      assert.deepEqual(stored(f), cards);

      f.forge(mode, cards, { gapMm: 2, bufferColor: '#000000' });
      assert.equal(f.messages.at(-1).type, 'FRONT_OUTPUT_READY');
      assert.notEqual(f.page.getPluginData(outputKey), outputId);
      assert.equal(JSON.parse(f.page.getPluginData('outputSettings')).gapMm, 2);
      assert.equal(f.page.getPluginData('csv-output-stale'), 'false');
    });
  }
}

for (const mode of ['fronts-single', 'fronts-9', 'standard', 'printplay', 'tabletop']) {
  test(`${mode}: repeated variables update while ordinary metadata-named layers stay fixed`, () => {
    const f = fixture({ back: true, height: 1050 });
    const group = f.api.createBoard(); group.name = 'Nested'; f.front.appendChild(group);
    const second = f.api.createText('Second template title'); second.name = '#name'; group.appendChild(second);
    for (const name of ['quantity', 'card_id']) {
      const label = f.api.createText(`Fixed ${name}`); label.name = name; group.appendChild(label);
    }
    f.forge(mode, [{ '#name': 'Healing', quantity: '2', card_id: 'heal-1' }]);
    const output = mode.startsWith('fronts-') ? f.output() : f.page.getShapeById(f.page.getPluginData('legacy-output-current'));
    assert.ok(output, JSON.stringify(f.messages.at(-1)));
    const fields = descendants(output).filter(s => s.type === 'text');
    const names = fields.filter(s => s.name === '#name');
    assert.ok(names.length >= 2);
    assert.ok(names.every(s => s.characters === 'Healing'));
    for (const name of ['quantity', 'card_id']) {
      const labels = fields.filter(s => s.name === name);
      assert.ok(labels.length);
      assert.ok(labels.every(s => s.characters === `Fixed ${name}`));
    }
  });
}

test('partial template clones are cleaned up and creation can be retried', async () => {
  const f = fixture(); f.front.remove(); f.page.name = 'Original'; f.failSecondClone();
  const request = () => f.message('create-deck', null, { name: 'Notes', size: '11', orientation: 'landscape', templateStyle: 'ruled' });
  request(); await tick();
  assert.equal(f.messages.at(-1).type, 'DECK_SIZE_ERROR');
  assert.equal(f.root.children.length, 0);
  assert.equal(f.page.name, 'Original');
  request(); await tick();
  assert.deepEqual(f.root.children.map(s => s.name).sort(), ['Artwork', 'Back', 'Front']);
  assert.equal(f.page.name, 'Notes');
});
