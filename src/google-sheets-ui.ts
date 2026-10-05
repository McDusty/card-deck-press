import { parseGoogleSheetLink } from './google-sheet-link';
import { readGoogleSheet } from './google-sheets';
import type { GoogleSheetRead } from './google-sheets';
import type { PageBinding } from './deck-session';
import { setBusy } from './busy-ui';
import type { DeckSource } from './deck-source';

interface SheetStatus { source: DeckSource; blocked?: string; recovery: boolean }
interface Hooks {
  context(): PageBinding;
  send(type: string, data: unknown, binding?: PageBinding): void;
  preview(read: GoogleSheetRead, binding: PageBinding): void;
  authority(readOnly: boolean): void;
}
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const localActions = ['upload-csv', 'google-sheet', 'add-card', 'empty-import-csv', 'empty-google-sheet', 'empty-add-card'];
export function initGoogleSheetsUi(hooks: Hooks) {
  let status: SheetStatus = { source: { version: 1, mode: 'local', revision: 0 }, recovery: false };
  let pending: { id: string; url: string; binding?: PageBinding; abort?: AbortController } | null = null;
  let disconnectBinding: PageBinding | null = null;
  const input = element<HTMLInputElement>('sheet-link');
  const panel = element('sheet-panel');
  const readButton = element<HTMLButtonElement>('sheet-read');
  const error = (text: string) => { element('sheet-error').textContent = text; element('sheet-error').classList.toggle('hidden', !text); };
  function reset() {
    pending?.abort?.abort(); pending = null; setBusy(readButton, false); readButton.disabled = false;
    input.disabled = false;
    disconnectBinding = null; element<HTMLDialogElement>('sheet-disconnect-dialog').close();
    element('sheet-open-draft').classList.add('hidden');
    element('sheet-loading').textContent = ''; panel.classList.add('hidden'); element('cards-container').classList.remove('hidden');
  }
  function open() {
    reset(); input.value = status.source.mode === 'google-sheet' ? status.source.openUrl : ''; error('');
    panel.classList.remove('hidden'); element('cards-container').classList.add('hidden'); input.focus();
  }
  function cancel() { reset(); hooks.send('import-cancel', null); element('cards-container').classList.remove('hidden'); }
  function start(url: string) {
    if (pending) return;
    error('');
    try {
      const parsed = parseGoogleSheetLink(url);
      const open = element<HTMLAnchorElement>('sheet-open-draft'); open.href = parsed.openUrl; open.classList.remove('hidden');
      if (parsed.kind !== 'worksheet') throw new Error('Open the sheet, select the worksheet tab you want, and copy its URL again. The link must include gid= followed by the tab number.');
      pending = { id: crypto.randomUUID(), url: parsed.openUrl };
      readButton.disabled = true; input.disabled = true; setBusy(readButton, true);
      element('sheet-loading').textContent = 'Reading the shared worksheet…';
      hooks.send('sheet-begin', { requestId: pending.id });
    } catch (issue) { error(issue instanceof Error ? issue.message : 'Enter a Google Sheet URL.'); }
  }
  async function fetchPending(request: NonNullable<typeof pending>, binding: PageBinding) {
    request.binding = binding; request.abort = new AbortController();
    try {
      const read = await readGoogleSheet(request.url, { signal: request.abort.signal });
      if (pending !== request || !sameBinding(binding, hooks.context())) return;
      pending = null; setBusy(readButton, false); readButton.disabled = false; input.disabled = false;
      panel.classList.add('hidden'); hooks.preview(read, binding);
    } catch (issue) {
      if (pending !== request || !sameBinding(binding, hooks.context())) return;
      pending = null; setBusy(readButton, false); readButton.disabled = false; input.disabled = false;
      panel.classList.remove('hidden'); element('cards-container').classList.add('hidden');
      element('sheet-loading').textContent = '';
      error(issue instanceof Error ? issue.message : 'Could not read this worksheet. Check sharing permissions and try again.');
    }
  }
  for (const id of ['google-sheet', 'empty-google-sheet', 'sheet-change']) element(id).addEventListener('click', open);
  element('sheet-cancel').addEventListener('click', cancel);
  element('sheet-form').addEventListener('submit', event => { event.preventDefault(); start(input.value); });
  element('sheet-pull').addEventListener('click', () => { if (status.source.mode === 'google-sheet') { const url = status.source.openUrl; open(); start(url); } });
  input.addEventListener('input', () => element('sheet-open-draft').classList.add('hidden'));
  element('sheet-disconnect').addEventListener('click', () => { disconnectBinding = { ...hooks.context() }; element<HTMLDialogElement>('sheet-disconnect-dialog').showModal(); });
  element('sheet-disconnect-confirm').addEventListener('click', () => {
    const captured = disconnectBinding;
    const dialog = element<HTMLDialogElement>('sheet-disconnect-dialog');
    const confirmed = dialog.open;
    dialog.close(); reset();
    if (confirmed && captured && sameBinding(captured, hooks.context())) hooks.send('sheet-disconnect', null, captured);
  });
  element('sheet-disconnect-cancel').addEventListener('click', () => { disconnectBinding = null; element<HTMLDialogElement>('sheet-disconnect-dialog').close(); });
  element('sheet-recover').addEventListener('click', () => hooks.send('source-recover', null));
  return {
    awaitStatus() { for (const id of localActions) element<HTMLButtonElement>(id).disabled = true; },
    contextChanged() {
      if (pending?.binding && !sameBinding(pending.binding, hooks.context())) reset();
      if (disconnectBinding && !sameBinding(disconnectBinding, hooks.context())) { disconnectBinding = null; element<HTMLDialogElement>('sheet-disconnect-dialog').close(); }
    },
    reset,
    message(type: string, value: unknown) {
      if (type === 'SHEET_STARTED') {
        const data = value as { requestId: string };
        if (pending && pending.id === data.requestId) void fetchPending(pending, { ...hooks.context() });
      } else if (type === 'SHEET_STATUS') {
        status = value as SheetStatus;
        const linkedSource = status.source.mode === 'google-sheet' ? status.source : null;
        const linked = Boolean(linkedSource);
        const blocked = Boolean(status.blocked || status.recovery);
        hooks.authority(linked || blocked);
        for (const id of localActions) {
          element<HTMLButtonElement>(id).disabled = linked || blocked;
          element(id).classList.toggle('hidden', linked || blocked);
        }
        element('sheet-source').classList.toggle('hidden', !linked && !blocked);
        const anchor = element<HTMLAnchorElement>('sheet-open');
        anchor.hidden = !linked; anchor.textContent = linkedSource ? `Open Sheet (worksheet ${linkedSource.worksheetId})` : 'Open Sheet'; anchor.title = linkedSource?.openUrl ?? ''; anchor.href = linkedSource?.openUrl ?? '#';
        element('sheet-source-copy').textContent = status.blocked || (status.recovery ? 'An interrupted import needs recovery before this deck can be changed.' : `Cards come from Google Sheets. Edit rows in the sheet, then Pull Latest. Last applied: ${linkedSource?.lastApplied ? new Date(linkedSource.lastApplied).toLocaleString() : 'not yet'}.`);
        element<HTMLButtonElement>('sheet-pull').disabled = blocked;
        element('sheet-pull').classList.toggle('hidden', !linked);
        element('sheet-change').classList.toggle('hidden', blocked || !linked);
        element('sheet-disconnect').classList.toggle('hidden', status.recovery);
        element('sheet-recover').classList.toggle('hidden', !status.recovery);
        element<HTMLButtonElement>('csv-restore').disabled ||= blocked;
      } else if (['CSV_APPLIED', 'CSV_RESET'].includes(type)) reset();
      else if (['DECK_ERROR', 'CSV_ERROR'].includes(type) && pending) { reset(); error(type === 'CSV_ERROR' ? String((value as { message: string }).message) : String(value)); panel.classList.remove('hidden'); element('cards-container').classList.add('hidden'); }
    },
  };
}
export function sameBinding(a: PageBinding, b: PageBinding): boolean {
  return a.pageId === b.pageId && a.session === b.session && a.epoch === b.epoch;
}
