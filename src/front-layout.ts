import type { FaceMode, PaperOrientation, PaperSize } from './output-options';

// Preserve the existing Cardforge template coordinates (300 pixels per inch).
// These are editable sheet boards, not a claim about native PDF export size.
export const CANVAS_UNITS_PER_MM = 300 / 25.4;
export const SHEET_MARGIN = 5 * CANVAS_UNITS_PER_MM;
export const CARD_GAP = 2 * CANVAS_UNITS_PER_MM;
export const PAGE_GAP = 100;
// Millimetre-to-pixel conversion can put an exact fit a few ulps over an edge.
// This tolerance is below one millionth of a pixel, not printable extra space.
const FIT_EPSILON = 1e-7;

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

export function calculateFrontLayout(mode: FaceMode, width: number, height: number, count: number, paper: PaperSize, paperOrientation: PaperOrientation = 'auto', gapMm = 0): FrontLayout {
  if (!Number.isFinite(gapMm) || gapMm < 0 || gapMm > 10) throw new Error('Choose card spacing between 0 and 10 mm.');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The card template must have a valid width and height.');
  }
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Add at least one card before forging.');
  if (mode.endsWith('-single')) {
    return { width: count * width + (count - 1) * CARD_GAP, height, columns: count, rows: 1, perPage: count, pageCount: 1, startX: 0, startY: 0, margin: 0, gap: CARD_GAP };
  }
  let pageWidth = (paper === 'a4' ? 210 : 215.9) * CANVAS_UNITS_PER_MM;
  let pageHeight = (paper === 'a4' ? 297 : 279.4) * CANVAS_UNITS_PER_MM;
  const marginMm = 5;
  const margin = marginMm * CANVAS_UNITS_PER_MM;
  const gap = gapMm * CANVAS_UNITS_PER_MM;
  let columns = mode.endsWith('-6') ? 2 : 3;
  let rows = 3;
  if (mode.endsWith('-auto')) {
    // Keep each card's orientation and physical size. Turn the paper instead.
    const fit = (w: number, h: number) => ({
      columns: Math.floor((w - 2 * margin + FIT_EPSILON) / (width + gap)),
      rows: Math.floor((h - 2 * margin + FIT_EPSILON) / (height + gap)),
    });
    const portrait = fit(pageWidth, pageHeight);
    const landscape = fit(pageHeight, pageWidth);
    const rotate = paperOrientation === 'landscape' || (paperOrientation === 'auto' && landscape.columns * landscape.rows > portrait.columns * portrait.rows);
    if (rotate) [pageWidth, pageHeight] = [pageHeight, pageWidth];
    ({ columns, rows } = rotate ? landscape : portrait);
    if (columns === 0 || rows === 0) throw new Error(`This card does not fit on ${paper === 'a4' ? 'A4' : 'US Letter'} in ${paperOrientation === 'auto' ? 'either orientation' : paperOrientation} with 5 mm margins. Change page orientation or choose single cards. Cards will not be shrunk.`);
  } else {
    const fits = (w: number, h: number) => columns * (width + gap) <= w - 2 * margin + FIT_EPSILON && rows * (height + gap) <= h - 2 * margin + FIT_EPSILON;
    if (paperOrientation === 'landscape' || (paperOrientation === 'auto' && !fits(pageWidth, pageHeight) && fits(pageHeight, pageWidth))) {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }
  }
  const gridWidth = columns * width + (columns - 1) * gap;
  const gridHeight = rows * height + (rows - 1) * gap;
  if (gridWidth + gap > pageWidth - 2 * margin + FIT_EPSILON || gridHeight + gap > pageHeight - 2 * margin + FIT_EPSILON) {
    throw new Error(`${columns * rows} cards do not fit on ${paper === 'a4' ? 'A4' : 'US Letter'} in ${paperOrientation === 'auto' ? 'either orientation' : paperOrientation} with ${marginMm} mm margins and ${gapMm} mm gaps. Change page orientation or choose another layout. Cards will not be shrunk.`);
  }
  return { width: pageWidth, height: pageHeight, columns, rows, perPage: columns * rows, pageCount: Math.ceil(count / (columns * rows)), startX: (pageWidth - gridWidth) / 2, startY: (pageHeight - gridHeight) / 2, margin, gap };
}
