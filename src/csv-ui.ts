import { CSV_MAX_BYTES } from './csv';
import type { ImportPreview, ColumnMapping } from './csv-import';
import type { CardRecord } from './output-options';
import { setBusy } from './busy-ui';
import type { GoogleSheetRead } from './google-sheets';
import type { PageBinding } from './deck-session';
import { sameBinding } from './google-sheets-ui';

interface Hooks {
  send(type: string, data: unknown, binding?: PageBinding): void;
  context(): PageBinding;
  apply(cards: CardRecord[]): void;
  invalidate(): void;
}
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function initCsvUi(hooks: Hooks) {
  let source = '', revision = 0, preview: ImportPreview | null = null;
  let mapping: ColumnMapping | undefined;
  let uploading = false;
  let activity: 'idle' | 'reading' | 'previewing' | 'applying' | 'uploading' = 'idle';
  let exportFilename = 'card-deck-press-deck.csv';
  let sheet: GoogleSheetRead | undefined;
  let binding: PageBinding | undefined;
  let restoreTarget: { mode: string; openUrl?: string } | null = null;
  let restoreToken: number | null = null;
  let restoreConfirmation: { binding: PageBinding; token: number } | null = null;
  const input = element<HTMLInputElement>('csv-file');
  const artworkInput = element<HTMLInputElement>('artwork-files');
  const apply = element<HTMLButtonElement>('csv-apply');
  const recheck = element<HTMLButtonElement>('csv-refresh');
  function resetDetails() {
    element<HTMLDetailsElement>('csv-details').open = false;
    element('csv-source-note').textContent = '';
    element('csv-source-note').classList.add('hidden');
    element('csv-readout').textContent = '';
  }
  function showRecheck(show: boolean) {
    recheck.classList.toggle('hidden', !show);
    recheck.disabled = !show;
  }
  showRecheck(false);
  function error(message: string, canRecheck = false) {
    const needsRecovery = /recovery|recover previous state|recover interrupted import/i.test(message);
    const retryApply = activity === 'applying';
    if (message) {
      setBusy(element('csv-summary'), false);
      if (activity !== 'idle') element('csv-summary').textContent = activity === 'applying' ? 'Import could not finish.' : 'Import paused.';
      if (activity === 'applying') {
        preview = null;
        message += needsRecovery
          ? '\nChoose Cancel, then Recover interrupted import in Edit Deck before trying again.'
          : '\nChoose Check again to review the import again before applying.';
      }
      activity = 'idle';
    }
    element('csv-error').textContent = message;
    element('csv-error').classList.toggle('hidden', !message);
    showRecheck(Boolean(message && source && binding && sameBinding(binding, hooks.context()) && !needsRecovery && (canRecheck || retryApply)));
  }
  function requestPreview() {
    if (!source || uploading) return;
    apply.disabled = true; preview = null; revision++;
    error(''); activity = 'previewing'; element('csv-summary').textContent = 'Checking spreadsheet rows and artwork…';
    setBusy(element('csv-summary'), true);
    hooks.send('csv-preview', { source, mapping, revision, sheet: sheet ? { version: 1, mode: 'google-sheet', revision: 0, spreadsheetId: sheet.link.spreadsheetId, worksheetId: sheet.link.worksheetId, openUrl: sheet.link.openUrl, lastApplied: sheet.fetchedAt } : undefined }, binding);
  }
  function close() {
    revision++; preview = null; uploading = false; activity = 'idle'; source = ''; sheet = undefined; binding = undefined; apply.disabled = true;
    resetDetails();
    showRecheck(false);
    element('csv-panel').classList.add('hidden'); element('cards-container').classList.remove('hidden');
  }
  function closeRestore() {
    restoreConfirmation = null;
    element<HTMLDialogElement>('csv-restore-dialog').close();
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
    activity = 'idle';
    setBusy(element('csv-summary'), false);
    const unchanged = !data.added && !data.changed && !data.removed && !data.orderChanged;
    element('csv-summary').textContent = `${data.records} cards · ${data.copies} printed copies\n${unchanged ? 'No card changes.' : `${data.added} added · ${data.changed} changed · ${data.removed} removed.${data.orderChanged ? ' Card order changes.' : ''}\nApplying replaces this deck’s card list.`}`;
    element('csv-readout').textContent = `${data.artworkMatches} artwork matches${data.artworkIssues ? ` · ${data.artworkIssues} unresolved` : ''}.`;
    const changes = element('csv-changes'); changes.replaceChildren();
    for (const [label, ids] of [['Added', data.addedIds], ['Changed', data.changedIds], ['Removed', data.removedIds]] as const) {
      const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = `${label}: ${ids?.length ?? 0}`;
      const list = document.createElement('p'); list.textContent = ids?.join(', ') || 'None'; details.append(summary, list); changes.appendChild(details);
    }
    if (data.orderChanged) { const note = document.createElement('p'); note.textContent = 'Card order changes. Print sheets follow the new row order.'; changes.appendChild(note); }
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
    error(data.errors.join('\n'), data.artworkIssues > 0); apply.disabled = data.errors.length > 0;
  }
  for (const id of ['upload-csv', 'empty-import-csv', 'csv-choose']) {
    element(id).addEventListener('click', () => { input.value = ''; input.click(); });
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    resetDetails();
    element('csv-panel').classList.remove('hidden'); element('cards-container').classList.add('hidden');
    element('csv-filename').textContent = file.name; element('csv-preview-table').replaceChildren(); element('csv-mapping').replaceChildren();
    sheet = undefined; binding = { ...hooks.context() }; const captured = binding; element('csv-heading').textContent = 'Import CSV'; element('csv-choose').classList.remove('hidden'); element('csv-sample').classList.remove('hidden'); source = ''; preview = null; mapping = undefined; revision++; const fileRevision = revision; apply.disabled = true;
    error(''); activity = 'reading'; element('csv-summary').textContent = 'Reading CSV…'; setBusy(element('csv-summary'), true);
    try {
      if (file.size > CSV_MAX_BYTES) throw new Error('Choose a CSV smaller than 2 MiB.');
      const bytes = await file.arrayBuffer();
      if (revision !== fileRevision || !binding || !sameBinding(binding, hooks.context())) return;
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!source) throw new Error('The CSV is empty. Include a header row and at least one card.');
      requestPreview();
    } catch (issue) { if (revision === fileRevision && sameBinding(captured, hooks.context())) error(issue instanceof Error ? issue.message : 'Save the spreadsheet as UTF-8 CSV and try again.'); }
  });
  apply.addEventListener('click', () => { if (!apply.disabled && preview && !preview.errors.length && binding && sameBinding(binding, hooks.context())) { apply.disabled = true; error(''); activity = 'applying'; element('csv-summary').textContent = 'Applying import…'; setBusy(element('csv-summary'), true); hooks.send('csv-apply', preview.token, binding); } });
  element('csv-cancel').addEventListener('click', () => { hooks.send('import-cancel', null); close(); });
  recheck.addEventListener('click', () => { if (!recheck.disabled) requestPreview(); });
  element('csv-export').addEventListener('click', () => { setBusy(element('csv-export'), true); exportFilename = 'card-deck-press-deck.csv'; hooks.send('csv-export', { spreadsheetSafe: false }); });
  element('csv-export-safe').addEventListener('click', () => { setBusy(element('csv-export-safe'), true); exportFilename = 'card-deck-press-spreadsheet.csv'; hooks.send('csv-export', { spreadsheetSafe: true }); });
  element('csv-restore').addEventListener('click', () => {
    if (restoreToken === null) return;
    restoreConfirmation = { binding: { ...hooks.context() }, token: restoreToken };
    element('csv-restore-copy').textContent = restoreTarget?.mode === 'google-sheet' ? `This restores the previous cards and reconnects this deck to ${restoreTarget.openUrl}. Generated output must be regenerated.` : 'This restores the previous cards in local editing mode. Generated output must be regenerated.';
    element<HTMLDialogElement>('csv-restore-dialog').showModal();
  });
  element('csv-restore-cancel').addEventListener('click', closeRestore);
  element('csv-restore-confirm').addEventListener('click', () => {
    const captured = restoreConfirmation;
    const confirmed = element<HTMLDialogElement>('csv-restore-dialog').open;
    closeRestore();
    if (!confirmed || !captured || !sameBinding(captured.binding, hooks.context())) return;
    setBusy(element('csv-restore'), true); hooks.send('csv-restore', captured.token, captured.binding);
  });
  element('csv-sample').addEventListener('click', () => download('card_id,quantity,name\r\n001,1,Joker\r\n002,2,Queen\r\n', 'card-deck-press-sample.csv'));
  element('csv-add-artwork').addEventListener('click', () => { artworkInput.value = ''; artworkInput.click(); });
  artworkInput.addEventListener('change', async () => {
    const files = [...artworkInput.files ?? []]; if (!files.length) return;
    const captured = { ...hooks.context() }; const fileRevision = revision;
    try {
      if (files.length > 100 || files.reduce((size, file) => size + file.size, 0) > 32 * 1024 * 1024) throw new Error('Choose up to 100 images, totaling at most 32 MiB.');
      uploading = true; apply.disabled = true; error('');
      activity = 'uploading';
      element('csv-summary').textContent = 'Uploading artwork…';
      setBusy(element('csv-summary'), true);
      const images = await Promise.all(files.map(async file => ({ name: file.name, mimeType: file.type, data: new Uint8Array(await file.arrayBuffer()) })));
      if (fileRevision !== revision || !sameBinding(captured, hooks.context())) return;
      hooks.send('upload-artwork', images, captured);
    } catch (issue) { if (fileRevision === revision && sameBinding(captured, hooks.context())) { uploading = false; error(issue instanceof Error ? issue.message : 'Artwork upload failed.', true); } }
  });
  hooks.send('csv-status', null);
  const message = (type: string, value: unknown, changes?: { outputChanged: boolean }) => {
    if (type === 'CSV_ERROR') {
      const data = value as { revision?: number };
      if (data.revision !== undefined && data.revision !== revision) return;
    }
    if (['CSV_RESET', 'CSV_EXPORT', 'CSV_APPLIED', 'CSV_ERROR'].includes(type)) {
      for (const id of ['csv-export', 'csv-export-safe', 'csv-restore']) setBusy(element(id), false);
    }
    if (['CSV_RESET', 'CSV_APPLIED', 'CSV_ERROR'].includes(type)) setBusy(element('csv-summary'), false);
    if (type === 'CSV_RESET') { closeRestore(); restoreToken = null; restoreTarget = null; source = ''; revision++; preview = null; mapping = undefined; uploading = false; apply.disabled = true; close(); error(''); element('csv-filename').textContent = ''; element('csv-summary').textContent = ''; element('csv-mapping').replaceChildren(); element('csv-preview-table').replaceChildren(); }
    else if (type === 'CSV_PREVIEW') display(value as ImportPreview);
    else if (type === 'CSV_APPLIED') { hooks.apply(value as CardRecord[]); if (changes?.outputChanged !== false) hooks.invalidate(); close(); }
    else if (type === 'CSV_ERROR') {
      const data = value as { revision?: number; message: string };
      if (data.revision !== undefined && data.revision !== revision) return;
      uploading = false; apply.disabled = true; error(data.message, true);
      element('csv-deck-status').textContent = data.message;
      element('csv-deck-status').classList.remove('hidden');
    } else if (type === 'CSV_EXPORT') download(value as string, exportFilename);
    else if (type === 'CSV_STATUS') {
      const data = value as { canRestore: boolean; stale: boolean; restoreTarget?: { mode: string; openUrl?: string } | null; restoreToken?: number | null };
      restoreTarget = data.restoreTarget ?? null;
      restoreToken = data.restoreToken ?? null;
      element<HTMLButtonElement>('csv-restore').disabled = !data.canRestore || restoreToken === null;
      element('csv-deck-status').textContent = 'Output is out of date. Forge again to update it.';
      element('csv-deck-status').classList.toggle('hidden', !data.stale);
    } else if (type === 'ARTWORK_PROGRESS') {
      const data = value as { uploaded: number; total: number };
      element('csv-summary').textContent = `Uploading artwork ${data.uploaded} of ${data.total}…`;
    } else if (type === 'ARTWORK_READY') { uploading = false; setBusy(element('csv-summary'), false); requestPreview(); }
  };
  return { message, contextChanged() { if (restoreConfirmation && !sameBinding(restoreConfirmation.binding, hooks.context())) closeRestore(); if (binding && !sameBinding(binding, hooks.context())) { close(); error(''); } }, openSheet(read: GoogleSheetRead, captured: PageBinding) {
    resetDetails();
    sheet = read; binding = captured; source = read.source; mapping = undefined;
    element('csv-heading').textContent = 'Review Google Sheet'; element('csv-choose').classList.add('hidden'); element('csv-sample').classList.add('hidden');
    element('csv-filename').textContent = `Worksheet ${read.link.worksheetId} · read ${new Date(read.fetchedAt).toLocaleString()}.`;
    element('csv-source-note').textContent = 'Applying connects this deck to Google Sheets. Edit cards in the sheet afterward.';
    element('csv-source-note').classList.remove('hidden');
    element('csv-panel').classList.remove('hidden'); element('cards-container').classList.add('hidden'); requestPreview();
  } };
}
