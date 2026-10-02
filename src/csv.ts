export interface CsvRow { line: number; values: string[] }
export interface CsvTable { headers: string[]; rows: CsvRow[] }
export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_RECORDS = 500;

// Keep cells as strings. In particular, IDs like 001 must never become numbers.
export function parseCsv(source: string): CsvTable {
  if (new TextEncoder().encode(source).length > CSV_MAX_BYTES) throw new Error('CSV files must be smaller than 2 MiB.');
  const text = source.replace(/^\uFEFF/, '');
  const records: CsvRow[] = [];
  let values: string[] = [], cell = '', quoted = false, closed = false;
  let line = 1, rowLine = 1, rowQuoted = false;
  const pushCell = () => { values.push(cell); cell = ''; closed = false; };
  const pushRow = () => {
    pushCell();
    if (rowQuoted || values.length > 1 || values.some(value => value !== '')) records.push({ line: rowLine, values });
    values = []; rowQuoted = false;
    if (records.length > CSV_MAX_RECORDS + 1) throw new Error('CSV imports support up to 500 card records.');
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; }
        else { quoted = false; closed = true; }
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && text[index + 1] === '\n') index++;
        cell += '\n'; line++;
      } else cell += char;
    } else if (char === ',') pushCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      pushRow(); line++; rowLine = line;
    } else if (char === '"') {
      if (cell || closed) throw new Error(`Row ${line}: a quote must start a cell. Use doubled quotes inside quoted text.`);
      quoted = true; rowQuoted = true;
    } else if (closed) {
      if (char !== ' ' && char !== '\t') throw new Error(`Row ${line}: unexpected text after a closing quote.`);
    } else cell += char;
  }
  if (quoted) throw new Error(`Row ${rowLine}: missing closing quote.`);
  if (cell || values.length || closed) pushRow();
  const header = records.shift();
  if (!header) throw new Error('The CSV is empty. Include a header row and at least one card.');
  const headers = header.values.map(value => value.trim());
  if (headers.length > 100) throw new Error('CSV files support up to 100 columns.');
  if (headers.some(name => !name)) throw new Error('Every CSV column needs a name.');
  const names = headers.map(name => name.toLocaleLowerCase('en-US'));
  if (new Set(names).size !== names.length) throw new Error('CSV column names must be unique, including letter case.');
  if (!records.length) throw new Error('The CSV has no card rows.');
  for (const row of records) {
    if (row.values.length !== headers.length) throw new Error(`Row ${row.line}: expected ${headers.length} cells, found ${row.values.length}. Quote text containing commas.`);
  }
  return { headers, rows: records };
}

export function writeCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const encode = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [headers, ...rows].map(row => row.map(encode).join(',')).join('\r\n') + '\r\n';
}
