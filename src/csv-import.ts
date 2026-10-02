import type { Page, Penpot, Shape } from '@penpot/plugin-types';
import type { CardRecord } from './output-options';
import { listArtwork } from './artwork';
import { parseCsv, writeCsv } from './csv';
import { cardQuantity, printedCopies } from './deck-data';

export interface ImportField { name: string; type: string; ids: string[] }
export type ColumnMapping = Record<string, string>;
export interface ImportMetadata { mapping: ColumnMapping; fields: ImportField[] }
export interface ImportPreview {
  revision: number; token: number; headers: string[]; fields: ImportField[]; mapping: ColumnMapping;
  rows: { line: number; values: string[] }[]; records: number; copies: number;
  added: number; changed: number; removed: number; errors: string[]; artworkMatches: number;
}
const META = 'csv-import-metadata';
const BACKUP = 'csv-import-backup';
const STALE = 'csv-output-stale';
const KEYS = ['cardsData', META, 'outputSettings'] as const;

function walk(shape: Shape): Shape[] { return [shape, ...('children' in shape ? shape.children.flatMap(walk) : [])]; }
export function importFields(page: Page): ImportField[] {
  const fronts = page.findShapes({ name: 'Front', type: 'board' }).filter(shape => shape.parent?.id === page.root.id);
  if (fronts.length > 1) throw new Error('Keep one top-level Front template before importing.');
  const grouped = new Map<string, ImportField>();
  for (const shape of fronts.flatMap(walk).filter(shape => shape.name.startsWith('#'))) {
    const type = shape.type === 'text' ? 'text' : shape.type === 'rectangle' && shape.fills.length === 1 && shape.fills[0].fillImage ? 'image' : 'unsupported';
    const previous = grouped.get(shape.name);
    if (previous && previous.type !== type) throw new Error(`${shape.name} is used for conflicting field types. Rename one layer.`);
    if (previous) previous.ids.push(shape.id);
    else grouped.set(shape.name, { name: shape.name, type, ids: [shape.id] });
  }
  return [...grouped.values()];
}

