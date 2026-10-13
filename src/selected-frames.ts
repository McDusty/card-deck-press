import type { Board, Penpot, Shape } from '@penpot/plugin-types';
import { templateSignature } from './front-output';
import { packSelectedFrames, parseSelectionSettings, MAX_PRINT_FRAMES } from './selected-layout';
import type { PackedPages, PrintFrame, SelectionPrintSettings } from './selected-layout';

export interface SelectionPreview { token: string; frames: PrintFrame[]; settings: SelectionPrintSettings; layout: PackedPages }
export interface SelectionImages extends SelectionPreview { images: Uint8Array[]; name: string }
interface Snapshot { preview: SelectionPreview; pageId: string; signature: string }

function selectedBoards(api: Penpot): Board[] {
  const shapes = api.selection;
  if (!shapes?.length) throw new Error('Select card frames in Penpot, then choose Use current selection.');
  if (shapes.length > MAX_PRINT_FRAMES) throw new Error(`Select at most ${MAX_PRINT_FRAMES} frames at a time.`);
  const selected = new Set(shapes.map(s => s.id));
  const roots = shapes.filter(shape => {
    for (let parent = shape.parent; parent; parent = parent.parent) if (selected.has(parent.id)) return false;
    return true;
  });
  if (roots.some(s => s.type !== 'board')) throw new Error('Select frames only. Put loose text and artwork inside a card frame first.');
  for (const shape of roots) {
    for (let s: Shape | null = shape; s; s = s.parent) {
      if (s.hidden) throw new Error(`“${shape.name}” is hidden. Show it before printing.`);
      if (Math.abs((s.rotation ?? 0) % 360) > 0.001) throw new Error(`“${shape.name}” is already rotated on the canvas. Use an unrotated frame; Allow rotating cards handles print rotation.`);
    }
  }
  return (roots as Board[]).sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/** Read/export only: never clones, moves, or replaces the user's frames. */
export class SelectedFramesPrinter {
  private snapshot: Snapshot | null = null;
  private serial = 0;
  private active: { token: string; requestId: string; ready: boolean; deadline: number } | null = null;
  constructor(private readonly api: Penpot) {}
  reset(): void { this.snapshot = null; this.active = null; }
  private signature(ids: readonly string[]): string {
    const page = this.api.currentPage;
    if (!page) throw new Error('Open a Penpot page first.');
    return JSON.stringify(ids.map(id => {
      const shape = page.getShapeById(id);
      if (shape?.type !== 'board') throw new Error('A selected frame was removed. Use current selection again.');
      // Parent transforms/visibility can change the exported result too.
      const parents = [];
      for (let p = shape.parent; p; p = p.parent) parents.push([p.id, p.x, p.y, p.rotation, p.hidden, p.opacity]);
      return [templateSignature(shape), parents];
    }));
  }
  preview(value: unknown): SelectionPreview {
    if (this.active && Date.now() < this.active.deadline) throw new Error('Wait for the selected-frame PDF to finish.');
    this.active = null; this.snapshot = null;
    const settings = parseSelectionSettings(value);
    const boards = selectedBoards(this.api);
    const frames = boards.map(({ id, name, width, height }) => ({ id, name, width, height }));
    const layout = packSelectedFrames(frames, settings);
    const preview = { token: `selection-${++this.serial}`, frames, settings, layout };
    this.snapshot = { preview, pageId: this.api.currentPage!.id, signature: this.signature(frames.map(f => f.id)) };
    return preview;
  }
  private require(token: unknown): Snapshot {
    const s = this.snapshot;
    if (!s || token !== s.preview.token || this.api.currentPage?.id !== s.pageId || s.signature !== this.signature(s.preview.frames.map(f => f.id))) {
      throw new Error('The selected frames changed. Use current selection to review and print again.');
    }
    return s;
  }
  async export(token: unknown, requestId: string, progress: (current: number, total: number) => void): Promise<SelectionImages> {
    if (this.active && Date.now() < this.active.deadline) throw new Error('Wait for the selected-frame PDF to finish.');
    const s = this.require(token);
    const op = { token: s.preview.token, requestId, ready: false, deadline: Date.now() + 120_000 };
    this.active = op;
    const images: Uint8Array[] = []; let bytes = 0;
    try {
      for (const [index, frame] of s.preview.frames.entries()) {
        this.require(token);
        const image = await this.api.currentPage!.getShapeById(frame.id)!.export({ type: 'png', scale: 1 });
        if (this.active !== op || Date.now() > op.deadline) throw new Error('Printing was canceled or timed out. Use current selection and try again.');
        this.require(token);
        bytes += image.byteLength;
        if (bytes > 256 * 1024 * 1024) throw new Error('The images exceed the 256 MiB limit. Select fewer frames.');
        images.push(image); progress(index + 1, s.preview.frames.length);
      }
      op.ready = true;
      return { ...s.preview, images, name: this.api.currentPage!.name };
    } catch (error) { if (this.active === op) this.active = null; throw error; }
  }
  check(token: unknown, requestId: string): void {
    if (!this.active?.ready || this.active.token !== token || this.active.requestId !== requestId || Date.now() > this.active.deadline) throw new Error('The print request expired. Use current selection and try again.');
    this.require(token);
  }
  finish(requestId: string): void { if (this.active?.requestId === requestId) this.active = null; }
}
