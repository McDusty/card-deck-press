import { CSV_MAX_BYTES, parseCsv } from './csv';
import type { CsvTable } from './csv';
import { GoogleSheetsError, googleSheetExportUrl, parseGoogleSheetLink } from './google-sheet-link';
import type { WorksheetLink } from './google-sheet-link';

export interface GoogleSheetReadOptions {
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface GoogleSheetRead {
  link: WorksheetLink;
  source: string;
  table: CsvTable;
  bytes: number;
  fetchedAt: string;
}

export const GOOGLE_SHEETS_TIMEOUT_MS = 20_000;

function validateResponse(response: Response): void {
  let url: URL;
  try { url = new URL(response.url); }
  catch { throw new GoogleSheetsError('unexpected-response', 'Google returned an unreadable sheet response.'); }
  // Google controls the export redirect. This checks its final destination, not every hop.
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      (url.hostname !== 'docs.google.com' && !/^doc-[a-z0-9-]+-sheets\.googleusercontent\.com$/.test(url.hostname)) ||
      response.type === 'opaque' || response.type === 'opaqueredirect') {
    throw new GoogleSheetsError('unexpected-response', 'Google returned an unexpected sheet response.');
  }
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'Google denied access. Set Share to Anyone with the link → Viewer and allow viewers to download the sheet.'
      : response.status === 404 ? 'The spreadsheet or worksheet was not found. Check the link.'
      : response.status === 400 ? 'Google could not read this worksheet. Check the selected tab and its link.'
      : response.status === 429 ? 'Google is limiting requests. Wait a moment, then pull again.'
      : `Google could not read the sheet (HTTP ${response.status}). Try again later.`;
    throw new GoogleSheetsError('http', message, response.status);
  }
  const contentType = response.headers.get('content-type') ?? '';
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime !== 'text/csv' || !response.body) {
    throw new GoogleSheetsError('unexpected-response', 'Google did not return sheet data. Check sharing and viewer download permissions.');
  }
  const charset = /(?:^|;)\s*charset\s*=\s*"?([^;"\s]+)/i.exec(contentType)?.[1];
  if (charset && !/^utf-?8$/i.test(charset)) {
    throw new GoogleSheetsError('invalid-encoding', 'The sheet response must use UTF-8 text.');
  }
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > CSV_MAX_BYTES) {
    throw new GoogleSheetsError('too-large', 'The sheet exceeds the 2 MiB import limit.');
  }
}

/** Browser-only reader; never changes a deck, stores a connection, or evaluates formulas. */
export async function readGoogleSheet(value: unknown, options: GoogleSheetReadOptions = {}): Promise<GoogleSheetRead> {
  const link = parseGoogleSheetLink(value);
  if (link.kind !== 'worksheet') {
    throw new GoogleSheetsError('worksheet-required', 'Open the worksheet containing your cards and copy its browser address.');
  }
  const timeoutMs = options.timeoutMs ?? GOOGLE_SHEETS_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new GoogleSheetsError('invalid-options', 'The sheet read timeout must be between 1 and 60,000 milliseconds.');
  }
  if (options.signal?.aborted) throw new GoogleSheetsError('cancelled', 'Sheet read cancelled.');
  const controller = new AbortController();
  const deadline = performance.now() + timeoutMs;
  let timedOut = false;
  const aborted = () => new GoogleSheetsError(timedOut ? 'timeout' : 'cancelled', timedOut
    ? 'Reading the sheet took too long. Try pulling again.' : 'Sheet read cancelled.');
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const expire = () => { if (!controller.signal.aborted) { timedOut = true; controller.abort(); } };
  const timer = setTimeout(expire, timeoutMs);
  // Ready stream chunks can starve timer callbacks. Check a monotonic clock as well.
  const checkDeadline = () => {
    if (performance.now() >= deadline) expire();
    if (controller.signal.aborted) throw aborted();
  };
  // Also bound adapters/streams that do not themselves reject on an abort signal.
  const wait = <T>(operation: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(aborted()); };
    const cleanup = () => controller.signal.removeEventListener('abort', onAbort);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    operation.then(result => {
      cleanup();
      try { checkDeadline(); resolve(result); } catch (error) { reject(error); }
    }, error => { cleanup(); reject(error); });
    if (controller.signal.aborted) onAbort();
  });
  let response: Response | undefined;
  try {
    const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    const request = fetcher(googleSheetExportUrl(link), {
      mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'follow',
      referrerPolicy: 'no-referrer', signal: controller.signal,
    }).then(received => {
      response = received;
      // An adapter may resolve after cancellation even though native fetch honors abort.
      if (controller.signal.aborted && received.body && !received.body.locked) void received.body.cancel().catch(() => {});
      return received;
    });
    response = await wait(request);
    validateResponse(response);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const decode = (chunk?: Uint8Array): string => {
      try { return chunk ? decoder.decode(chunk, { stream: true }) : decoder.decode(); }
      catch { throw new GoogleSheetsError('invalid-encoding', 'The sheet contains invalid UTF-8 text.'); }
    };
    let bytes = 0;
    let source = '';
    try {
      for (;;) {
        const chunk = await wait(reader.read());
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > CSV_MAX_BYTES) throw new GoogleSheetsError('too-large', 'The sheet exceeds the 2 MiB import limit.');
        source += decode(chunk.value);
      }
      source += decode();
    } catch (error) {
      // Cancellation is cleanup, not another operation allowed to outlive the deadline.
      void reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
    checkDeadline();
    let table: CsvTable;
    try { table = parseCsv(source); }
    catch (error) {
      // Preserve valid CSV headers such as <html>. A mislabeled HTML/CSV polyglot
      // is ambiguous; the import preview must still require valid card-ID mapping.
      if (/^<(?:!doctype\s+html|html|head|body|script|meta)(?:\s|>)/i.test(source.trimStart())) {
        throw new GoogleSheetsError('unexpected-response', 'Google returned a web page instead of sheet data. Check sharing and viewer download permissions.');
      }
      const detail = error instanceof Error ? error.message.replace(/CSV files|CSV imports/g, 'Sheets').replace(/CSV/g, 'sheet') : 'Check its rows and column names.';
      throw new GoogleSheetsError('invalid-data', detail);
    }
    checkDeadline();
    return { link, source, table, bytes, fetchedAt: new Date().toISOString() };
  } catch (error) {
    const failure = controller.signal.aborted ? aborted() : error instanceof GoogleSheetsError ? error
      : new GoogleSheetsError('network', 'Could not read Google Sheets. Check your connection, sharing and viewer download permissions, then try again.');
    controller.abort();
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    throw failure;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
