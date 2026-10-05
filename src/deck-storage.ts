import type { Page } from '@penpot/plugin-types';
import { parseForgeRequest } from './output-options';
import type { CardRecord } from './output-options';
import { parseSource, SOURCE_KEY } from './deck-source';

export const BACKUP_KEY = 'csv-import-backup';
export const RECOVERY_KEY = 'deck-import-recovery';
export const STATE_KEYS = ['cardsData', 'csv-import-metadata', 'outputSettings', SOURCE_KEY, 'csv-output-stale'] as const;
const WRITE_KEYS = [...STATE_KEYS, BACKUP_KEY] as const;
export type DeckState = Record<typeof STATE_KEYS[number], string>;
type WriteState = Record<typeof WRITE_KEYS[number], string>;
interface Recovery { version: 1; phase: 'prepared' | 'committed'; before: WriteState; after: WriteState }
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));

export function parseCards(raw: string): CardRecord[] {
  if (!raw) return [];
  let value: unknown = JSON.parse(raw);
  if (typeof value === 'string') value = JSON.parse(value);
  if (!Array.isArray(value) || value.some(card => !object(card) || Object.values(card).some(cell => typeof cell !== 'string'))) throw new Error('Saved card data is invalid. Export a backup before replacing it.');
  return value as CardRecord[];
}
export function validateMetadata(raw: string): void {
  if (!raw) return;
  const v: unknown = JSON.parse(raw);
  if (!object(v) || !object(v.mapping) || Object.values(v.mapping).some(cell => typeof cell !== 'string') || !Array.isArray(v.fields)) throw new Error('Saved import mapping is invalid.');
  const targets = Object.values(v.mapping).filter(Boolean);
  if (new Set(targets).size !== targets.length || targets.some(target => target !== 'card_id' && target !== 'quantity' && !(target as string).startsWith('#'))) throw new Error('Saved import mapping targets are invalid.');
  const names = new Set<string>();
  for (const field of v.fields) {
    if (!object(field) || typeof field.name !== 'string' || !field.name.startsWith('#') || names.has(field.name) ||
        !['text', 'image'].includes(String(field.type)) || !Array.isArray(field.ids) || !field.ids.length ||
        field.ids.some(id => typeof id !== 'string' || !id) || new Set(field.ids).size !== field.ids.length || !targets.includes(field.name)) throw new Error('Saved import field bindings are invalid.');
    names.add(field.name);
  }
}
export function captureState(page: Page): DeckState {
  return Object.fromEntries(STATE_KEYS.map(key => [key, page.getPluginData(key)])) as DeckState;
}
function rawState(value: unknown, keys: readonly string[]): Record<string, string> {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => typeof value[key] !== 'string')) throw new Error('Incomplete saved deck state. No cards were changed.');
  return value as Record<string, string>;
}
export function validateState(value: unknown): DeckState {
  const state = rawState(value, STATE_KEYS) as DeckState;
  parseCards(state.cardsData); validateMetadata(state['csv-import-metadata']);
  if (state[SOURCE_KEY]) parseSource(JSON.parse(state[SOURCE_KEY]));
  if (state.outputSettings) {
    const settings: unknown = JSON.parse(state.outputSettings);
    if (!object(settings)) throw new Error('Saved output settings are invalid.');
    parseForgeRequest({ ...settings, cardsData: [{ quantity: '1' }] });
  }
  if (!['', 'true', 'false'].includes(state['csv-output-stale'])) throw new Error('Saved output status is invalid.');
  return state;
}
export function encodeBackup(state: DeckState): string { return JSON.stringify({ version: 1, state }); }
export function decodeBackup(raw: string): DeckState {
  const value: unknown = JSON.parse(raw);
  if (object(value) && value.version === 1) return validateState(value.state);
  // Only recognize the precise legacy three-key format.
  const legacy = rawState(value, ['cardsData', 'csv-import-metadata', 'outputSettings']);
  return validateState({ ...legacy, [SOURCE_KEY]: '', 'csv-output-stale': 'true' });
}
export function requireRecovered(page: Page): void {
  if (page.getPluginData(RECOVERY_KEY)) throw new Error('An interrupted import needs recovery. Recover previous state before changing this deck.');
}
function writeVerified(page: Page, key: string, value: string): void {
  // A setter may throw after persisting. Readback is the authority.
  try { page.setPluginData(key, value); }
  catch (error) { if (page.getPluginData(key) !== value) throw error; }
  if (page.getPluginData(key) !== value) throw new Error(`Could not verify saved ${key}.`);
}
function equals(page: Page, state: WriteState): boolean { return WRITE_KEYS.every(key => page.getPluginData(key) === state[key]); }
function writeAll(page: Page, state: WriteState): void {
  let issue: unknown;
  for (const key of WRITE_KEYS) {
    try { writeVerified(page, key, state[key]); } catch (error) { issue = error; }
  }
  if (!equals(page, state)) throw issue instanceof Error ? issue : new Error('Could not save the complete deck state.');
}
export function commitState(page: Page, next: DeckState, meaningful = true): void {
  requireRecovered(page); validateState(next);
  const old = captureState(page);
  const before: WriteState = { ...old, [BACKUP_KEY]: page.getPluginData(BACKUP_KEY) };
  const after: WriteState = { ...next, [BACKUP_KEY]: meaningful ? encodeBackup(old) : before[BACKUP_KEY] };
  const record: Recovery = { version: 1, phase: 'prepared', before, after };
  // Never touch a deck key until the durable recovery record is verified.
  writeVerified(page, RECOVERY_KEY, JSON.stringify(record));
  try {
    writeAll(page, after);
    writeVerified(page, RECOVERY_KEY, JSON.stringify({ ...record, phase: 'committed' }));
    writeVerified(page, RECOVERY_KEY, '');
  } catch (error) {
    try { writeAll(page, before); writeVerified(page, RECOVERY_KEY, ''); }
    catch { throw new Error('Import interrupted; recovery is required. The saved recovery record protects your previous cards.'); }
    throw error;
  }
}
export function recoverState(page: Page): void {
  const raw = page.getPluginData(RECOVERY_KEY);
  if (!raw) return;
  const v: unknown = JSON.parse(raw);
  if (!object(v) || v.version !== 1 || !['prepared', 'committed'].includes(String(v.phase))) throw new Error('Recovery record is invalid. Export your cards before repairing stored data.');
  const before = rawState(v.before, WRITE_KEYS) as WriteState;
  const after = rawState(v.after, WRITE_KEYS) as WriteState;
  // A completed operation only needs cleanup; otherwise restore every prior key.
  if (!(v.phase === 'committed' && equals(page, after)) && !equals(page, before)) {
    // Disconnect can intentionally repair an unknown source schema. Restoring that
    // exact prior source is safe: authority stays blocked until another Disconnect.
    validateState({ ...Object.fromEntries(STATE_KEYS.map(key => [key, before[key]])), [SOURCE_KEY]: '' });
    writeAll(page, before);
  }
  writeVerified(page, RECOVERY_KEY, '');
}
