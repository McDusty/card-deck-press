import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const folder = mkdtempSync(join(tmpdir(), 'card-deck-press-sheets-'));
after(() => rmSync(folder, { recursive: true, force: true }));
for (const name of ['google-sheet-link', 'google-sheets', 'csv']) {
  await build({ entryPoints: [`src/${name}.ts`], outfile: join(folder, `${name}.mjs`), bundle: true, platform: 'node', format: 'esm' });
}
const { parseGoogleSheetLink, googleSheetExportUrl } = await import(pathToFileURL(join(folder, 'google-sheet-link.mjs')));
const { readGoogleSheet } = await import(pathToFileURL(join(folder, 'google-sheets.mjs')));
const { CSV_MAX_BYTES, parseCsv } = await import(pathToFileURL(join(folder, 'csv.mjs')));
const base = 'https://docs.google.com/spreadsheets/d/Test_ID-abc/edit';
const link = `${base}#gid=42`;
const exportUrl = 'https://docs.google.com/spreadsheets/d/Test_ID-abc/export?format=csv&gid=42';
const csv = 'card_id,title\n001,Healing';
const encoder = new TextEncoder();
const hasCode = code => error => { assert.equal(error.name, 'GoogleSheetsError'); assert.equal(error.code, code); return true; };
function response(body = csv, { url = exportUrl, type, ...init } = {}) {
  const result = new Response(body, { headers: { 'content-type': 'text/csv;charset=UTF-8' }, ...init });
  Object.defineProperty(result, 'url', { value: url });
  if (type) Object.defineProperty(result, 'type', { value: type });
  return result;
}
const read = (result, options = {}) => readGoogleSheet(link, { fetch: async () => result, ...options });

test('normal share links without a worksheet remain valid and never silently read the first tab', async () => {
  assert.deepEqual(parseGoogleSheetLink(`${base}?usp=drivesdk`), {
    kind: 'spreadsheet', spreadsheetId: 'Test_ID-abc', openUrl: base,
  });
  let calls = 0;
  await assert.rejects(readGoogleSheet(base, { fetch: async () => { calls++; return response(); } }), hasCode('worksheet-required'));
  assert.equal(calls, 0);
});

for (const suffix of ['?gid=42', '#gid=42', '?gid=042#gid=42', '?gid=42&gid=00042#gid=42&range=A1', '?usp=sharing#gid=42']) {
  test(`worksheet selection is explicit and canonical: ${suffix}`, () => {
    const parsed = parseGoogleSheetLink(`  ${base}${suffix}  `);
    assert.deepEqual(parsed, { kind: 'worksheet', spreadsheetId: 'Test_ID-abc', worksheetId: '42', openUrl: `${base}?gid=42#gid=42` });
    assert.equal(googleSheetExportUrl(parsed), exportUrl);
  });
}

test('zero and large worksheet IDs preserve decimal text, including account-specific links', () => {
  assert.equal(parseGoogleSheetLink(`${base}#gid=000`).worksheetId, '0');
  assert.equal(parseGoogleSheetLink('https://docs.google.com/spreadsheets/u/2/d/Case_Sensitive-1/view?gid=9876543210123456789').worksheetId, '9876543210123456789');
  assert.equal(parseGoogleSheetLink('https://docs.google.com/spreadsheets/d/A').kind, 'spreadsheet');
});

for (const bad of [
  '', null, 42, {}, 'https://docs.google.com',
  base.replace('https:', 'http:'), base.replace('docs.google.com', 'docs.google.com.evil.test'),
  base.replace('docs.google.com', 'evil.test'), base.replace('docs.google.com', 'user:pass@docs.google.com'),
  base.replace('docs.google.com', 'docs.google.com:443'), base.replace('docs.google.com', 'docs.google.com:444'),
  base.replace('/d/', '/d/e/'), base.replace('/edit', '/copy'), base.replace('/edit', '/export'),
  base.replace('Test_ID-abc', 'A%2FB'), base.replace('Test_ID-abc', 'A%5FB'),
  base.replace('/d/', '/x/../d/'), base.replace('/d/', '\\d/'), `${base}?gid=`, `${base}?gid=-1`,
  `${base}?gid=1.5`, `${base}?gid=NaN`, `${base}?gid=1#gid=2`, `${base}?gid=1&gid=2`,
  `${base}#gid=1&gid=2`, `${base}#gid=123456789012345678901`, `${base}?gid=1 2`,
  base.replace('Test_ID-abc', 'a'.repeat(201)), `${base}?extra=${'x'.repeat(2048)}`,
]) test(`reject invalid sheet link: ${JSON.stringify(bad)}`, () => assert.throws(() => parseGoogleSheetLink(bad), hasCode('invalid-link')));

