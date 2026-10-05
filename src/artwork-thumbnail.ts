import type { Page } from '@penpot/plugin-types';

export interface ArtworkThumbnail { reference: string; data: Uint8Array }

// Render through Penpot so self-hosted media and authenticated assets work too.
export async function artworkThumbnail(page: Page, reference: unknown): Promise<ArtworkThumbnail> {
  if (typeof reference !== 'string' || reference.length > 300) throw new Error('Invalid artwork reference.');
  const parts = reference.split('|');
  if (parts.length !== 2 || parts.some(part => !part)) throw new Error('Invalid artwork reference.');
  const shape = page.getShapeById(parts[0]);
  const matches = () => {
    const current = page.getShapeById(parts[0]);
    return current?.type === 'rectangle' && current.fills.length === 1 && current.fills[0].fillImage?.id === parts[1];
  };
  if (!shape || !matches()) throw new Error('This artwork image changed or was removed. Refresh Artwork.');
  const size = Math.max(shape.width, shape.height);
  if (!Number.isFinite(size) || size <= 0) throw new Error('This artwork has invalid dimensions.');
  const data = await shape.export({ type: 'png', scale: Math.min(1, 128 / size) });
  if (!matches()) throw new Error('This artwork image changed while its preview was loading.');
  if (!data.length || data.length > 1024 * 1024) throw new Error('This artwork preview could not be rendered.');
  return { reference, data };
}
