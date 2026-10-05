import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { fixture } from './fixture.mjs';

const folder = mkdtempSync(join(tmpdir(), 'deck-sheets-state-'));
after(() => rmSync(folder, { recursive: true, force: true }));
await build({ entryPoints: ['src/deck-storage.ts', 'src/deck-source.ts'], outdir: folder, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' } });
const storage = await import(pathToFileURL(join(folder, 'deck-storage.mjs')));
const sources = await import(pathToFileURL(join(folder, 'deck-source.mjs')));
const sheet = (id = 'test-workbook', gid = '7', time = '2026-10-05T12:00:00.000Z') => ({ version: 1, mode: 'google-sheet', revision: 0, spreadsheetId: id, worksheetId: gid, openUrl: `https://docs.google.com/spreadsheets/d/${id}/edit?gid=${gid}#gid=${gid}`, lastApplied: time });
const cards = f => f.page.getPluginData('cardsData') ? JSON.parse(JSON.parse(f.page.getPluginData('cardsData'))) : [];
function preview(f, source = 'card_id,quantity,name\n001,2,Healing', draft = sheet(), mapping) {
  f.message('sheet-begin', { requestId: 'read-test' });
  f.message('csv-preview', { source, revision: 1, sheet: draft, mapping });
  return f.messages.findLast(m => m.type === 'CSV_PREVIEW');
}
function apply(f, source, draft, mapping) {
  const p = preview(f, source, draft, mapping);
  assert.equal(p.data.errors.length, 0, p.data.errors.join('\n'));
  f.message('csv-apply', p.data.token);
  return f.messages.findLast(m => m.type === 'CSV_APPLIED');
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('connection is a draft until Apply; linked mode persists per page', () => {
  const f = fixture(); const p = preview(f);
  assert.equal(f.page.getPluginData('deck-source'), '');
  assert.equal(f.page.getPluginData('cardsData'), '');
  f.message('csv-apply', p.data.token);
  assert.equal(sources.readSource(f.page).mode, 'google-sheet');
  assert.equal(cards(f)[0].card_id, '001');
  const other = fixture(); other.page.id = 'page-2'; f.switchPage(other.page);
  assert.equal(f.messages.findLast(m => m.type === 'SHEET_STATUS').data.source.mode, 'local');
  f.switchPage(f.page);
  assert.equal(f.messages.findLast(m => m.type === 'SHEET_STATUS').data.source.mode, 'google-sheet');
});

test('controller rejects linked manual saves, image assignments, and CSV replacement', () => {
  const f = fixture(); apply(f); const before = f.page.getPluginData('cardsData');
  f.message('save-cards-data', JSON.stringify([{ '#name': 'Wrong' }]));
  assert.equal(f.page.getPluginData('cardsData'), before);
  assert.ok(f.messages.some(m => m.type === 'DECK_ERROR' && /linked/.test(m.data)));
  f.message('select-artwork', { rowId: f.rowIds()[0], name: '#art', uploadId: 'late', value: 'dragon' });
  assert.equal(f.messages.at(-1).type, 'DECK_ERROR');
  f.message('csv-preview', { source: 'card_id,name\n001,Wrong', revision: 2 });
  assert.equal(f.messages.at(-1).type, 'CSV_ERROR');
  assert.equal(f.page.getPluginData('cardsData'), before);
});

test('late local uploads cannot create Artwork or assign a linked row', async () => {
  const f = fixture(); f.message('save-cards-data', JSON.stringify([{ '#name': 'Manual' }]));
  const image = new f.Shape('rectangle'); image.name = '#art'; image.fills = [{ fillImage: { id: 'placeholder' } }]; f.front.appendChild(image);
  let finish; f.api.uploadMediaData = () => new Promise(resolve => { finish = resolve; });
  f.message('create-image-data', { rowId: f.rowIds()[0], name: '#art', uploadId: 'late', filename: 'dragon.png', mimeType: 'image/png', data: new Uint8Array([1]) });
  apply(f);
  finish({ id: 'uploaded', width: 10, height: 10 }); await tick();
  assert.equal(f.messages.some(m => m.type === 'IMAGE_CREATED'), false);
  assert.equal(f.page.findShapes({ name: 'dragon.png' }).length, 0);
});

test('Disconnect keeps cards and restores manual editing; Restore reconnects the prior sheet', () => {
  const f = fixture(); apply(f); const before = f.page.getPluginData('cardsData');
  f.message('sheet-disconnect', null);
  assert.equal(f.page.getPluginData('cardsData'), before);
  assert.equal(sources.readSource(f.page).mode, 'local');
  assert.equal(f.messages.findLast(m => m.type === 'CSV_STATUS').data.restoreTarget.mode, 'google-sheet');
  f.message('save-cards-data', JSON.stringify([{ '#name': 'Manual now' }]));
  f.restore();
  assert.equal(sources.readSource(f.page).mode, 'google-sheet');
  assert.equal(f.page.getPluginData('cardsData'), before);
});

test('Restore rejects a backup changed after review and supplies a new review token', () => {
  const f = fixture(); apply(f); apply(f, 'card_id,name\n001,Updated');
  f.message('csv-status', null);
  const oldToken = f.messages.at(-1).data.restoreToken;
  const before = storage.captureState(f.page);
  f.page.setPluginData(storage.BACKUP_KEY, storage.encodeBackup({ ...before, cardsData: JSON.stringify(JSON.stringify([{ card_id: 'other', '#name': 'Collaborator backup' }])) }));
  f.message('csv-restore', oldToken);
  assert.equal(f.messages.at(-1).type, 'CSV_ERROR');
  assert.match(f.messages.at(-1).data.message, /Review Restore Previous State again/);
  assert.deepEqual(storage.captureState(f.page), before);
  const newToken = f.messages.findLast(m => m.type === 'CSV_STATUS').data.restoreToken;
  assert.notEqual(newToken, oldToken);
  f.message('csv-restore', newToken);
  assert.equal(cards(f)[0]['#name'], 'Collaborator backup');
});

test('stale linked generation reloads authoritative cards and source before reporting error', () => {
  const f = fixture(); apply(f); const stale = cards(f);
  f.page.setPluginData('cardsData', JSON.stringify(JSON.stringify([{ card_id: '002', quantity: '1', '#name': 'Collaborator card' }])));
  const offset = f.messages.length;
  f.forge('fronts-9', stale, { paper: 'letter' });
  const messages = f.messages.slice(offset);
  assert.equal(messages.at(-1).type, 'FORGE_ERROR');
  assert.equal(messages.find(m => m.type === 'SHEET_STATUS').data.source.mode, 'google-sheet');
  assert.equal(JSON.parse(messages.find(m => m.type === 'CARDS_DATA').data)[0]['#name'], 'Collaborator card');
  assert.equal(f.output(), null);
});

test('invalid source generation still stops the loading state with FORGE_ERROR', () => {
  const f = fixture(); f.page.setPluginData('deck-source', JSON.stringify({ version: 99, mode: 'google-sheet' }));
  f.forge('fronts-9', [{ '#name': 'Stale' }]);
  assert.equal(f.messages.at(-1).type, 'FORGE_ERROR');
  assert.ok(f.messages.findLast(m => m.type === 'SHEET_STATUS').data.blocked);
});

for (const action of ['import-cancel', 'sheet-begin', 'sheet-disconnect', 'csv-restore']) {
  test(`${action} invalidates a pending preview even when the deck values return to the same state`, () => {
    const f = fixture(); apply(f); const p = preview(f, 'card_id,name\n001,Changed'); const context = f.context();
    if (action === 'csv-restore') f.restore(); else f.message(action, { requestId: 'read-2' });
    f.message('csv-apply', p.data.token, context);
    assert.equal(f.messages.at(-1).type, 'CSV_ERROR');
    assert.notEqual(cards(f)[0]?.['#name'], 'Changed');
  });
}

test('page A→B→A cannot revive a preview or old network context', () => {
  const f = fixture(); const p = preview(f); const old = f.context();
  const other = fixture(); other.page.id = 'page-2'; f.switchPage(other.page); f.switchPage(f.page);
  f.message('csv-apply', p.data.token, old); assert.equal(f.page.getPluginData('cardsData'), '');
  f.message('csv-preview', { source: 'card_id,name\n001,Wrong', sheet: sheet(), revision: 1 }, old);
  assert.equal(f.messages.at(-1).type, 'CSV_ERROR');
});

test('unchanged pull updates time but preserves backup, generated output and stale status', () => {
  const f = fixture(); apply(f); f.forge('fronts-9', cards(f), { paper: 'letter' });
  const backup = f.page.getPluginData('csv-import-backup'), output = f.output();
  const result = apply(f, undefined, sheet('test-workbook', '7', '2026-10-05T13:00:00.000Z'));
  assert.deepEqual({ ...result.changes }, { outputChanged: false, sourceChanged: false, metadataOnly: true });
  assert.equal(f.page.getPluginData('csv-import-backup'), backup);
  assert.equal(f.page.getPluginData('csv-output-stale'), 'false');
  assert.equal(f.output(), output);
  assert.equal(sources.readSource(f.page).readAt, '2026-10-05T13:00:00.000Z');
  assert.ok(Math.abs(Date.now() - Date.parse(sources.readSource(f.page).lastApplied)) < 5000);
});

test('reordered columns preserve authoritative rows and remain generatable after an unchanged pull', () => {
  const f = fixture(); apply(f); const result = apply(f, 'quantity,name,card_id\n2,Healing,001');
  assert.equal(result.changes.metadataOnly, true);
  assert.equal(JSON.stringify(result.data), JSON.stringify(cards(f)));
  f.forge('fronts-9', result.data, { paper: 'letter' });
  assert.notEqual(f.messages.at(-1).type, 'FORGE_ERROR');
});

test('remapping equal current values is meaningful and Restore recovers the prior mapping', () => {
  const f = fixture(); const source = 'card_id,A,B\n001,Same,Same';
  apply(f, source, sheet(), { card_id: 'card_id', A: '#name', B: '' });
  const before = f.page.getPluginData('csv-import-metadata');
  const result = apply(f, source, sheet(), { card_id: 'card_id', A: '', B: '#name' });
  assert.equal(result.changes.outputChanged, true);
  f.restore(); assert.equal(f.page.getPluginData('csv-import-metadata'), before);
});

test('a collaborator changing source during network read invalidates the returned sheet before preview', () => {
  const f = fixture(); apply(f); f.message('sheet-begin', { requestId: 'read-old' }); const context = f.context();
  f.page.setPluginData('deck-source', JSON.stringify(sources.localSource(2)));
  f.message('csv-preview', { source: 'card_id,name\n001,Old network read', sheet: sheet(), revision: 1 }, context);
  assert.equal(f.messages.at(-1).type, 'CSV_ERROR');
  assert.match(f.messages.at(-1).data.message, /while the sheet was loading/);
  assert.equal(sources.readSource(f.page).mode, 'local');
});

test('order-only updates are shown and invalidate output even with zero changed records', () => {
  const f = fixture(); apply(f, 'card_id,name\n001,One\n002,Two');
  const p = preview(f, 'card_id,name\n002,Two\n001,One');
  assert.equal(p.data.changed, 0); assert.equal(p.data.orderChanged, true);
  f.message('csv-apply', p.data.token);
  assert.equal(f.messages.findLast(m => m.type === 'CSV_APPLIED').changes.outputChanged, true);
  assert.equal(cards(f)[0].card_id, '002');
});

test('preview reports all removals, including row numbers for manual cards without IDs', () => {
  const f = fixture(); f.message('save-cards-data', JSON.stringify([{ '#name': 'Manual' }, { card_id: 'gone', '#name': 'Gone' }]));
  const p = preview(f);
  assert.deepEqual(Array.from(p.data.removedIds), ['Local row 1', 'gone']);
  assert.deepEqual(Array.from(p.data.addedIds), ['001']);
});

test('duplicate manual IDs are reviewed as replaced rows instead of silently collapsing', () => {
  const f = fixture(); f.message('save-cards-data', JSON.stringify([{ card_id: '001', '#name': 'First' }, { card_id: '001', '#name': 'Second' }]));
  const p = preview(f);
  assert.equal(p.data.removed, 2); assert.equal(p.data.added, 1);
  assert.deepEqual(Array.from(p.data.removedIds), ['Local row 1 (duplicate ID 001)', 'Local row 2 (duplicate ID 001)']);
});

test('a changed worksheet resets mapping but the same worksheet keeps it', () => {
  const f = fixture(); const source = 'ID,Title\n001,Hello';
  apply(f, source, sheet(), { ID: 'card_id', Title: '#name' });
  assert.equal(preview(f, source).data.mapping.ID, 'card_id');
  const changed = preview(f, source, sheet('test-workbook', '8'));
  assert.equal(changed.data.mapping.ID, ''); assert.ok(changed.data.errors.length);
});

test('linked generation rejects a stale card payload without changing output', () => {
  const f = fixture(); apply(f); f.forge('fronts-9', [{ card_id: '001', '#name': 'Wrong', quantity: '2' }]);
  assert.equal(f.messages.at(-1).type, 'FORGE_ERROR'); assert.equal(f.output(), null);
});

test('unknown source schema blocks edits but deliberate Disconnect keeps existing cards', () => {
  const f = fixture(); f.message('save-cards-data', JSON.stringify([{ '#name': 'Keep' }])); const before = f.page.getPluginData('cardsData');
  f.page.setPluginData('deck-source', JSON.stringify({ version: 99, mode: 'google-sheet' }));
  f.message('save-cards-data', JSON.stringify([{ '#name': 'Wrong' }])); assert.equal(f.page.getPluginData('cardsData'), before);
  f.message('sheet-disconnect', null); assert.equal(f.page.getPluginData('cardsData'), before);
  assert.equal(sources.readSource(f.page).mode, 'local');
});

for (const bad of [{ version: 99, state: {} }, { version: 1, state: { cardsData: '[]' } }, { cardsData: '[]' }, { version: 1, state: { cardsData: '{}', 'csv-import-metadata': '', outputSettings: '', 'deck-source': '', 'csv-output-stale': '' } }]) {
  test(`invalid backup is rejected before writing: ${JSON.stringify(bad)}`, () => {
    const f = fixture(); apply(f); f.page.setPluginData('csv-import-backup', JSON.stringify(bad));
    const before = storage.captureState(f.page); f.restore();
    assert.equal(f.messages.at(-1).type, 'CSV_ERROR'); assert.deepEqual(storage.captureState(f.page), before);
  });
}

test('precise legacy backups remain restorable to local mode', () => {
  const f = fixture(); apply(f);
  f.page.setPluginData('csv-import-backup', JSON.stringify({ cardsData: JSON.stringify(JSON.stringify([{ '#name': 'Legacy' }])), 'csv-import-metadata': '', outputSettings: '' }));
  f.restore(); assert.equal(cards(f)[0]['#name'], 'Legacy'); assert.equal(sources.readSource(f.page).mode, 'local');
});

for (const key of [...storage.STATE_KEYS, storage.BACKUP_KEY, storage.RECOVERY_KEY]) {
  test(`transaction verifies writes and rolls back failure before ${key}`, () => {
    const f = fixture(); const before = storage.captureState(f.page), priorBackup = f.page.getPluginData(storage.BACKUP_KEY);
    const next = { ...before, cardsData: '[{"quantity":"1"}]', 'csv-import-metadata': '{"mapping":{},"fields":[]}', outputSettings: '{"type":"fronts-9","paper":"letter"}', 'deck-source': JSON.stringify(sheet()), 'csv-output-stale': 'true' };
    const write = f.page.setPluginData; let failed = false;
    f.page.setPluginData = (name, value) => { if (name === key && !failed) { failed = true; throw new Error('Injected before-effect failure'); } write(name, value); };
    assert.throws(() => storage.commitState(f.page, next));
    assert.deepEqual(storage.captureState(f.page), before);
    assert.equal(f.page.getPluginData(storage.BACKUP_KEY), priorBackup);
  });
  test(`transaction accepts a verified after-effect setter exception for ${key}`, () => {
    const f = fixture(); const next = { ...storage.captureState(f.page), cardsData: '[{"quantity":"1"}]' };
    const write = f.page.setPluginData; f.page.setPluginData = (name, value) => { write(name, value); if (name === key) throw new Error('Injected after-effect failure'); };
    storage.commitState(f.page, next); assert.equal(f.page.getPluginData('cardsData'), next.cardsData); assert.equal(f.page.getPluginData(storage.RECOVERY_KEY), '');
  });
}

test('incomplete rollback attempts every key, blocks mutations after reopening, and supports recovery', () => {
  const f = fixture(); const before = storage.captureState(f.page); const write = f.page.setPluginData;
  const next = { ...before, cardsData: '[{"quantity":"1"}]', 'csv-output-stale': 'true' }; const attempted = [];
  f.page.setPluginData = (key, value) => {
    attempted.push([key, value]);
    if (key === 'csv-output-stale' && value === 'true') throw new Error('Commit failure');
    if (key === 'cardsData' && value === before.cardsData) throw new Error('Rollback failure');
    write(key, value);
  };
  assert.throws(() => storage.commitState(f.page, next), /recovery is required/);
  assert.ok(f.page.getPluginData(storage.RECOVERY_KEY));
  assert.ok(attempted.some(([key, value]) => key === storage.BACKUP_KEY && value === ''));
  f.message('load-page', null); f.message('save-cards-data', JSON.stringify([{ '#name': 'Wrong' }]));
  assert.equal(f.messages.at(-1).type, 'DECK_ERROR');
  f.page.setPluginData = write; f.message('source-recover', null);
  assert.deepEqual(storage.captureState(f.page), before); assert.equal(f.page.getPluginData(storage.RECOVERY_KEY), '');
});

test('failed repair of malformed source is recoverable and can be disconnected again', () => {
  const f = fixture(); const invalid = JSON.stringify({ version: 99, mode: 'google-sheet' });
  f.page.setPluginData('deck-source', invalid); const write = f.page.setPluginData;
  f.page.setPluginData = (key, value) => {
    if (key === 'csv-import-backup' && value !== '') throw new Error('Commit failure');
    if (key === 'deck-source' && value === invalid) throw new Error('Rollback failure');
    write(key, value);
  };
  f.message('sheet-disconnect', null); assert.ok(f.page.getPluginData(storage.RECOVERY_KEY));
  f.page.setPluginData = write; f.message('source-recover', null);
  assert.equal(f.page.getPluginData(storage.RECOVERY_KEY), ''); assert.equal(f.page.getPluginData('deck-source'), invalid);
  f.message('sheet-disconnect', null); assert.equal(sources.readSource(f.page).mode, 'local');
});

for (const phase of ['prepare', 'commit', 'cleanup']) {
  test(`recovery-record ${phase} failure preserves the previous state`, () => {
    const f = fixture(); const before = storage.captureState(f.page), write = f.page.setPluginData;
    let failed = false;
    f.page.setPluginData = (key, value) => {
      const target = key === storage.RECOVERY_KEY && (phase === 'prepare' ? value.includes('"phase":"prepared"') : phase === 'commit' ? value.includes('"phase":"committed"') : value === '');
      if (target && !failed) { failed = true; throw new Error('Record failure'); }
      write(key, value);
    };
    assert.throws(() => storage.commitState(f.page, { ...before, cardsData: '[{"quantity":"1"}]' }));
    assert.deepEqual(storage.captureState(f.page), before);
  });
}

test('PDF lock covers iframe assembly and stale acknowledgements do not unlock it', async () => {
  const f = fixture(); apply(f); f.forge('fronts-9', cards(f), { paper: 'letter' });
  f.message('export-front-pdf', { type: 'fronts-9', cardsData: cards(f), paper: 'letter', cutMarks: false }, { requestId: 'pdf-1' }); await tick();
  assert.equal(f.messages.at(-1).type, 'FRONT_PDF_IMAGES');
  f.message('pdf-finish', null, { requestId: 'old-pdf' });
  f.message('sheet-disconnect', null); assert.equal(sources.readSource(f.page).mode, 'google-sheet');
  f.message('pdf-check', null, { requestId: 'pdf-1' }); assert.equal(f.messages.at(-1).type, 'PDF_CHECKED');
  f.message('pdf-finish', null, { requestId: 'pdf-1' });
  f.message('sheet-disconnect', null); assert.equal(sources.readSource(f.page).mode, 'local');
});

test('template changes during iframe PDF assembly reject download authorization', async () => {
  const f = fixture(); apply(f); f.forge('fronts-9', cards(f), { paper: 'letter' });
  f.message('export-front-pdf', { type: 'fronts-9', cardsData: cards(f), paper: 'letter', cutMarks: false }, { requestId: 'pdf-1' }); await tick();
  f.front.children[0].characters = 'Changed template';
  f.message('pdf-check', null, { requestId: 'pdf-1' }); assert.equal(f.messages.at(-1).type, 'PDF_EXPORT_ERROR');
});

test('a collaborator timestamp-only refresh permits an identical PDF download', async () => {
  const f = fixture(); apply(f); f.forge('fronts-9', cards(f), { paper: 'letter' });
  f.message('export-front-pdf', { type: 'fronts-9', cardsData: cards(f), paper: 'letter', cutMarks: false }, { requestId: 'pdf-1' }); await tick();
  const source = sources.readSource(f.page); source.lastApplied = '2026-10-05T14:00:00.000Z'; f.page.setPluginData('deck-source', JSON.stringify(source));
  f.message('pdf-check', null, { requestId: 'pdf-1' }); assert.equal(f.messages.at(-1).type, 'PDF_CHECKED');
});
