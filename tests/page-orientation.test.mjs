import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';

for (const mode of ['fronts-auto', 'backs-auto']) {
  for (const [paperOrientation, counts, landscape] of [['portrait', [3, 3, 1], false], ['landscape', [4, 3], true], ['auto', [4, 3], true]]) {
    test(`${mode}: ${paperOrientation} is respected in generated pages, saved settings, and PDF`, async () => {
      const f = fixture({ back: true, width: 1500, height: 900 });
      const cards = [{ '#name': 'Index', quantity: '7' }];
      const settings = { paper: 'letter', paperOrientation, cutMarks: false };
      f.forge(mode, cards, settings);
      const output = mode.startsWith('fronts') ? f.output() : f.backOutput();
      assert.deepEqual(output.children.map(sheet => sheet.children.length), counts);
      for (const sheet of output.children) {
        assert.equal(sheet.width > sheet.height, landscape);
        for (const card of sheet.children) assert.deepEqual([card.width, card.height], [1500, 900]);
      }
      f.reopenSettings(); assert.equal(f.messages.at(-1).data.paperOrientation, paperOrientation);
      await f.exportPdf(mode, cards, settings);
      const pdf = f.messages.findLast(message => message.type === 'FRONT_PDF_IMAGES').data;
      assert.equal(pdf.landscape, landscape); assert.equal(pdf.pages.length, counts.length);
      await f.exportPdf(mode, cards, { ...settings, paperOrientation: paperOrientation === 'portrait' ? 'landscape' : 'portrait' });
      assert.equal(f.messages.at(-1).type, 'PDF_EXPORT_ERROR');
      assert.match(f.messages.at(-1).data, /settings changed/);
    });
  }
}

for (const mode of ['fronts-6', 'backs-9']) {
  test(`${mode}: manual orientation applies to fixed grids`, async () => {
    const f = fixture({ back: true, width: 750, height: 750 });
    const cards = [{ '#name': 'Square', quantity: '9' }];
    for (const paperOrientation of ['portrait', 'landscape', 'auto']) {
      f.forge(mode, cards, { paper: 'letter', paperOrientation });
      const output = mode.startsWith('fronts') ? f.output() : f.backOutput();
      assert.equal(output.children[0].width > output.children[0].height, paperOrientation === 'landscape');
      await f.exportPdf(mode, cards, { paper: 'letter', paperOrientation });
      assert.equal(f.messages.findLast(message => message.type === 'FRONT_PDF_IMAGES').data.landscape, paperOrientation === 'landscape');
    }
  });
}

test('Auto turns a fixed grid only when portrait does not fit', () => {
  const f = fixture({ width: 1500, height: 750 });
  f.forge('fronts-6', [{ '#name': 'Keep', quantity: '6' }], { paper: 'letter' });
  const previous = f.output(); assert.equal(previous.children[0].width > previous.children[0].height, true);
  f.forge('fronts-6', [{ '#name': 'Keep', quantity: '6' }], { paper: 'letter', paperOrientation: 'portrait' });
  assert.equal(f.output(), previous); assert.match(f.messages.at(-1).data, /do not fit.*portrait/);
});

test('an impossible or invalid orientation preserves cards and completed output', () => {
  const f = fixture({ width: 2400, height: 1500 });
  const cards = [{ '#name': '5 × 8', quantity: '2' }];
  f.forge('fronts-auto', cards); const previous = f.output();
  assert.ok(previous);
  for (const paperOrientation of ['portrait', 'sideways', 42]) {
    f.forge('fronts-auto', cards, { paperOrientation });
    assert.equal(f.output(), previous); assert.equal(f.messages.at(-1).type, 'FORGE_ERROR');
    assert.deepEqual([f.front.width, f.front.height], [2400, 1500]);
  }
});

test('older generated pages without orientation metadata still export with the default', async () => {
  const f = fixture(); const cards = [{ '#name': 'Old settings' }];
  f.forge('fronts-9', cards);
  const request = JSON.parse(f.output().getPluginData('front-output-request'));
  delete request.paperOrientation;
  f.output().setPluginData('front-output-request', JSON.stringify(request));
  await f.exportPdf('fronts-9', cards);
  assert.equal(f.messages.findLast(message => message.type === 'FRONT_PDF_IMAGES').data.landscape, false);
});

test('sheet orientation never rotates a single-card PDF', async () => {
  const f = fixture({ width: 1500, height: 900 }); const cards = [{ '#name': 'Single' }];
  f.forge('fronts-single', cards, { paperOrientation: 'portrait' });
  await f.exportPdf('fronts-single', cards, { paperOrientation: 'landscape' });
  const pdf = f.messages.findLast(message => message.type === 'FRONT_PDF_IMAGES').data;
  assert.equal(pdf.landscape, false); assert.deepEqual(Array.from(pdf.pageSize), [360, 216]);
});
