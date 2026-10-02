import type { Board, Page, Penpot, Shape } from '@penpot/plugin-types';
import type { CardRecord, FaceMode, PaperSize } from './output-options';
import { calculateFrontLayout, PAGE_GAP } from './front-layout';
import { calculateCutLines } from './cut-lines';
import { isSheetMode, parseForgeRequest } from './output-options';
import { cloneTracked } from './output-clone';
import { readDeck } from './csv-import';

const OWNER_KEY = 'front-output-owner';
const STATE_KEY = 'front-output-state';
const CURRENT_KEY = 'front-output-current';
const CLEANUP_KEY = 'front-output-cleanup';
const REQUEST_KEY = 'front-output-request';
const TEMPLATE_KEY = 'front-output-template';

export function getFrontTemplate(page: Page, face: 'Front' | 'Back' = 'Front'): Board {
  const candidates = page.findShapes({ name: face, type: 'board' }).filter(shape => shape.parent?.id === page.root.id);
  if (candidates.length !== 1) throw new Error(`Keep exactly one top-level board named ${face} on this page.`);
  return candidates[0] as Board;
}

function descendants(shape: Shape): Shape[] {
  return [shape, ...('children' in shape ? shape.children.flatMap(descendants) : [])];
}

function templateSignature(front: Board): string {
  return JSON.stringify(descendants(front).map(shape => ({
    id: shape.id, type: shape.type, name: shape.name, x: shape.x, y: shape.y,
    width: shape.width, height: shape.height, rotation: shape.rotation,
    fills: shape.fills, strokes: shape.strokes, opacity: shape.opacity,
    hidden: shape.hidden, borderRadius: shape.borderRadius, shadows: shape.shadows, blur: shape.blur,
    text: shape.type === 'text' ? [shape.characters, shape.fontFamily, shape.fontSize, shape.fontWeight, shape.fontStyle, shape.lineHeight, shape.letterSpacing] : undefined,
  })));
}

function validateFields(page: Page, front: Board, cards: readonly CardRecord[]): void {
  const fields = descendants(front).filter(shape => shape.name.startsWith('#'));
  for (const [index, card] of cards.entries()) {
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(card, field.name)) continue;
      if (field.type === 'text') continue;
      if (field.type !== 'rectangle' || field.fills.length !== 1 || !field.fills[0].fillImage) {
        throw new Error(`Card ${index + 1}: ${field.name} must be text or a rectangle with one image fill.`);
      }
      const reference = card[field.name];
      const image = reference ? page.getShapeById(reference.split('|')[0]) : null;
      if (reference && (!image || image.fills === 'mixed' || !image.fills.some(fill => fill.fillImage))) {
        throw new Error(`Card ${index + 1}: the image for ${field.name} is missing. Choose it again.`);
      }
    }
  }
}

function populateCard(page: Page, clone: Board, data: CardRecord): void {
  for (const field of descendants(clone)) {
    if (!field.name.startsWith('#') || !Object.prototype.hasOwnProperty.call(data, field.name)) continue;
    const value = data[field.name];
    if (field.type === 'text') field.characters = value;
    else if (field.type === 'rectangle') {
      const image = value ? page.getShapeById(value.split('|')[0]) : null;
      if (value && !image) throw new Error(`The image for ${field.name} is missing. Choose it again.`);
      if (image?.fills === 'mixed') throw new Error(`The image for ${field.name} has mixed fills. Choose it again.`);
      field.fills = image ? [{ ...field.fills[0], fillImage: image.fills.find(fill => fill.fillImage)?.fillImage }] : [];
    }
  }
}

function ownedCompleteOutput(page: Page, id: string, owner: string): Board | null {
  const shape = id ? page.getShapeById(id) : null;
  return shape?.type === 'board' && shape.getPluginData(OWNER_KEY) === owner && shape.getPluginData(STATE_KEY) === 'complete' ? shape : null;
}

export function generateFrontOutput(api: Penpot, cards: readonly CardRecord[], mode: FaceMode, paper: PaperSize, cutLines: boolean, sourceCards: readonly CardRecord[] = cards): Board {
  const undo = api.history.undoBlockBegin();
  try { return buildFrontOutput(api, cards, mode, paper, cutLines, sourceCards); }
  finally { api.history.undoBlockFinish(undo); }
}

