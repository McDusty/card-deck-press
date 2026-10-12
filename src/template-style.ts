import type { Board, Penpot } from '@penpot/plugin-types';
import { isIndexCardSize, PIXELS_PER_INCH } from './card-sizes';

export type TemplateStyle = 'title-image' | 'blank' | 'ruled';

export function resolveTemplateStyle(value: unknown, size: string): TemplateStyle {
  if (value === undefined) return isIndexCardSize(size) ? 'blank' : 'title-image';
  if (value === 'title-image' || value === 'blank' || value === 'ruled') return value;
  throw new Error('Choose Title and image, Blank, or Ruled for the template style.');
}

// Editable shapes, spaced a quarter inch apart at the same 300 ppi as cards.
export function addRuling(api: Penpot, inside: Board): void {
  const inset = Math.min(PIXELS_PER_INCH / 4, inside.width * 0.08);
  const firstLine = Math.min(PIXELS_PER_INCH * 0.75, inside.height * 0.2);
  const bottom = Math.min(PIXELS_PER_INCH / 4, inside.height * 0.08);
  const thickness = Math.min(1.5, inside.height * 0.01);
  for (let y = firstLine, index = 0; y + thickness <= inside.height - bottom; y += PIXELS_PER_INCH / 4, index++) {
    const line = api.createRectangle();
    // Attach before configuring so creation rollback removes every new shape.
    inside.appendChild(line);
    line.name = index === 0 ? 'Heading rule' : `Writing rule ${index}`;
    line.resize(inside.width - 2 * inset, thickness);
    line.x = inside.x + inset; line.y = inside.y + y;
    line.fills = [{ fillColor: index === 0 ? '#B56D6D' : '#6F8FAD', fillOpacity: 1 }];
    line.strokes = [];
  }
}
