import type { Board, Rectangle, Shape } from '@penpot/plugin-types';

// Four strips color only the buffer, never transparent areas inside the card.
export function addCardBuffer(create: () => Rectangle, container: Board, card: Pick<Shape, 'x' | 'y' | 'width' | 'height'>, gap: number, color: string): void {
  const half = gap / 2;
  for (const [x, y, width, height] of [
    [card.x - half, card.y - half, card.width + gap, half],
    [card.x - half, card.y + card.height, card.width + gap, half],
    [card.x - half, card.y, half, card.height],
    [card.x + card.width, card.y, half, card.height],
  ]) {
    const strip = create(); container.appendChild(strip);
    strip.name = 'Cutting buffer'; strip.resize(width, height);
    strip.x = x; strip.y = y;
    strip.fills = [{ fillColor: color, fillOpacity: 1 }]; strip.strokes = [];
  }
}