export function readDeck(page: Page): CardRecord[] {
  const stored = page.getPluginData('cardsData');
  if (!stored) return [];
  let value: unknown = JSON.parse(stored);
  if (typeof value === 'string') value = JSON.parse(value);
  if (!Array.isArray(value) || value.some(card => !card || typeof card !== 'object' || Array.isArray(card) || Object.values(card).some(value => typeof value !== 'string'))) throw new Error('Saved card data is invalid. Export a backup before replacing it.');
  return value as CardRecord[];
}
function readMetadata(page: Page): ImportMetadata | null {
  const data = page.getPluginData(META);
  return data ? JSON.parse(data) as ImportMetadata : null;
}
function snapshot(page: Page): string { return JSON.stringify(Object.fromEntries(KEYS.map(key => [key, page.getPluginData(key)]))); }
const sameCard = (a: CardRecord, b: CardRecord) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const normal = (value: string) => value.replace(/^#/, '').toLocaleLowerCase('en-US');

export function validateImportedFields(page: Page, cards: readonly CardRecord[] = []): void {
  const metadata = readMetadata(page);
  if (!metadata) return;
  const current = importFields(page);
  for (const field of metadata.fields) {
    const match = current.find(item => item.name === field.name && item.type === field.type);
    if (!match || JSON.stringify([...match.ids].sort()) !== JSON.stringify([...field.ids].sort())) throw new Error(`${field.name} changed since CSV import. Reimport and check the column mapping before forging.`);
  }
  for (const card of cards) for (const field of metadata.fields.filter(field => field.type === 'image')) {
    const reference = card[field.name];
    if (!reference) continue;
    const shape = page.getShapeById(reference.split('|')[0]);
    if (!shape || shape.type !== 'rectangle' || !shape.fills.some(fill => fill.fillImage)) throw new Error(`Card ${card.card_id || '(without ID)'}: artwork for ${field.name} is missing. Reimport and rematch it before forging.`);
  }
}

export class CsvImporter {
  private serial = 0;
  private pending: { pageId: string; token: number; source: string; mapping: ColumnMapping; snapshot: string; cards: CardRecord[]; fields: ImportField[]; artwork: string } | null = null;
  constructor(private readonly api: Penpot) {}
  preview(value: unknown): ImportPreview {
    this.pending = null;
    if (!value || typeof value !== 'object') throw new Error('Choose a CSV file.');
    const input = value as Record<string, unknown>;
    if (typeof input.source !== 'string' || typeof input.revision !== 'number') throw new Error('Choose a CSV file.');
    const page = this.api.currentPage;
    if (!page) throw new Error('Open a deck page first.');
    const table = parseCsv(input.source);
    const fields = importFields(page);
    const previous = readMetadata(page);
    const errors: string[] = [];
    const mapping: ColumnMapping = Object.create(null);
    const supplied = input.mapping;
    if (supplied !== undefined && (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || Object.values(supplied).some(value => typeof value !== 'string'))) throw new Error('Column mapping is invalid.');
    for (const header of table.headers) {
      const matches = fields.filter(field => normal(field.name) === normal(header));
      mapping[header] = supplied ? (supplied as ColumnMapping)[header] ?? '' :
        Object.prototype.hasOwnProperty.call(previous?.mapping ?? {}, header) ? previous!.mapping[header] :
        normal(header) === 'card_id' ? 'card_id' : normal(header) === 'quantity' ? 'quantity' : matches.length === 1 ? matches[0].name : '';
    }
    const targets = Object.values(mapping).filter(Boolean);
    if (new Set(targets).size !== targets.length) errors.push('Map each card field to only one CSV column.');
    if (!targets.includes('card_id')) errors.push('Map a column to card_id. Each row needs a unique, stable ID.');
    for (const target of targets) {
      if (target === 'card_id' || target === 'quantity') continue;
      const field = fields.find(field => field.name === target);
      if (!field || field.type === 'unsupported') errors.push(`${target}: choose a supported text or image field, or Ignore.`);
    }
    const mappedFields = fields.filter(field => targets.includes(field.name));
    if (!supplied && previous) for (const field of previous.fields) {
      const current = fields.find(item => item.name === field.name && JSON.stringify(item.ids) === JSON.stringify(field.ids));
      if (!current) errors.push(`${field.name} changed. Review its mapping before importing.`);
    }
    const assets = listArtwork(page);
    const ids = new Set<string>();
    const cards: CardRecord[] = [];
    let artworkMatches = 0;
    for (const row of table.rows) {
      const card: CardRecord = Object.create(null);
      for (const [index, header] of table.headers.entries()) {
        const target = mapping[header];
        if (!target) continue;
        const value = row.values[index];
        const field = fields.find(field => field.name === target);
        if (field?.type === 'image' && value) {
          const matches = assets.filter(asset => asset.name === value || asset.path === value || asset.path.replace(/^Artwork\//, '') === value);
          if (matches.length !== 1) errors.push(`Row ${row.line}, ${header}: ${matches.length ? 'multiple images named' : 'missing image'} "${value}". Use a unique name or Artwork/path.`);
          else { card[target] = matches[0].reference; artworkMatches++; }
        } else card[target] = value;
      }
      if (!card.card_id?.trim()) errors.push(`Row ${row.line}, card_id: an ID is required.`);
      else if (ids.has(card.card_id)) errors.push(`Row ${row.line}, card_id: duplicate ID "${card.card_id}".`);
      ids.add(card.card_id);
      if (!targets.includes('quantity')) card.quantity = '1';
      try { cardQuantity(card); } catch (error) { errors.push(`Row ${row.line}: ${error instanceof Error ? error.message : 'Invalid quantity.'}`); }
      cards.push(card);
    }
    let copies = 0;
    if (!errors.length) copies = printedCopies(cards);
    if (copies > 1000) errors.push('This import exceeds 1,000 printed copies. Reduce quantities.');
    const old = readDeck(page);
    const oldById = new Map(old.filter(card => card.card_id).map(card => [card.card_id, card]));
    const added = cards.filter(card => !oldById.has(card.card_id)).length;
    const changed = cards.filter(card => oldById.has(card.card_id) && !sameCard(card, oldById.get(card.card_id)!)).length;
    const removed = old.filter(card => !card.card_id || !ids.has(card.card_id)).length;
    const token = ++this.serial;
    if (!errors.length) this.pending = { pageId: page.id, token, source: input.source, mapping, snapshot: snapshot(page), cards, fields: mappedFields, artwork: JSON.stringify(assets) };
    return { revision: input.revision, token, headers: table.headers, fields, mapping, rows: table.rows.slice(0, 5), records: cards.length, copies, added, changed, removed, errors: errors.slice(0, 50), artworkMatches };
  }
  apply(token: unknown): CardRecord[] {
    const pending = this.pending;
    const page = this.api.currentPage;
    if (!pending || pending.token !== token || !page || page.id !== pending.pageId) throw new Error('Preview the CSV again before applying it.');
    if (snapshot(page) !== pending.snapshot || JSON.stringify(listArtwork(page)) !== pending.artwork || pending.fields.some(field => !importFields(page).some(current => JSON.stringify(current) === JSON.stringify(field)))) throw new Error('The deck, template, or artwork changed. Preview the CSV again.');
    this.pending = null;
    const before = snapshot(page);
    const oldBackup = page.getPluginData(BACKUP);
    try {
      page.setPluginData(BACKUP, before);
      page.setPluginData(META, JSON.stringify({ mapping: pending.mapping, fields: pending.fields }));
      page.setPluginData('cardsData', JSON.stringify(JSON.stringify(pending.cards)));
      page.setPluginData(STALE, 'true');
    } catch (error) {
      const saved = JSON.parse(before) as Record<string, string>;
      for (const key of KEYS) page.setPluginData(key, saved[key]);
      page.setPluginData(BACKUP, oldBackup);
      throw error;
    }
    return pending.cards;
  }
  restore(): CardRecord[] {
    const page = this.api.currentPage;
    if (!page) throw new Error('Open a deck page first.');
    const backup = page.getPluginData(BACKUP);
    if (!backup) throw new Error('There is no previous import to restore.');
    const saved = JSON.parse(backup) as Record<string, string>;
    const current = snapshot(page);
    try {
      for (const key of KEYS) page.setPluginData(key, saved[key] ?? '');
      page.setPluginData(BACKUP, current);
      page.setPluginData(STALE, 'true');
    } catch (error) {
      const original = JSON.parse(current) as Record<string, string>;
      for (const key of KEYS) page.setPluginData(key, original[key]);
      page.setPluginData(BACKUP, backup);
      throw error;
    }
    this.pending = null;
    return readDeck(page);
  }
  export(): string {
    const page = this.api.currentPage;
    if (!page) throw new Error('Open a deck page first.');
    const cards = readDeck(page);
    const fieldNames = [...new Set(cards.flatMap(card => Object.keys(card).filter(name => name.startsWith('#'))))];
    const assets = listArtwork(page);
    const imageFields = importFields(page).filter(field => field.type === 'image').map(field => field.name);
    const used = new Set(cards.map(card => card.card_id).filter(Boolean));
    return writeCsv(['card_id', 'quantity', ...fieldNames], cards.map((card, index) => {
      let id = card.card_id;
      if (!id) { id = `manual-${index + 1}`; while (used.has(id)) id += '-'; used.add(id); }
      return [id, card.quantity ?? '1', ...fieldNames.map(name => imageFields.includes(name) && card[name] ? assets.find(asset => asset.reference.split('|')[0] === card[name].split('|')[0])?.path ?? 'MISSING_ARTWORK' : card[name] ?? '')];
    }));
  }
  status() { const page = this.api.currentPage; return { canRestore: Boolean(page?.getPluginData(BACKUP)), stale: page?.getPluginData(STALE) === 'true' }; }
}
