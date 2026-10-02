import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';
import { PDFDocument, PDFName } from 'pdf-lib';

const folder = mkdtempSync(join(tmpdir(), 'cardforge-pdf-'));
after(() => rmSync(folder, { recursive: true, force: true }));
await build({ entryPoints: ['src/sheet-pdf.ts'], outfile: join(folder, 'pdf.mjs'), bundle: true, platform: 'node', format: 'esm', plugins: [{name:'shared-pdf-lib',setup(build){build.onResolve({filter:/^pdf-lib$/},()=>({path:join(process.cwd(),'node_modules/pdf-lib/cjs/index.js'),external:true}));}}] });
const { createSheetPdf, pdfFilename } = await import(pathToFileURL(join(folder, 'pdf.mjs')));

// Portable solid-color PNG fixtures, with real dimensions and checksums.
function png(width, height, shade = 255) {
  function chunk(name, bytes) {
    const type = Buffer.from(name);
    const input = Buffer.concat([type, bytes]);
    let crc = 0xffffffff;
    for (const byte of input) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, input, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height, shade);
  for (let row = 0; row < height; row++) pixels[row * stride] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

for (const [paper, width, height, points] of [['letter',2550,3300,[612,792]], ['a4',2480,3508,[210*72/25.4,297*72/25.4]]]) {
  test(`${paper}: PDF retains all pages with exact physical dimensions and no print scaling`, async () => {
    const bytes = await createSheetPdf([png(width,height),png(width,height,200)], paper);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    for (const page of pdf.getPages()) {
      assert.ok(Math.abs(page.getWidth() - points[0]) < 0.001);
      assert.ok(Math.abs(page.getHeight() - points[1]) < 0.001);
    }
    const preferences = pdf.catalog.lookup(PDFName.of('ViewerPreferences'));
    assert.equal(preferences.get(PDFName.of('PrintScaling')).toString(), '/None');
  });
}

test('empty or mismatched PNGs block the whole PDF', async () => {
  await assert.rejects(createSheetPdf([], 'letter'), /no sheets/);
  await assert.rejects(createSheetPdf([png(2550,3300),png(100,100)], 'letter'), /Sheet 2.*dimensions/);
});

test('download names are safe and readable', () => {
  assert.equal(pdfFilename('../My Deck!','backs-9'),'My-Deck-backs-9.pdf');
});

test('PDF assembly compresses each sheet before decoding the next', async () => {
  const create = PDFDocument.create;
  let active = 0, peak = 0;
  PDFDocument.create = async (...args) => {
    const pdf = await create.apply(PDFDocument, args);
    const embed = pdf.embedPng.bind(pdf);
    pdf.embedPng = async bytes => {
      active++; peak = Math.max(peak, active);
      const image = await embed(bytes); const finish = image.embed.bind(image); let completed = false;
      image.embed = async () => { await finish(); if (!completed) { completed = true; active--; } };
      return image;
    };
    return pdf;
  };
  try {
    const bytes = await createSheetPdf([png(2550,3300),png(2550,3300,200),png(2550,3300,128)], 'letter');
    assert.equal(peak, 1); assert.equal(active, 0);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 3);
  } finally { PDFDocument.create = create; }
});

test('oversized PNG dimensions are rejected before decoding', async () => {
  const create = PDFDocument.create; let decoded = false;
  PDFDocument.create = async (...args) => {
    const pdf = await create.apply(PDFDocument, args);
    pdf.embedPng = async () => { decoded = true; throw new Error('Should not decode'); };
    return pdf;
  };
  try {
    const oversized = Buffer.from(png(2550,3300)); oversized.writeUInt32BE(50000, 16);
    await assert.rejects(createSheetPdf([oversized], 'letter'), /dimensions/);
    assert.equal(decoded, false);
  } finally { PDFDocument.create = create; }
});

test('an edit delivered between sheet operations aborts PDF assembly', async () => {
  let changed = false; let scheduled = false;
  const assertCurrent = () => {
    if (changed) throw new Error('Deck changed');
    if (!scheduled) { scheduled = true; setTimeout(() => { changed = true; }, 0); }
  };
  await assert.rejects(createSheetPdf([png(2550,3300),png(2550,3300)], 'letter', {assertCurrent}), /Deck changed/);
});
