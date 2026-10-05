import type { Board, Page, Penpot, Shape } from '@penpot/plugin-types';

export interface ArtworkAsset { name: string; path: string; reference: string }

export function searchArtwork(assets: readonly ArtworkAsset[], query: string): ArtworkAsset[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return assets.filter(asset => words.every(word => asset.path.toLocaleLowerCase().includes(word)))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function matchArtwork(assets: readonly ArtworkAsset[], value: string): ArtworkAsset[] {
  const names = (asset: ArtworkAsset) => [asset.name, asset.path, asset.path.replace(/^Artwork\//, '')];
  const exact = assets.filter(asset => names(asset).includes(value));
  if (exact.length) return exact;
  // Penpot may name placed images without their original file extension.
  const stem = (name: string) => name.replace(/\.(png|jpe?g|webp|gif|avif|bmp|tiff?)$/i, '');
  return assets.filter(asset => names(asset).some(name => stem(name) === stem(value)));
}

export function resolveArtwork(assets: readonly ArtworkAsset[], value: string): string {
  if (!value) return '';
  const matches = matchArtwork(assets, value);
  if (!matches.length) throw new Error(`No Artwork image named "${value}". Check the name or upload it first.`);
  if (matches.length > 1) throw new Error(`Multiple Artwork images named "${value}". Choose a full Artwork path.`);
  return matches[0].reference;
}

export function artworkName(assets: readonly ArtworkAsset[], reference: string): string {
  const asset = assets.find(item => item.reference.split('|')[0] === reference.split('|')[0]);
  return asset ? matchArtwork(assets, asset.name).length === 1 ? asset.name : asset.path : '';
}

export const ARTWORK_OWNER = 'cardforge-artwork';

export function artworkBoards(page: Page): Board[] {
  return page.findShapes({ type: 'board' }).filter(shape => shape.parent?.id === page.root.id &&
    (shape.getPluginData(ARTWORK_OWNER) === 'true' || shape.name === 'Artwork' || shape.name === '_Images')) as Board[];
}

export function createArtworkBoard(api: Penpot): Board {
  const board = api.createBoard();
  board.name = 'Artwork'; board.y = -1200; board.resize(2400, 900);
  board.hidden = false; board.clipContent = false;
  board.setPluginData(ARTWORK_OWNER, 'true');
  return board;
}

export function getArtworkBoard(api: Penpot): Board {
  const page = api.currentPage;
  if (!page) throw new Error('Open a deck page first.');
  const boards = artworkBoards(page);
  if (boards.length > 1) throw new Error('Keep one Artwork container on this page before uploading images.');
  const board = boards[0] ?? createArtworkBoard(api);
  board.name = 'Artwork'; board.hidden = false;
  board.setPluginData(ARTWORK_OWNER, 'true');
  return board;
}

export function listArtwork(page: Page): ArtworkAsset[] {
  const result: ArtworkAsset[] = [];
  function walk(shape: Shape, prefix: string) {
    const path = prefix ? `${prefix}/${shape.name}` : shape.name;
    if (shape.type === 'rectangle' && shape.fills.length === 1 && shape.fills[0].fillImage) {
      result.push({ name: shape.name, path: `Artwork/${path}`, reference: `${shape.id}|${shape.fills[0].fillImage.id}` });
    }
    if ('children' in shape) for (const child of shape.children) walk(child, path);
  }
  for (const board of artworkBoards(page)) for (const child of board.children) walk(child, '');
  return result;
}
