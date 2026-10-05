import type { Page } from '@penpot/plugin-types';
import { readSource } from './deck-source';
import { parseCards } from './deck-storage';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, cell]) => [key, canonical(cell)]));
  return value;
}
// Timestamps and object-key order cannot alter printed output or source authority.
export function deckFingerprint(page: Page): string {
  const source = readSource(page);
  const metadata = page.getPluginData('csv-import-metadata');
  const settings = page.getPluginData('outputSettings');
  return JSON.stringify(canonical([
    parseCards(page.getPluginData('cardsData')),
    metadata ? JSON.parse(metadata) : null,
    settings ? JSON.parse(settings) : null,
    source.mode === 'google-sheet' ? [source.mode, source.revision, source.spreadsheetId, source.worksheetId] : [source.mode, source.revision],
    page.getPluginData('csv-output-stale'),
  ]));
}
