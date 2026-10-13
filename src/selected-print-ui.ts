import { createSelectedPdf } from './selected-pdf';
import { pdfFilename } from './sheet-pdf';
import { setBusy } from './busy-ui';
import type { SelectionPreview, SelectionImages } from './selected-frames';
import type { BaseEvent } from './model';

export function initSelectedPrintUi(send: (type: string, data: unknown, requestId: string) => void) {
  const modeTabs = ['export-mode-deck', 'export-mode-selection'].map(id => document.getElementById(id) as HTMLButtonElement);
  let selectedMode: 'deck' | 'selection' = 'deck';
  const form = document.getElementById('selected-print-form') as HTMLFormElement;
  const summary = document.getElementById('selected-print-summary')!;
  const status = document.getElementById('selected-print-status')!;
  const error = document.getElementById('selected-print-error')!;
  const pages = document.getElementById('selected-print-pages')!;
  const download = document.getElementById('selected-print-download') as HTMLButtonElement;
  let preview: SelectionPreview | null = null;
  let previewId: string | null = null;
  let operation: string | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let check: { resolve(): void; reject(error: Error): void } | null = null;
  const settings = () => ({
    paper: (document.getElementById('selected-print-paper') as HTMLSelectElement).value,
    paperOrientation: (document.getElementById('selected-print-orientation') as HTMLSelectElement).value,
    marginMm: (document.getElementById('selected-print-margin') as HTMLInputElement).valueAsNumber,
    gapMm: (document.getElementById('selected-print-gap') as HTMLInputElement).valueAsNumber,
    bufferColor: (document.getElementById('selected-print-color') as HTMLInputElement).value,
    allowRotation: (document.getElementById('selected-print-rotate') as HTMLInputElement).checked,
    cutMarks: (document.getElementById('selected-print-cuts') as HTMLInputElement).checked,
  });
  function busy(on: boolean) {
    modeTabs.forEach(tab => tab.disabled = on);
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach(el => el.disabled = on);
    download.disabled = on || !preview;
    (document.getElementById('selected-print-color') as HTMLInputElement).disabled = on || settings().gapMm === 0;
    setBusy(status, on);
  }
  function reset() {
    if (operation) send('selection-print-finish', null, operation);
    clearTimeout(timeout); timeout = undefined;
    check?.reject(new Error('Printing canceled. Select frames again.')); check = null;
    operation = null; previewId = null; preview = null;
    status.textContent = ''; error.textContent = '';
    summary.textContent = 'Select card frames in Penpot, then choose Use current selection.';
    pages.replaceChildren(); busy(false);
  }
  function fail(message: string) {
    const id = operation;
    check?.reject(new Error(message)); check = null;
    clearTimeout(timeout); operation = null; previewId = null; preview = null;
    if (id) send('selection-print-finish', null, id);
    status.textContent = ''; error.textContent = message;
    summary.textContent = 'Use current selection to review the layout again.';
    pages.replaceChildren(); busy(false);
  }
  function readSelection() {
    if (operation) return;
    preview = null; download.disabled = true; error.textContent = ''; pages.replaceChildren();
    previewId = crypto.randomUUID();
    status.textContent = 'Checking selected frames…'; setBusy(status, true);
    clearTimeout(timeout);
    const id = previewId;
    timeout = setTimeout(() => { if (previewId === id) fail('Penpot did not respond. Reopen the plugin and try again.'); }, 20_000);
    send('selection-print-preview', settings(), id);
  }
  function render(data: SelectionPreview) {
    const { layout } = data;
    summary.textContent = `${data.frames.length} frames · ${layout.pages.length} ${layout.pages.length === 1 ? 'page' : 'pages'} · ${layout.width > layout.height ? 'Landscape' : 'Portrait'} · ${data.settings.marginMm} mm margins · 300 ppi · Full size`;
    const names = new Map(data.frames.map(f => [f.id, f.name]));
    pages.replaceChildren();
    // Limit DOM size for very large selections; the page count still includes all pages.
    layout.pages.slice(0, 12).forEach((cards, index) => {
      const figure = document.createElement('figure');
      const canvas = document.createElement('canvas'); canvas.width = 260; canvas.height = Math.round(260 * layout.height / layout.width);
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Page ${index+1}: ${cards.length} frames`);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const scale = 260 / layout.width;
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        cards.forEach((card, slot) => {
          const x = card.x*scale, y = card.y*scale, w = card.width*scale, h = card.height*scale;
          const gap = layout.gap*scale;
          ctx.fillStyle = data.settings.bufferColor; ctx.fillRect(x-gap/2,y-gap/2,w+gap,h+gap);
          ctx.fillStyle = '#E4ECEA'; ctx.fillRect(x,y,w,h); ctx.strokeStyle = '#166653'; ctx.lineWidth = 1; ctx.strokeRect(x,y,w,h);
          ctx.save(); ctx.beginPath(); ctx.rect(x+2,y+2,Math.max(0,w-4),Math.max(0,h-4)); ctx.clip();
          ctx.fillStyle = '#16352E'; ctx.font = '10px sans-serif'; ctx.fillText(`${slot+1}. ${names.get(card.id) ?? 'Frame'}${card.rotated ? ' ↻' : ''}`,x+5,y+14); ctx.restore();
        });
      }
      const caption = document.createElement('figcaption'); caption.textContent = `Page ${index+1}: ${cards.length} frames`;
      figure.append(canvas, caption); pages.append(figure);
    });
    if (layout.pages.length > 12) { const note = document.createElement('p'); note.textContent = `Showing the first 12 of ${layout.pages.length} pages.`; pages.append(note); }
  }
  async function assemble(data: SelectionImages, id: string) {
    let url: string | undefined;
    const current = () => { if (operation !== id) throw new Error('Print settings or page changed. Review the selection again.'); };
    try {
      status.textContent = 'Building PDF…';
      data.images = data.images.map(image => image instanceof Uint8Array ? image : new Uint8Array(image));
      const bytes = await createSelectedPdf(data, current);
      current();
      await new Promise<void>((resolve, reject) => {
        check = { resolve, reject }; send('selection-print-check', data.token, id);
      });
      current();
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = pdfFilename(data.name || 'cards', 'selected-frames');
      document.body.appendChild(a); a.click(); a.remove();
      status.textContent = 'PDF downloaded. Print at Actual Size / 100%, with Fit to Page off.';
    } catch (issue) { if (operation === id) fail(issue instanceof Error ? issue.message : 'PDF creation failed.'); }
    finally {
      send('selection-print-finish', null, id);
      if (operation === id) { operation = null; check = null; clearTimeout(timeout); busy(false); }
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 30_000);
    }
  }
  function selectMode(mode: 'deck' | 'selection') {
    if (operation || selectedMode === mode) return;
    selectedMode = mode;
    const selected = mode === 'selection';
    document.getElementById('box-forge')!.classList.toggle('hidden', selected);
    form.classList.toggle('hidden', !selected);
    modeTabs.forEach((tab, index) => {
      const active = index === (selected ? 1 : 0);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    reset(); if (selected) readSelection();
  }
  modeTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectMode(index === 0 ? 'deck' : 'selection'));
    tab.addEventListener('keydown', event => {
      if (operation) return;
      let next: number;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 1;
      else return;
      event.preventDefault();
      selectMode(next === 0 ? 'deck' : 'selection');
      modeTabs[next].focus();
    });
  });
  form.addEventListener('change', () => readSelection());
  document.getElementById('selected-print-refresh')!.addEventListener('click', readSelection);
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!preview || operation) return;
    previewId = null; operation = crypto.randomUUID(); busy(true); error.textContent = ''; status.textContent = 'Rendering selected frames…';
    const id = operation;
    clearTimeout(timeout); timeout = setTimeout(() => { if (operation === id) fail('Printing timed out. Select fewer frames and try again.'); }, 120_000);
    send('selection-print-export', preview.token, id);
  });
  document.getElementById('selected-print-cancel')!.addEventListener('click', () => {
    selectMode('deck'); modeTabs[0].focus();
  });
  reset();
  return { reset, message(message: BaseEvent) {
    if (message.type === 'SELECTION_PRINT_PREVIEW' && message.requestId === previewId) {
      clearTimeout(timeout); previewId = null; preview = message.data; status.textContent = ''; render(preview!); busy(false);
    } else if (message.type === 'SELECTION_PRINT_ERROR' && (message.requestId === operation || message.requestId === previewId)) fail(String(message.data));
    else if (message.requestId === operation && operation) {
      if (message.type === 'SELECTION_PRINT_PROGRESS') status.textContent = `Rendering frame ${message.data.current} of ${message.data.total}…`;
      else if (message.type === 'SELECTION_PRINT_IMAGES') void assemble(message.data, operation);
      else if (message.type === 'SELECTION_PRINT_CHECKED') { check?.resolve(); check = null; }
    }
  } };
}
