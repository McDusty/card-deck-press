import type { FaceMode, PaperSize } from './output-options';

// Preserve the existing Cardforge template coordinates (300 pixels per inch).
// These are editable sheet boards, not a claim about native PDF export size.
export const CANVAS_UNITS_PER_MM = 300 / 25.4;
export const SHEET_MARGIN = 5 * CANVAS_UNITS_PER_MM;
export const CARD_GAP = 2 * CANVAS_UNITS_PER_MM;
export const PAGE_GAP = 100;

export interface FrontLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  perPage: number;
  pageCount: number;
  startX: number;
  startY: number;
  margin: number;
  gap: number;
}

export function calculateFrontLayout(mode: FaceMode, width: number, height: number, count: number, paper: PaperSize): FrontLayout {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The card template must have a valid width and height.');
  }
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Add at least one card before forging.');
  if (mode.endsWith('-single')) {
    return { width: count * width + (count - 1) * CARD_GAP, height, columns: count, rows: 1, perPage: count, pageCount: 1, startX: 0, startY: 0, margin: 0, gap: CARD_GAP };
  }
  const pageWidth = (paper === 'a4' ? 210 : 215.9) * CANVAS_UNITS_PER_MM;
  const pageHeight = (paper === 'a4' ? 297 : 279.4) * CANVAS_UNITS_PER_MM;
  const marginMm = 5;
  const margin = marginMm * CANVAS_UNITS_PER_MM;
  const gapMm = 0;
  const gap = gapMm * CANVAS_UNITS_PER_MM;
  const columns = mode.endsWith('-6') ? 2 : 3;
  const rows = 3;
  const gridWidth = columns * width + (columns - 1) * gap;
  const gridHeight = rows * height + (rows - 1) * gap;
  if (gridWidth > pageWidth - 2 * margin || gridHeight > pageHeight - 2 * margin) {
    throw new Error(`${columns * rows} cards do not fit on ${paper === 'a4' ? 'A4' : 'US Letter'} with ${marginMm} mm margins and ${gapMm} mm gaps. Choose a larger sheet or another layout. Cards will not be shrunk.`);
  }
  return { width: pageWidth, height: pageHeight, columns, rows, perPage: columns * rows, pageCount: Math.ceil(count / (columns * rows)), startX: (pageWidth - gridWidth) / 2, startY: (pageHeight - gridHeight) / 2, margin, gap };
}
