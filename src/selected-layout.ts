import type { PaperOrientation, PaperSize } from './output-options';
import { CANVAS_UNITS_PER_MM } from './front-layout';

export interface PrintFrame { id: string; name: string; width: number; height: number }
export interface SelectionPrintSettings {
  paper: PaperSize;
  paperOrientation: PaperOrientation;
  allowRotation: boolean;
  gapMm: number;
  marginMm: number;
  bufferColor: string;
  cutMarks: boolean;
}
export interface FramePlacement { id: string; x: number; y: number; width: number; height: number; rotated: boolean }
export interface PackedPages { width: number; height: number; gap: number; pages: FramePlacement[][] }
type Rect = { x: number; y: number; width: number; height: number };
const EPS = 1e-7;
export const MAX_PRINT_FRAMES = 500;

export function parseSelectionSettings(value: unknown): SelectionPrintSettings {
  if (!value || typeof value !== 'object') throw new Error('Choose print settings.');
  const s = value as Record<string, unknown>;
  if (s.paper !== 'letter' && s.paper !== 'a4') throw new Error('Choose Letter or A4 paper.');
  if (!['auto', 'portrait', 'landscape'].includes(String(s.paperOrientation))) throw new Error('Choose a page orientation.');
  if (typeof s.allowRotation !== 'boolean' || typeof s.cutMarks !== 'boolean') throw new Error('Choose rotation and cut-line options.');
  if (typeof s.marginMm !== 'number' || !Number.isFinite(s.marginMm) || s.marginMm < 0 || s.marginMm > 50) throw new Error('Choose a page margin between 0 and 50 mm.');
  if (typeof s.gapMm !== 'number' || !Number.isFinite(s.gapMm) || s.gapMm < 0 || s.gapMm > 10) throw new Error('Choose spacing between 0 and 10 mm.');
  if (typeof s.bufferColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(s.bufferColor)) throw new Error('Choose a valid buffer color.');
  return { paper: s.paper, paperOrientation: s.paperOrientation as PaperOrientation, allowRotation: s.allowRotation, cutMarks: s.cutMarks, gapMm: s.gapMm, marginMm: s.marginMm, bufferColor: s.bufferColor.toUpperCase() };
}

function splitFree(free: Rect[], used: Rect): Rect[] {
  const split = free.flatMap(r => {
    if (used.x >= r.x + r.width - EPS || used.x + used.width <= r.x + EPS || used.y >= r.y + r.height - EPS || used.y + used.height <= r.y + EPS) return [r];
    const parts: Rect[] = [];
    if (used.x > r.x + EPS) parts.push({ ...r, width: used.x - r.x });
    if (used.x + used.width < r.x + r.width - EPS) parts.push({ ...r, x: used.x + used.width, width: r.x + r.width - used.x - used.width });
    if (used.y > r.y + EPS) parts.push({ ...r, height: used.y - r.y });
    if (used.y + used.height < r.y + r.height - EPS) parts.push({ ...r, y: used.y + used.height, height: r.y + r.height - used.y - used.height });
    return parts;
  });
  return split.filter((r, i) => !split.some((s, j) => j !== i && s.x <= r.x + EPS && s.y <= r.y + EPS && s.x + s.width >= r.x + r.width - EPS && s.y + s.height >= r.y + r.height - EPS &&
    (j < i || s.width > r.width + EPS || s.height > r.height + EPS)));
}

function pack(frames: PrintFrame[], width: number, height: number, gap: number, marginMm: number, rotation: boolean, scoreArea: boolean): FramePlacement[][] {
  const margin = marginMm * CANVAS_UNITS_PER_MM;
  const bins: { free: Rect[]; cards: FramePlacement[] }[] = [];
  for (const frame of frames) {
    let placed = false;
    for (let p = 0; p <= bins.length; p++) {
      if (p === bins.length) bins.push({ free: [{ x: margin, y: margin, width: width - 2 * margin, height: height - 2 * margin }], cards: [] });
      const bin = bins[p];
      let best: { rect: Rect; rotated: boolean; score: number; tie: number } | undefined;
      for (const r of bin.free) for (const rotated of rotation ? [false, true] : [false]) {
        const w = (rotated ? frame.height : frame.width) + gap;
        const h = (rotated ? frame.width : frame.height) + gap;
        if (w > r.width + EPS || h > r.height + EPS) continue;
        const short = Math.min(r.width - w, r.height - h);
        const area = r.width * r.height - w * h;
        const score = scoreArea ? area : short;
        const tie = scoreArea ? short : Math.max(r.width - w, r.height - h);
        if (!best || score < best.score - EPS || (Math.abs(score - best.score) < EPS && tie < best.tie - EPS)) best = { rect: { x: r.x, y: r.y, width: w, height: h }, rotated, score, tie };
      }
      if (best) {
        bin.cards.push({ id: frame.id, x: best.rect.x + gap / 2, y: best.rect.y + gap / 2, width: best.rotated ? frame.height : frame.width, height: best.rotated ? frame.width : frame.height, rotated: best.rotated });
        bin.free = splitFree(bin.free, best.rect); placed = true; break;
      }
      if (!bin.cards.length) break;
    }
    if (!placed) throw new Error(`“${frame.name}” does not fit with ${marginMm} mm margins and this spacing. Try rotation, another paper orientation, or smaller margins/spacing. Frames are never shrunk.`);
  }
  return bins.map(b => b.cards);
}

export function packSelectedFrames(frames: readonly PrintFrame[], settings: SelectionPrintSettings): PackedPages {
  if (!frames.length || frames.length > MAX_PRINT_FRAMES) throw new Error(`Select between 1 and ${MAX_PRINT_FRAMES} card frames.`);
  if (new Set(frames.map(f => f.id)).size !== frames.length) throw new Error('The frame selection contains duplicates. Select frames again.');
  for (const f of frames) if (![f.width, f.height].every(v => Number.isFinite(v) && v >= 1 && v <= 12000)) throw new Error(`“${f.name}” has invalid dimensions.`);
  const gap = settings.gapMm * CANVAS_UNITS_PER_MM;
  const portrait = (settings.paper === 'a4' ? [210, 297] : [215.9, 279.4]).map(n => n * CANVAS_UNITS_PER_MM);
  const orientations = settings.paperOrientation === 'auto' ? [portrait, [...portrait].reverse()] : [settings.paperOrientation === 'landscape' ? [...portrait].reverse() : portrait];
  const weights = [(f: PrintFrame) => f.width * f.height, (f: PrintFrame) => Math.max(f.width, f.height), (f: PrintFrame) => f.height, (f: PrintFrame) => f.width];
  let best: PackedPages | undefined;
  let failure: unknown;
  for (const [width, height] of orientations) for (const weight of weights) for (const scoreArea of [false, true]) {
    const sorted = [...frames].sort((a, b) => weight(b) - weight(a));
    try {
      const pages = pack(sorted, width, height, gap, settings.marginMm, settings.allowRotation, scoreArea);
      if (!best || pages.length < best.pages.length || (pages.length === best.pages.length && pages[0].length > best.pages[0].length)) best = { width, height, gap, pages };
    } catch (error) { failure = error; }
  }
  if (!best) throw failure;
  return best;
}
