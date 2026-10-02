import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const folder = mkdtempSync(join(tmpdir(), 'cardforge-artwork-search-'));
after(() => rmSync(folder, { recursive: true, force: true }));
await build({ entryPoints: ['src/artwork.ts'], outfile: join(folder, 'artwork.mjs'), bundle: true, platform: 'node', format: 'esm' });
const { searchArtwork } = await import(pathToFileURL(join(folder, 'artwork.mjs')));
const assets = [
  { name: 'dragon.png', path: 'Artwork/enemies/dragon.png', reference: '1|a' },
  { name: 'healing.png', path: 'Artwork/spells/healing.png', reference: '2|b' },
  { name: 'dragon.png', path: 'Artwork/allies/dragon.png', reference: '3|c' },
];

test('Artwork picker search matches names and folder words without changing exact references', () => {
  assert.deepEqual(searchArtwork(assets, '  DRAGON enemies  '), [assets[0]]);
  assert.deepEqual(searchArtwork(assets, 'healing'), [assets[1]]);
  assert.deepEqual(searchArtwork(assets, 'dragon').map(asset => asset.reference), ['3|c', '1|a']);
});

test('empty search sorts choices without mutating the source catalog; no matches returns an empty list', () => {
  assert.deepEqual(searchArtwork(assets, '').map(asset => asset.reference), ['3|c', '1|a', '2|b']);
  assert.equal(assets[0].reference, '1|a');
  assert.deepEqual(searchArtwork(assets, 'missing'), []);
  assert.deepEqual(searchArtwork([], ''), []);
});
