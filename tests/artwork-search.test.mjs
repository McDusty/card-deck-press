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
const { searchArtwork, matchArtwork, resolveArtwork } = await import(pathToFileURL(join(folder, 'artwork.mjs')));
const assets = [
  { name: 'dragon.png', path: 'Artwork/enemies/dragon.png', reference: '1|a' },
  { name: 'healing.png', path: 'Artwork/spells/healing.png', reference: '2|b' },
  { name: 'dragon.png', path: 'Artwork/allies/dragon.png', reference: '3|c' },
];

test('Artwork matches filenames with or without raster extensions and keeps folder paths', () => {
  const asset = {name:'spade-ace',path:'Artwork/cards/spade-ace',reference:'4|d'};
  assert.deepEqual(matchArtwork([asset], 'spade-ace.png'), [asset]);
  assert.deepEqual(matchArtwork([asset], 'Artwork/cards/spade-ace.png'), [asset]);
  assert.deepEqual(matchArtwork([asset], 'cards/spade-ace.PNG'), [asset]);
  assert.deepEqual(matchArtwork(assets, 'healing'), [assets[1]]);
  assert.deepEqual(matchArtwork([asset], 'Artwork/other/spade-ace.png'), []);
});

test('exact artwork names take priority; ambiguous extension matches require a path', () => {
  const bare = {name:'dragon',path:'Artwork/other/dragon',reference:'4|d'};
  assert.deepEqual(matchArtwork([bare,assets[0]], 'dragon.png'), [assets[0]]);
  assert.throws(() => resolveArtwork(assets, 'dragon'), /Multiple/);
  assert.equal(resolveArtwork(assets, 'enemies/dragon'), '1|a');
});

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