function buildFrontOutput(api: Penpot, cards: readonly CardRecord[], mode: FaceMode, paper: PaperSize, cutLines: boolean, sourceCards: readonly CardRecord[]): Board {
  const page = api.currentPage;
  if (!page) throw new Error('Open a Penpot page first.');
  const backOnly = mode.startsWith('backs-');
  const label = backOnly ? 'Backs' : 'Fronts';
  const currentKey = backOnly ? 'back-output-current' : CURRENT_KEY;
  const cleanupKey = backOnly ? 'back-output-cleanup' : CLEANUP_KEY;
  const front = getFrontTemplate(page, backOnly ? 'Back' : 'Front');
  const outputCards = mode === 'backs-single' ? cards.slice(0, 1) : cards;
  const layout = calculateFrontLayout(mode, front.width, front.height, outputCards.length, paper);
  if (!backOnly) validateFields(page, front, cards);
  const owner = `${page.id}:${front.id}`;
  const previousId = page.getPluginData(currentKey);
  const previousCleanup = page.getPluginData(cleanupKey);
  const current = ownedCompleteOutput(page, page.getPluginData(currentKey), owner);
  const position = { x: current?.x ?? front.x, y: current?.y ?? front.y + front.height + 400 };
  // Recover only our recorded old output; never infer ownership from a name.
  if (current) {
    const cleanupId = page.getPluginData(cleanupKey);
    if (cleanupId !== current.id) ownedCompleteOutput(page, cleanupId, owner)?.remove();
    page.setPluginData(cleanupKey, '');
  }
  const created: Shape[] = [];
  let output: Board;
  try {
    output = api.createBoard();
    created.push(output);
    output.name = `${label} Output (building)`;
    output.setPluginData(OWNER_KEY, owner);
    output.setPluginData(STATE_KEY, 'building');
    // Build to the right of the last completed output so it stays usable.
    output.x = current ? current.x + current.width + PAGE_GAP : front.x;
    output.y = front.y + front.height + 400;
    output.resize(layout.width, layout.pageCount * layout.height + (layout.pageCount - 1) * PAGE_GAP);
    output.fills = [];
    output.clipContent = false;
    for (let pageIndex = 0; pageIndex < layout.pageCount; pageIndex++) {
      let container = output;
      if (isSheetMode(mode)) {
        container = api.createBoard();
        created.push(container);
        container.name = `${label} ${paper === 'a4' ? 'A4' : 'Letter'} ${String(pageIndex + 1).padStart(2, '0')}`;
        container.resize(layout.width, layout.height);
        container.fills = [{ fillColor: '#FFFFFF', fillOpacity: 1 }];
        container.clipContent = true;
        output.appendChild(container);
        container.x = output.x;
        container.y = output.y + pageIndex * (layout.height + PAGE_GAP);
      }
      const offset = pageIndex * layout.perPage;
      const pageCards = outputCards.slice(offset, offset + layout.perPage);
      for (const [slot, data] of pageCards.entries()) {
        const card = cloneTracked(page, front, created) as Board;
        container.appendChild(card);
        card.name = `${backOnly ? 'Back' : 'Front'} ${String(offset + slot + 1).padStart(2, '0')}`;
        card.x = container.x + layout.startX + (slot % layout.columns) * (front.width + layout.gap);
        card.y = container.y + layout.startY + Math.floor(slot / layout.columns) * (front.height + layout.gap);
        if (!backOnly) populateCard(page, card, data);
      }
      if (cutLines && isSheetMode(mode)) {
        for (const line of calculateCutLines(layout, front.width, front.height, pageCards.length)) {
          const mark = api.createRectangle();
          created.push(mark);
          mark.name = 'Cut line';
          mark.resize(line.width, line.height);
          mark.fills = [{ fillColor: '#000000', fillOpacity: 1 }];
          mark.strokes = [];
          container.appendChild(mark);
          mark.x = container.x + line.x;
          mark.y = container.y + line.y;
        }
      }
    }
    if (api.currentPage?.id !== page.id) throw new Error('The active page changed. Return to the deck and try again.');
    output.name = `${label} Output`;
    output.setPluginData(REQUEST_KEY, JSON.stringify({ cardsData: sourceCards, type: mode, cutMarks: cutLines, paper }));
    output.setPluginData(TEMPLATE_KEY, templateSignature(front));
    output.setPluginData(STATE_KEY, 'complete');
    page.setPluginData(cleanupKey, current?.id ?? '');
    page.setPluginData(currentKey, output.id);
  } catch (error) {
    page.setPluginData(currentKey, previousId);
    page.setPluginData(cleanupKey, previousCleanup);
    // Each clone is tracked before filling fields, including unattached failures.
    for (const shape of created.reverse()) {
      if (page.getShapeById(shape.id)) shape.remove();
    }
    throw error;
  }
  // Publication is complete. Cleanup failure must not remove the new output.
  try {
    current?.remove();
    page.setPluginData(cleanupKey, '');
    output.x = position.x;
    output.y = position.y;
  } catch (error) {
    console.warn('Front output is complete; old-output cleanup will retry on the next generation.', error);
  }
  return output;
}

