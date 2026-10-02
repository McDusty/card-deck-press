import { PDFDocument, PrintScaling, rgb } from 'pdf-lib';
import type { PaperSize } from './output-options';

export async function createSheetPdf(images: readonly Uint8Array[], paper: PaperSize): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('There are no sheets to download.');
  const dimensions: [number, number] = paper === 'letter' ? [612, 792] : [210 * 72 / 25.4, 297 * 72 / 25.4];
  const pdf = await PDFDocument.create();
  pdf.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  for (const [index, bytes] of images.entries()) {
    try {
      const image = await pdf.embedPng(bytes);
      const expectedWidth = Math.round(dimensions[0] / 72 * 300);
      const expectedHeight = Math.round(dimensions[1] / 72 * 300);
      if (Math.abs(image.width - expectedWidth) > 1 || Math.abs(image.height - expectedHeight) > 1) {
        throw new Error('The rendered sheet does not match its expected 300-ppi dimensions.');
      }
      const page = pdf.addPage(dimensions);
      page.drawRectangle({ x: 0, y: 0, width: dimensions[0], height: dimensions[1], color: rgb(1, 1, 1) });
      page.drawImage(image, { x: 0, y: 0, width: dimensions[0], height: dimensions[1] });
    } catch (error) {
      throw new Error(`Sheet ${index + 1}: ${error instanceof Error ? error.message : 'PDF rendering failed.'}`);
    }
  }
  return pdf.save();
}

export function pdfFilename(deckName: string, layout: string): string {
  const safeName = deckName.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'deck';
  return `${safeName}-${layout}.pdf`;
}
