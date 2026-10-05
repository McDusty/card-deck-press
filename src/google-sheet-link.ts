export interface SpreadsheetLink {
  kind: 'spreadsheet';
  spreadsheetId: string;
  openUrl: string;
}

export interface WorksheetLink {
  kind: 'worksheet';
  spreadsheetId: string;
  worksheetId: string;
  openUrl: string;
}

export type GoogleSheetLink = SpreadsheetLink | WorksheetLink;
export type GoogleSheetsErrorCode =
  | 'invalid-link' | 'worksheet-required' | 'invalid-options'
  | 'cancelled' | 'timeout' | 'network' | 'http'
  | 'unexpected-response' | 'too-large' | 'invalid-encoding' | 'invalid-data';

export class GoogleSheetsError extends Error {
  constructor(
    readonly code: GoogleSheetsErrorCode,
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'GoogleSheetsError';
  }
}

const invalidLink = () => new GoogleSheetsError('invalid-link', 'Paste a normal Google Sheets link from your browser address bar.');

/** A normal Share link is valid even when it does not select a worksheet yet. */
export function parseGoogleSheetLink(value: unknown): GoogleSheetLink {
  if (typeof value !== 'string' || value.trim().length > 2048) throw invalidLink();
  const text = value.trim();
  // Validate the original authority/path too: URL normalizes default ports and dot segments.
  const raw = text.match(/^https:\/\/docs\.google\.com(\/[^?#]*)(?:[?#].*)?$/i);
  if (!raw || /[\\\s]/.test(text)) throw invalidLink();
  const path = raw[1].match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{1,200})(?:\/(?:edit|view))?\/?$/);
  if (!path) throw invalidLink();
  let url: URL;
  try { url = new URL(text); } catch { throw invalidLink(); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.port || url.username || url.password) throw invalidLink();
  const spreadsheetId = path[1];
  const gids = [...url.searchParams.getAll('gid'), ...new URLSearchParams(url.hash.slice(1)).getAll('gid')];
  const openUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  if (!gids.length) return { kind: 'spreadsheet', spreadsheetId, openUrl };
  if (gids.some(gid => !/^\d{1,20}$/.test(gid))) throw invalidLink();
  const normalized = gids.map(gid => gid.replace(/^0+(?=\d)/, ''));
  if (new Set(normalized).size !== 1) {
    throw new GoogleSheetsError('invalid-link', 'This link selects different worksheet tabs. Open the tab you want and copy its browser address again.');
  }
  const worksheetId = normalized[0];
  return { kind: 'worksheet', spreadsheetId, worksheetId, openUrl: `${openUrl}?gid=${worksheetId}#gid=${worksheetId}` };
}

export function googleSheetExportUrl(link: WorksheetLink): string {
  // Revalidate even for callers that reconstructed a link from persisted JSON.
  const checked = parseGoogleSheetLink(`https://docs.google.com/spreadsheets/d/${link.spreadsheetId}/edit?gid=${link.worksheetId}`);
  if (checked.kind !== 'worksheet' || checked.spreadsheetId !== link.spreadsheetId || checked.worksheetId !== link.worksheetId) throw invalidLink();
  return `https://docs.google.com/spreadsheets/d/${checked.spreadsheetId}/export?format=csv&gid=${checked.worksheetId}`;
}
