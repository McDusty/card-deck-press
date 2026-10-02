import type { Penpot } from '@penpot/plugin-types';
import type { CardRecord } from './output-options';

export interface PageBinding { pageId: string | null; session: number }

// Row identities belong to this editor session, independently of editable CSV IDs.
export class DeckSession {
  private serial = 0;
  private rows: string[] = [];
  private binding: PageBinding;
  constructor(private readonly api: Penpot) {
    this.binding = { pageId: api.currentPage?.id ?? null, session: 1 };
  }
  get context(): PageBinding { return { ...this.binding }; }
  changePage(): void {
    this.binding = { pageId: this.api.currentPage?.id ?? null, session: this.binding.session + 1 };
    this.rows = [];
  }
  matches(value: Partial<PageBinding>): boolean {
    return this.api.currentPage?.id === this.binding.pageId && value.pageId === this.binding.pageId && value.session === this.binding.session;
  }
  require(value: Partial<PageBinding>): void {
    if (!this.matches(value)) throw new Error('The active deck changed. Wait for the new page to load and try again.');
  }
  loadRows(count: number): string[] {
    if (this.rows.length !== count) this.replaceRows(count);
    return [...this.rows];
  }
  replaceRows(count: number): string[] {
    this.rows = Array.from({ length: count }, () => `host-${this.binding.session}-${++this.serial}`);
    return [...this.rows];
  }
  validateRows(value: unknown, cards: readonly CardRecord[]): string[] {
    if (!Array.isArray(value) || value.length !== cards.length || value.some(id => typeof id !== 'string' || !id) || new Set(value).size !== value.length) {
      throw new Error('Card identities are invalid. Reopen the plugin before editing.');
    }
    return value as string[];
  }
  setRows(rows: readonly string[]): void { this.rows = [...rows]; }
  hasRow(id: string): boolean { return this.rows.includes(id); }
}