test('export helper rejects malformed or noncanonical reconstructed IDs', () => {
  for (const [spreadsheetId, worksheetId] of [['A?gid=5', '42'], ['A', '042'], ['A', '-1'], ['A', '42&other=1']]) {
    assert.throws(() => googleSheetExportUrl({ kind: 'worksheet', spreadsheetId, worksheetId }), hasCode('invalid-link'));
  }
});

test('anonymous read uses the selected worksheet and always requests a fresh body', async () => {
  const requests = [];
  const fetch = async (url, init) => { requests.push({ url, init }); return response(); };
  const first = await readGoogleSheet(link, { fetch });
  const second = await readGoogleSheet(link, { fetch });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, exportUrl);
    for (const [key, value] of Object.entries({ credentials: 'omit', cache: 'no-store', mode: 'cors', redirect: 'follow', referrerPolicy: 'no-referrer' })) assert.equal(request.init[key], value);
    assert.equal(request.init.signal.aborted, false);
  }
  assert.equal(first.source, csv);
  assert.equal(first.bytes, encoder.encode(csv).length);
  assert.deepEqual(first.table, second.table);
  assert.ok(Number.isFinite(Date.parse(first.fetchedAt)));
});

test('all cells stay text: leading zeros, mixed types, Unicode, blanks, multiline and literal formulas', async () => {
  const source = '\uFEFFcard_id,title,mixed,rules,blank\r\n001,"Healing, 火 🃏",42,"First\r\nSecond ""quoted""",\r\n002,=SUM(A1:A2),text,+cmd,\r\n003,@name,0,-1,\r\n';
  const bytes = encoder.encode(source);
  let index = 0;
  const stream = new ReadableStream({ pull(controller) {
    if (index === bytes.length) controller.close();
    else controller.enqueue(bytes.slice(index, ++index));
  } });
  const result = await read(response(stream));
  assert.equal(result.source, source.replace(/^\uFEFF/, ''));
  assert.equal(result.bytes, bytes.length);
  assert.deepEqual(result.table.headers, ['card_id', 'title', 'mixed', 'rules', 'blank']);
  assert.deepEqual(result.table.rows.map(row => row.values), [
    ['001', 'Healing, 火 🃏', '42', 'First\nSecond "quoted"', ''],
    ['002', '=SUM(A1:A2)', 'text', '+cmd', ''], ['003', '@name', '0', '-1', ''],
  ]);
});

test('documented Google export redirect destination is accepted', async () => {
  await read(response(csv, { url: 'https://doc-0s-7g-sheets.googleusercontent.com/export/opaque-token' }));
});
for (const url of ['https://evil.test/export', 'https://googleusercontent.com/export', 'https://doc-0s-7g-sheets.googleusercontent.com.evil.test/export', 'http://docs.google.com/export', 'https://user@docs.google.com/export', 'https://docs.google.com:444/export', '']) {
  test(`unexpected final response URL is rejected: ${url}`, async () => {
    await assert.rejects(read(response(csv, { url })), hasCode('unexpected-response'));
  });
}
for (const type of ['opaque', 'opaqueredirect']) test(`${type} responses are rejected`, async () => {
  await assert.rejects(read(response(csv, { type })), hasCode('unexpected-response'));
});
for (const status of [400, 401, 403, 404, 429, 500]) test(`HTTP ${status} is reported without parsing its body`, async () => {
  await assert.rejects(read(response('<html>denied', { status, headers: { 'content-type': 'text/html' } })), error => {
    hasCode('http')(error); assert.equal(error.httpStatus, status); return true;
  });
});
for (const contentType of ['', 'text/html', 'application/json', 'application/octet-stream']) test(`non-CSV MIME type is rejected: ${contentType}`, async () => {
  await assert.rejects(read(response(csv, { headers: { 'content-type': contentType } })), hasCode('unexpected-response'));
});
test('empty body and disguised HTML are rejected', async () => {
  await assert.rejects(read(response(null)), hasCode('unexpected-response'));
  for (const source of ['<!DOCTYPE html>\n<html><body><input value="login"></body></html>', '\ufeff  <html lang="en">\nlogin', '<script src="login">']) {
    await assert.rejects(read(response(source)), hasCode('unexpected-response'));
  }
});
test('HTML-like text is inert valid CSV, including original column names', async () => {
  for (const source of ['<html>,card_id\nabc,001', '<html>\n001']) {
    assert.deepEqual((await read(response(source))).table, parseCsv(source));
  }
});
test('unsupported charset and malformed UTF-8 cannot corrupt text silently', async () => {
  await assert.rejects(read(response(csv, { headers: { 'content-type': 'text/csv; charset=latin1' } })), hasCode('invalid-encoding'));
  for (const body of [new Uint8Array([255]), new Uint8Array([99, 44, 0xf0, 0x9f])]) {
    await assert.rejects(read(response(body)), hasCode('invalid-encoding'));
  }
  await read(response(csv, { headers: { 'content-type': 'Text/CSV; charset="utf8"' } }));
});

