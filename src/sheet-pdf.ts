import { PDFDocument, PDFRawStream, PrintScaling, rgb } from 'pdf-lib';
import type { PaperSize } from './output-options';

const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_EMBEDDED_BYTES = 128 * 1024 * 1024;
interface PdfOptions { assertCurrent?: () => void; landscape?: boolean; pageSize?: [number, number] }

export async function createSheetPdf(images: readonly Uint8Array[], paper: PaperSize, options: PdfOptions = {}): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('There are no sheets to download.');
  if (images.length > 1000 || images.reduce((sum, bytes) => sum + bytes.byteLength, 0) > MAX_INPUT_BYTES) throw new Error('The PDF is too large. Export fewer cards at a time.');
  const dimensions: [number, number] = options.pageSize ? [...options.pageSize] : paper === 'letter' ? [612, 792] : [210 * 72 / 25.4, 297 * 72 / 25.4];
  if (dimensions.some(size => !Number.isFinite(size) || size <= 0 || size > 12000 * 72 / 300)) throw new Error('Invalid PDF page size.');
  if (options.landscape) dimensions.reverse();
  const expectedWidth = Math.round(dimensions[0] / 72 * 300);
  const expectedHeight = Math.round(dimensions[1] / 72 * 300);
  const pdf = await PDFDocument.create();
  pdf.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  for (const [index, bytes] of images.entries()) {
    try {
      options.assertCurrent?.();
      // Reject oversized images before the PNG decoder allocates their pixels.
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (bytes.length < 33 || signature.some((value, offset) => bytes[offset] !== value) ||
          view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
          Math.abs(view.getUint32(16) - expectedWidth) > 1 || Math.abs(view.getUint32(20) - expectedHeight) > 1) {
        throw new Error('The rendered sheet does not match its expected 300-ppi dimensions.');
      }
      const image = await pdf.embedPng(bytes);
      if (Math.abs(image.width - expectedWidth) > 1 || Math.abs(image.height - expectedHeight) > 1) {
        throw new Error('The rendered sheet does not match its expected 300-ppi dimensions.');
      }
      const page = pdf.addPage(dimensions);
      page.drawRectangle({ x: 0, y: 0, width: dimensions[0], height: dimensions[1], color: rgb(1, 1, 1) });
      page.drawImage(image, { x: 0, y: 0, width: dimensions[0], height: dimensions[1] });
      // embedPng defers compression by default. Materialize each image now so
      // pdf-lib releases its decoded channels before the next sheet is loaded.
      await image.embed();
      const retained = pdf.context.enumerateIndirectObjects().reduce((sum, [, object]) => sum + (object instanceof PDFRawStream ? object.getContentsSize() : 0), 0);
      if (retained > MAX_EMBEDDED_BYTES) throw new Error('The PDF is too large. Export fewer cards at a time.');
      // Let page changes and edits arrive between CPU-heavy PNG operations.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      options.assertCurrent?.();
    } catch (error) {
      throw new Error(`Sheet ${index + 1}: ${error instanceof Error ? error.message : 'PDF rendering failed.'}`);
    }
  }
  options.assertCurrent?.();
  return pdf.save();
}

export function pdfFilename(deckName: string, layout: string): string {
  const safeName = deckName.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'deck';
  return `${safeName}-${layout}.pdf`;
}
