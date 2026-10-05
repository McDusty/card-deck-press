import type { Page } from '@penpot/plugin-types';

export const SOURCE_KEY = 'deck-source';
export interface LocalSource { version: 1; mode: 'local'; revision: number }
export interface SheetSource {
  version: 1; mode: 'google-sheet'; revision: number;
  spreadsheetId: string; worksheetId: string; openUrl: string; lastApplied: string; readAt?: string;
}
export type DeckSource = LocalSource | SheetSource;
export const localSource = (revision = 0): LocalSource => ({ version: 1, mode: 'local', revision });

// Validate without browser globals: this also runs in Penpot's controller.
export function parseSource(value: unknown): DeckSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved deck connection is invalid. Disconnect to keep the cards and return to manual editing.');
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0) throw new Error('Unsupported deck connection. Disconnect to keep the cards.');
  if (v.mode === 'local') return localSource(v.revision as number);
  if (v.mode !== 'google-sheet' || typeof v.spreadsheetId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(v.spreadsheetId) ||
      typeof v.worksheetId !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(v.worksheetId) ||
      v.openUrl !== `https://docs.google.com/spreadsheets/d/${v.spreadsheetId}/edit?gid=${v.worksheetId}#gid=${v.worksheetId}` ||
      typeof v.lastApplied !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v.lastApplied) || !Number.isFinite(Date.parse(v.lastApplied)) ||
      (v.readAt !== undefined && (typeof v.readAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v.readAt) || !Number.isFinite(Date.parse(v.readAt))))) {
    throw new Error('Saved Google Sheet connection is invalid. Disconnect to keep the cards.');
  }
  return { version: 1, mode: 'google-sheet', revision: v.revision as number, spreadsheetId: v.spreadsheetId, worksheetId: v.worksheetId, openUrl: v.openUrl as string, lastApplied: v.lastApplied, ...(v.readAt ? { readAt: v.readAt as string } : {}) };
}
export function readSource(page: Page): DeckSource {
  const raw = page.getPluginData(SOURCE_KEY);
  if (!raw) return localSource();
  try { return parseSource(JSON.parse(raw)); }
  catch (error) { throw new Error(error instanceof Error ? error.message : 'Saved deck connection is invalid.'); }
}
export function requireLocalSource(page: Page): void {
  if (readSource(page).mode !== 'local') throw new Error('This deck is linked to Google Sheets. Edit the sheet and Pull Latest, or Disconnect to edit cards here.');
}
export function sameSource(a: DeckSource, b: DeckSource): boolean {
  return a.mode === b.mode && (a.mode === 'local' || (b.mode === 'google-sheet' && a.spreadsheetId === b.spreadsheetId && a.worksheetId === b.worksheetId));
}
