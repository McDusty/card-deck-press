import { CSV_MAX_BYTES } from './csv';
import type { ImportPreview, ColumnMapping } from './csv-import';
import type { CardRecord } from './output-options';

interface Hooks {
  send(type: string, data: unknown): void;
  apply(cards: CardRecord[]): void;
  invalidate(): void;
}
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function initCsvUi(hooks: Hooks): (type: string, data: unknown) => void {
  let source = '', revision = 0, preview: ImportPreview | null = null;
  let mapping: ColumnMapping | undefined;
  let uploading = false;
  const input = element<HTMLInputElement>('csv-file');
  const artworkInput = element<HTMLInputElement>('artwork-files');
  const apply = element<HTMLButtonElement>('csv-apply');
  function error(message: string) {
    element('csv-error').textContent = message;
    element('csv-error').classList.toggle('hidden', !message);
  }
  function requestPreview() {
    if (!source || uploading) return;
    apply.disabled = true; preview = null; revision++;
    error(''); element('csv-summary').textContent = 'Checking CSV and artwork…';
    hooks.send('csv-preview', { source, mapping, revision });
  }
  function close() {
    element('csv-panel').classList.add('hidden'); element('cards-container').classList.remove('hidden');
  }
  function download(text: string, filename: string) {
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function display(data: ImportPreview) {
    if (data.revision !== revision) return;
    preview = data; mapping = data.mapping;
    element('csv-summary').textContent = `${data.records} card records · ${data.copies} printed copies · ${data.artworkMatches} artwork matches.\n${data.added} added · ${data.changed} changed · ${data.removed} removed. Apply replaces the current card list.`;
    const container = element('csv-mapping'); container.replaceChildren();
    for (const header of data.headers) {
      const row = document.createElement('label'); row.className = 'csv-mapping-row';
      const name = document.createElement('span'); name.textContent = header;
      const select = document.createElement('select'); select.setAttribute('aria-label', `Map ${header}`);
      const options = [['', 'Ignore'], ['card_id', 'Card ID'], ['quantity', 'Quantity'], ...data.fields.map(field => [field.name, `${field.name} (${field.type})`])];
      if (data.mapping[header] && !options.some(([value]) => value === data.mapping[header])) options.push([data.mapping[header], `${data.mapping[header]} (missing field)`]);
      for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.appendChild(option); }
      select.value = data.mapping[header];
      select.addEventListener('change', () => { mapping = { ...mapping, [header]: select.value }; requestPreview(); });
      row.append(name, select); container.appendChild(row);
    }
    const table = document.createElement('table');
    const head = document.createElement('tr');
    for (const text of ['Row', ...data.headers]) { const cell = document.createElement('th'); cell.textContent = text; head.appendChild(cell); }
    table.appendChild(head);
    for (const row of data.rows) {
      const tr = document.createElement('tr');
      for (const text of [String(row.line), ...row.values]) { const cell = document.createElement('td'); cell.textContent = text; tr.appendChild(cell); }
      table.appendChild(tr);
    }
    element('csv-preview-table').replaceChildren(table);
    error(data.errors.join('\n')); apply.disabled = data.errors.length > 0;
  }
  for (const id of ['upload-csv', 'empty-import-csv', 'csv-choose']) {
    element(id).addEventListener('click', () => { input.value = ''; input.click(); });
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    element('csv-panel').classList.remove('hidden'); element('cards-container').classList.add('hidden');
    element('csv-filename').textContent = file.name; element('csv-preview-table').replaceChildren(); element('csv-mapping').replaceChildren();
    source = ''; preview = null; mapping = undefined; revision++; const fileRevision = revision; apply.disabled = true;
    try {
      if (file.size > CSV_MAX_BYTES) throw new Error('Choose a CSV smaller than 2 MiB.');
      const bytes = await file.arrayBuffer();
      if (revision !== fileRevision) return;
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      requestPreview();
    } catch (issue) { error(issue instanceof Error ? issue.message : 'Save the spreadsheet as UTF-8 CSV and try again.'); }
  });
  apply.addEventListener('click', () => { if (preview && !preview.errors.length) { apply.disabled = true; hooks.send('csv-apply', preview.token); } });
  element('csv-cancel').addEventListener('click', close);
  element('csv-refresh').addEventListener('click', requestPreview);
  element('csv-export').addEventListener('click', () => hooks.send('csv-export', null));
  element('csv-restore').addEventListener('click', () => hooks.send('csv-restore', null));
  element('csv-sample').addEventListener('click', () => download('card_id,quantity,name\r\n001,1,Joker\r\n002,2,Queen\r\n', 'cardforge-sample.csv'));
  element('csv-add-artwork').addEventListener('click', () => { artworkInput.value = ''; artworkInput.click(); });
  artworkInput.addEventListener('change', async () => {
    const files = [...artworkInput.files ?? []]; if (!files.length) return;
    try {
      if (files.length > 100 || files.reduce((size, file) => size + file.size, 0) > 32 * 1024 * 1024) throw new Error('Choose up to 100 images, totaling at most 32 MiB.');
      uploading = true; apply.disabled = true; error('');
      element('csv-summary').textContent = 'Uploading artwork…';
      hooks.send('upload-artwork', await Promise.all(files.map(async file => ({ name: file.name, mimeType: file.type, data: new Uint8Array(await file.arrayBuffer()) }))));
    } catch (issue) { uploading = false; error(issue instanceof Error ? issue.message : 'Artwork upload failed.'); }
  });
  hooks.send('csv-status', null);
  return (type, value) => {
    if (type === 'CSV_PREVIEW') display(value as ImportPreview);
    else if (type === 'CSV_APPLIED') { hooks.apply(value as CardRecord[]); hooks.invalidate(); close(); }
    else if (type === 'CSV_ERROR') {
      const data = value as { revision?: number; message: string };
      if (data.revision !== undefined && data.revision !== revision) return;
      uploading = false; apply.disabled = true; error(data.message);
      element('csv-deck-status').textContent = data.message;
      element('csv-deck-status').classList.remove('hidden');
    } else if (type === 'CSV_EXPORT') download(value as string, 'cardforge-deck.csv');
    else if (type === 'CSV_STATUS') {
      const data = value as { canRestore: boolean; stale: boolean };
      element<HTMLButtonElement>('csv-restore').disabled = !data.canRestore;
      element('csv-deck-status').textContent = 'Output is out of date. Forge again to update it.';
      element('csv-deck-status').classList.toggle('hidden', !data.stale);
    } else if (type === 'ARTWORK_PROGRESS') {
      const data = value as { uploaded: number; total: number };
      element('csv-summary').textContent = `Uploading artwork ${data.uploaded} of ${data.total}…`;
    } else if (type === 'ARTWORK_READY') { uploading = false; requestPreview(); }
  };
}
