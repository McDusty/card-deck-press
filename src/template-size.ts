import type { Board, Page, Penpot, Shape } from '@penpot/plugin-types';

export interface TemplateSizeInfo {
  templates: { name: string; width: number; height: number }[];
  canCorrectPoker: boolean;
}

interface SizeCorrection {
  template: Board;
  width: number;
  height: number;
  border: Board | undefined;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

function templates(page: Page): Board[] {
  if (!('children' in page.root)) return [];
  return page.root.children.filter((shape): shape is Board => shape.type === 'board' && (shape.name === 'Front' || shape.name === 'Back'));
}

function correction(template: Board): SizeCorrection | null {
  const portrait = near(template.width, 750) && (near(template.height, 1039) || near(template.height, 1050));
  const landscape = near(template.height, 750) && (near(template.width, 1039) || near(template.width, 1050));
  if (!portrait && !landscape) return null;
  const width = portrait ? 750 : 1050;
  const height = portrait ? 1050 : 750;
  const border = template.children.find((shape): shape is Board => {
    if (shape.type !== 'board' || shape.name !== 'inside') return false;
    const inset = near(shape.x - template.x, 24) && near(shape.y - template.y, 24);
    const edge = near(shape.x, template.x) && near(shape.y, template.y);
    const shortSide = portrait ? shape.width : shape.height;
    const longSide = portrait ? shape.height : shape.width;
    return (inset && near(shortSide, 702) && (near(longSide, 991) || near(longSide, 1002)))
      || (edge && near(shortSide, 750) && near(longSide, 1039));
  });
  return !near(template.width, width) || !near(template.height, height) || border
    ? { template, width, height, border } : null;
}

export function getTemplateSizeInfo(page: Page | null): TemplateSizeInfo {
  const boards = page ? templates(page) : [];
  return {
    templates: boards.map(board => ({ name: board.name, width: board.width, height: board.height })),
    canCorrectPoker: boards.some(board => correction(board) !== null),
  };
}

function descendants(shape: Shape): Shape[] {
  return [shape, ...('children' in shape ? shape.children.flatMap(descendants) : [])];
}

export function correctPokerTemplates(api: Penpot): TemplateSizeInfo {
  const page = api.currentPage;
  if (!page) throw new Error('Open the deck page first.');
  const boards = templates(page);
  for (const name of ['Front', 'Back']) {
    if (boards.filter(board => board.name === name).length > 1) throw new Error(`Keep only one top-level ${name} template before correcting its size.`);
  }
  const changes = boards.map(correction).filter((change): change is SizeCorrection => change !== null);
  if (changes.length === 0) throw new Error('No older poker template needs correction. The poker size is 750 × 1050 px.');
  const snapshots = changes.flatMap(change => descendants(change.template)).map(shape => ({
    shape, width: shape.width, height: shape.height, x: shape.x, y: shape.y,
  }));
  const resized = new Set<Shape>(changes.flatMap(change => [change.template, ...(change.border ? [change.border] : [])]));
  const block = api.history.undoBlockBegin();
  try {
    for (const { template, width, height, border } of changes) {
      template.resize(width, height);
      if (border) {
        border.resize(width, height);
        border.x = template.x;
        border.y = template.y;
      }
    }
    // Restore parent geometry before children: extending a border must not
    // reposition or stretch the custom artwork nested inside it.
    for (const snapshot of snapshots) {
      if (resized.has(snapshot.shape)) continue;
      snapshot.shape.resize(snapshot.width, snapshot.height);
      snapshot.shape.x = snapshot.x;
      snapshot.shape.y = snapshot.y;
    }
  } catch (error) {
    for (const snapshot of snapshots) {
      snapshot.shape.resize(snapshot.width, snapshot.height);
      snapshot.shape.x = snapshot.x;
      snapshot.shape.y = snapshot.y;
    }
    throw error;
  } finally {
    api.history.undoBlockFinish(block);
  }
  return getTemplateSizeInfo(page);
}
