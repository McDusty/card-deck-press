import type { Board, Page, Shape } from '@penpot/plugin-types';

export function cloneTracked(page: Page, source: Shape, created: Shape[]): Shape {
  const before = new Set((page.root as Board).children.map(child => child.id));
  try {
    const copy = source.clone(); created.push(copy); return copy;
  } catch (error) {
    // Clean up a partial copy left by this synchronous clone operation only.
    for (const child of [...(page.root as Board).children]) if (!before.has(child.id)) child.remove();
    throw error;
  }
}