export async function exportFrontSheets(api: Penpot, value: unknown, isCurrent: () => boolean = () => true,
  progress: (data: { current: number; total: number }) => void = data => api.ui.sendMessage({ type: 'PDF_EXPORT_PROGRESS', data })):
  Promise<{ pages: Uint8Array[]; paper: PaperSize; deckName: string; layout: string }> {
  const request = parseForgeRequest(value);
  if (!isSheetMode(request.type)) throw new Error('Choose a six- or nine-card sheet layout.');
  const page = api.currentPage;
  if (!page) throw new Error('Open the deck page first.');
  if (page.getPluginData('cardsData') && JSON.stringify(readDeck(page)) !== JSON.stringify(request.cardsData)) {
    throw new Error('The deck changed. Forge again before downloading.');
  }
  const backOnly = request.type.startsWith('backs-');
  const currentKey = backOnly ? 'back-output-current' : CURRENT_KEY;
  const front = getFrontTemplate(page, backOnly ? 'Back' : 'Front');
  const output = ownedCompleteOutput(page, page.getPluginData(currentKey), `${page.id}:${front.id}`);
  if (!output || output.getPluginData(REQUEST_KEY) !== JSON.stringify(request) || output.getPluginData(TEMPLATE_KEY) !== templateSignature(front)) {
    throw new Error('The deck or settings changed. Forge again before downloading.');
  }
  const sheets = output.children;
  if (sheets.length === 0 || sheets.some(shape => shape.type !== 'board')) throw new Error('The generated sheets changed. Forge again before downloading.');
  const pages: Uint8Array[] = [];
  const savedCards = page.getPluginData('cardsData');
  const metadata = page.getPluginData('csv-import-metadata');
  const settings = page.getPluginData('outputSettings');
  const stale = page.getPluginData('csv-output-stale');
  let byteCount = 0;
  for (const [index, sheet] of sheets.entries()) {
    try {
      const data = await sheet.export({ type: 'png', scale: 1 });
      if (!isCurrent() || api.currentPage?.id !== page.id || page.getPluginData(currentKey) !== output.id ||
          output.getPluginData(TEMPLATE_KEY) !== templateSignature(front) || page.getPluginData('cardsData') !== savedCards ||
          page.getPluginData('csv-import-metadata') !== metadata || page.getPluginData('outputSettings') !== settings ||
          page.getPluginData('csv-output-stale') !== stale) {
        throw new Error('The deck changed during export. Forge again before downloading.');
      }
      byteCount += data.byteLength;
      if (byteCount > 256 * 1024 * 1024) throw new Error('The export exceeds the 256 MiB download limit.');
      pages.push(data);
      progress({ current: index + 1, total: sheets.length });
    } catch (error) {
      throw new Error(`Sheet ${index + 1}: ${error instanceof Error ? error.message : 'Rendering failed. Try downloading again.'}`);
    }
  }
  return { pages, paper: request.paper, deckName: page.name, layout: request.type };
}
