import type { CardRecord } from './output-options';

export interface ImageTarget { rowId: string; name: string; uploadId: string }

export class ImageTargets {
  private readonly uploads = new Map<string, string>();
  start(target: ImageTarget): void { this.uploads.set(this.key(target), target.uploadId); }
  matches(target: ImageTarget): boolean { return this.uploads.get(this.key(target)) === target.uploadId; }
  finish(target: ImageTarget): void { if (this.matches(target)) this.uploads.delete(this.key(target)); }
  clear(): void { this.uploads.clear(); }
  cancel(rowId: string, name: string): void { this.uploads.delete(JSON.stringify([rowId, name])); }
  retainRows(rows: readonly string[]): void {
    const present = new Set(rows);
    for (const key of this.uploads.keys()) if (!present.has(JSON.parse(key)[0])) this.uploads.delete(key);
  }
  private key(target: ImageTarget): string { return JSON.stringify([target.rowId, target.name]); }
}

export function assignCardImage(cards: CardRecord[], rows: readonly string[], target: ImageTarget, reference: string): boolean {
  const index = rows.indexOf(target.rowId);
  if (index < 0 || !cards[index]) return false;
  cards[index][target.name] = reference;
  return true;
}