test('oversized Content-Length is rejected and the unused body is cancelled', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(read(response(stream, { headers: { 'content-type': 'text/csv', 'content-length': String(CSV_MAX_BYTES + 1) } })), hasCode('too-large'));
  assert.equal(cancelled, true);
});
test('stream cap works without Content-Length and does not await stalled cancellation', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(CSV_MAX_BYTES + 1)); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  await assert.rejects(read(response(stream)), hasCode('too-large'));
  assert.equal(cancelled, true);
});
test('a valid exactly 2 MiB response is accepted; one extra byte is rejected', async () => {
  const source = 'card_id,title\n1,' + 'a'.repeat(CSV_MAX_BYTES - 16);
  assert.equal(encoder.encode(source).length, CSV_MAX_BYTES);
  assert.equal((await read(response(source))).bytes, CSV_MAX_BYTES);
  await assert.rejects(read(response(source + 'a')), hasCode('too-large'));
});
test('timeout covers both a stalled fetch and a body that stalls after headers', async () => {
  await assert.rejects(readGoogleSheet(link, { fetch: () => new Promise(() => {}), timeoutMs: 10 }), hasCode('timeout'));
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('card_id,title\n')); }, cancel() { cancelled = true; } });
  await assert.rejects(read(response(stream), { timeoutMs: 10 }), hasCode('timeout'));
  assert.equal(cancelled, true);
});
test('continuously ready chunks cannot starve the deadline timer', async () => {
  const bytes = encoder.encode('card_id,title\n001,' + 'a'.repeat(100_000));
  let index = 0, cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { if (index < bytes.length) controller.enqueue(bytes.slice(index, ++index)); else controller.close(); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(read(response(stream), { timeoutMs: 1 }), hasCode('timeout'));
  assert.equal(cancelled, true);
});
test('pre-cancelled reads do no network work', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(readGoogleSheet(link, { signal: controller.signal, fetch: async () => { calls++; return response(); } }), hasCode('cancelled'));
  assert.equal(calls, 0);
});
test('cancellation during fetch aborts the request and cleans up a late response', async () => {
  const controller = new AbortController();
  let finish, requestSignal, cancelled = false;
  const pending = readGoogleSheet(link, { signal: controller.signal, fetch: (_url, init) => { requestSignal = init.signal; return new Promise(resolve => { finish = resolve; }); } });
  controller.abort();
  await assert.rejects(pending, hasCode('cancelled'));
  assert.equal(requestSignal.aborted, true);
  finish(response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});
test('cancellation after headers aborts the reader instead of reporting a timeout', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(encoder.encode('card_id,title\n')); }, cancel() { cancelled = true; } });
  const pending = read(response(stream), { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, hasCode('cancelled'));
  assert.equal(cancelled, true);
});
test('network failures remain distinct from text decoding errors', async () => {
  await assert.rejects(readGoogleSheet(link, { fetch: async () => { throw new TypeError('Failed to fetch'); } }), hasCode('network'));
  const stream = new ReadableStream({ start(controller) { controller.error(new TypeError('connection lost')); } });
  await assert.rejects(read(response(stream)), hasCode('network'));
});
for (const timeoutMs of [0, -1, NaN, Infinity, 60001]) test(`invalid timeout ${timeoutMs} is rejected before fetching`, async () => {
  await assert.rejects(read(response(), { timeoutMs }), hasCode('invalid-options'));
});
for (const source of ['', 'card_id,title\n', 'card_id,Title,title\n1,a,b', 'card_id,\n1,a', 'card_id,title\n1,a,b', 'card_id,title\n1,"open']) {
  test(`invalid sheet data is rejected: ${JSON.stringify(source)}`, async () => {
    await assert.rejects(read(response(source)), hasCode('invalid-data'));
  });
}
test('record and column limits apply to Sheets and CSV, including oversized data rows', async () => {
  const tooManyRows = 'card_id\n' + Array.from({ length: 501 }, (_, i) => i).join('\n');
  const tooManyColumns = Array.from({ length: 101 }, (_, i) => `c${i}`).join(',') + '\n' + Array(101).fill('x').join(',');
  const oversizedDataRow = 'card_id\n' + Array(101).fill('x').join(',');
  for (const source of [tooManyRows, tooManyColumns, oversizedDataRow]) {
    await assert.rejects(read(response(source)), hasCode('invalid-data'));
    assert.throws(() => parseCsv(source), /500 card records|100 columns/);
  }
  const columns = Array.from({ length: 100 }, (_, i) => `c${i}`).join(',') + '\n' + Array(100).fill('x').join(',');
  assert.equal((await read(response(columns))).table.headers.length, 100);
});
