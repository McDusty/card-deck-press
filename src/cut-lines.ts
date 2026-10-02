import { CANVAS_UNITS_PER_MM } from './front-layout';
import type { FrontLayout } from './front-layout';

export interface CutLine {
  x: number;
  y: number;
  width: number;
  height: number;
}

const THICKNESS = 0.1 * CANVAS_UNITS_PER_MM;

// Cards on sheets share trim edges, so each grid boundary has one guide.
// Boundary indices also avoid duplicate lines from floating-point coordinates.
export function calculateCutLines(layout: FrontLayout, cardWidth: number, cardHeight: number, count: number): CutLine[] {
  const columns = new Set<number>();
  const rows = new Set<number>();
  for (let slot = 0; slot < count; slot++) {
    const column = slot % layout.columns;
    const row = Math.floor(slot / layout.columns);
    columns.add(column);
    columns.add(column + 1);
    rows.add(row);
    rows.add(row + 1);
  }
  return [
    ...[...columns].map(column => ({ x: layout.startX + column * cardWidth - THICKNESS / 2, y: layout.margin, width: THICKNESS, height: layout.height - 2 * layout.margin })),
    ...[...rows].map(row => ({ x: layout.margin, y: layout.startY + row * cardHeight - THICKNESS / 2, width: layout.width - 2 * layout.margin, height: THICKNESS })),
  ];
}
