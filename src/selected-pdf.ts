import { PDFDocument, PDFRawStream, PrintScaling, degrees, rgb } from 'pdf-lib';
import type { SelectionImages } from './selected-frames';

/** Compose original frame rasters at physical size; packing uses 300-ppi units. */
export async function createSelectedPdf(data: SelectionImages, assertCurrent: () => void = () => {}): Promise<Uint8Array> {
  const { frames, images, layout, settings } = data;
  if (images.length !== frames.length || images.reduce((n, v) => n + v.byteLength, 0) > 256 * 1024 * 1024) throw new Error('Invalid or oversized frame images. Select fewer frames.');
  const pdf = await PDFDocument.create();
  pdf.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  const embedded = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  for (const [index, frame] of frames.entries()) {
    assertCurrent();
    const bytes = images[index];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 33 || [137,80,78,71,13,10,26,10].some((n, i) => bytes[i] !== n) || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 || Math.abs(view.getUint32(16) - frame.width) > 1 || Math.abs(view.getUint32(20) - frame.height) > 1) {
      throw new Error(`“${frame.name}” did not render at its frame size. Check rotation, shadows, and artwork outside its bounds.`);
    }
    const image = await pdf.embedPng(bytes);
    await image.embed(); embedded.set(frame.id, image);
    const retained = pdf.context.enumerateIndirectObjects().reduce((n, [, o]) => n + (o instanceof PDFRawStream ? o.getContentsSize() : 0), 0);
    if (retained > 128 * 1024 * 1024) throw new Error('The PDF is too large. Select fewer frames.');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  const scale = 72 / 300;
  const c = settings.bufferColor;
  const buffer = rgb(parseInt(c.slice(1,3),16)/255, parseInt(c.slice(3,5),16)/255, parseInt(c.slice(5,7),16)/255);
  for (const cards of layout.pages) {
    assertCurrent();
    const page = pdf.addPage([layout.width * scale, layout.height * scale]);
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: rgb(1,1,1) });
    for (const card of cards) {
      const x = card.x * scale, y = (layout.height - card.y - card.height) * scale;
      const w = card.width * scale, h = card.height * scale, half = layout.gap * scale / 2;
      // Four strips keep transparent areas inside the card unchanged.
      if (half > 0) for (const r of [
        { x: x-half, y: y-half, width: w+2*half, height: half },
        { x: x-half, y: y+h, width: w+2*half, height: half },
        { x: x-half, y, width: half, height: h },
        { x: x+w, y, width: half, height: h },
      ]) page.drawRectangle({ ...r, color: buffer });
      const image = embedded.get(card.id)!;
      page.drawImage(image, card.rotated
        ? { x: x+w, y, width: h, height: w, rotate: degrees(90) }
        : { x, y, width: w, height: h });
    }
    if (settings.cutMarks) {
      // Local trim outlines never run through unrelated cards in mixed-size packs.
      // Merge coincident collinear edges so shared borders are drawn once.
      const lines = new Map<string, { vertical: boolean; position: number; intervals: [number, number][] }>();
      for (const card of cards) for (const [vertical, position, start, end] of [
        [true, card.x, card.y, card.y+card.height], [true, card.x+card.width, card.y, card.y+card.height],
        [false, card.y, card.x, card.x+card.width], [false, card.y+card.height, card.x, card.x+card.width],
      ] as [boolean, number, number, number][]) {
        const key = `${vertical}:${position.toFixed(6)}`;
        const line = lines.get(key) ?? { vertical, position, intervals: [] };
        line.intervals.push([start, end]); lines.set(key, line);
      }
      for (const line of lines.values()) {
        const merged: [number, number][] = [];
        for (const interval of line.intervals.sort((a,b) => a[0]-b[0])) {
          const previous = merged[merged.length-1];
          if (previous && interval[0] <= previous[1]+1e-7) previous[1] = Math.max(previous[1], interval[1]); else merged.push([...interval]);
        }
        for (const [start, end] of merged) page.drawLine({
          start: line.vertical ? { x: line.position*scale, y: (layout.height-start)*scale } : { x: start*scale, y: (layout.height-line.position)*scale },
          end: line.vertical ? { x: line.position*scale, y: (layout.height-end)*scale } : { x: end*scale, y: (layout.height-line.position)*scale },
          thickness: 0.25, color: rgb(0,0,0),
        });
      }
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  assertCurrent();
  const bytes = await pdf.save();
  if (bytes.byteLength > 256 * 1024 * 1024) throw new Error('The PDF exceeds the 256 MiB limit. Select fewer frames.');
  assertCurrent(); return bytes;
}
