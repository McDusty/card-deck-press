
import "./style.css";

// Penpot includes the initial theme in the plugin URL (including hash routes).
const initialTheme = new URLSearchParams(location.search || location.hash.split('?')[1] || '').get('theme');
document.documentElement.dataset.theme = initialTheme === 'dark' ? 'dark' : 'light';
import { initDeckSizing } from './deck-sizing-ui';
import { cardPresets, formatDimensions, toPixels } from './card-sizes';
import { newManualCard, duplicateManualCard } from './manual-cards';
import { isFaceMode, isSheetMode, parseForgeRequest } from './output-options';
import type { CardRecord } from './output-options';
import { createSheetPdf, pdfFilename } from './sheet-pdf';
import type { TemplateSizeInfo } from './template-size';
import { initCsvUi } from './csv-ui';
import type { PageBinding } from './deck-session';
import { ImageTargets, assignCardImage } from './image-targets';
import type { ImageTarget } from './image-targets';
import { printedCopies, cardQuantity } from './deck-data';
import { createArtworkCell } from './artwork-cell';
import type { ArtworkCell } from './artwork-cell';
import type { ArtworkAsset } from './artwork';
import { closeArtworkPicker } from './artwork-picker';
let artworkAssets: ArtworkAsset[] = [];
const artworkCells = new Map<string, ArtworkCell>();
const artworkKey = (rowId: string, name: string) => JSON.stringify([rowId, name]);
let csvMessage: ((type: string, data: unknown) => void) | undefined;

import type {
  PluginUIEvent,
  CardField
} from './model';


////////////////////////// GENERAL
/*
function listenerFunction(this: HTMLElement, ev: Event) {
  ev.preventDefault();
  sendMessage({ type: 'duplicate' })
}
*/

let assetsUrl = "";
let sheetCutLines = true;
let pdfReady = false;
let pdfBusy = false;
let pageBinding: PageBinding = { pageId: null, session: 0 };
let rowIds: string[] = [];
const imageTargets = new ImageTargets();
let editRevision = 0;
let pdfOperation: { id: string; revision: number; session: number } | null = null;
let templateSizeInfo: TemplateSizeInfo = { templates: [], canCorrectPoker: false };

function sendMessage(message: PluginUIEvent) {
  parent.postMessage({ ...message, ...pageBinding }, '*');
}


function initMessageListener() {
  window.addEventListener("message", (event) => {
    if (event.source !== parent || !event.data || typeof event.data.type !== 'string') return;
    const message = event.data;
    if (message.type === 'THEME_CHANGED') {
      if (message.data === 'light' || message.data === 'dark') document.documentElement.dataset.theme = message.data;
      return;
    }
    if (message.type === 'PAGE_CONTEXT') {
      pageBinding = { pageId: message.pageId, session: message.session };
      cardsData = []; rowIds = []; cardFields = []; artworkAssets = []; artworkCells.clear(); imageTargets.clear();
      pdfOperation = null; setPdfBusy(false); invalidateOutput();
      loadCardFields(false); reloadCardEntries();
      csvMessage?.('CSV_RESET', null);
      createDeckShowError(false);
      return;
    }
    if (message.pageId !== pageBinding.pageId || message.session !== pageBinding.session) return;
    if (message.type === 'CSV_APPLIED') { rowIds = message.rowIds; imageTargets.clear(); }
    csvMessage?.(message.type, message.data);
    if (event.data.type == "ERROR_DECK_CREATE_PAGE_NOT_EMPTY") {
      createDeckShowError(true);
    } else if (event.data.type === 'DECK_SIZE_ERROR') {
      showCreateSizeError(event.data.data);
    } else if (event.data.type == "CARDS_DATA") {
      loadCardsData(event.data.data, event.data.rowIds);
    } else if (event.data.type == "CARD_FIELDS") {
      assetsUrl = document.referrer ? new URL('/assets/by-file-media-id/', document.referrer).href : event.data.data.assetsUrl;
      cardFields = event.data.data.fields;
      loadCardFields();
    } else if (event.data.type == "IMAGE_CREATED") {
      updateImageInfo(event.data.data, event.data.data.id, event.data.data.imageId);
    } else if (message.type === 'ARTWORK_SELECTED') {
      updateImageReference(message.data, message.data.reference);
    } else if (message.type === 'ARTWORK_LIST') {
      artworkAssets = message.data as ArtworkAsset[];
      for (const [key, cell] of artworkCells) {
        const [rowId, name] = JSON.parse(key) as string[];
        const card = cardsData[rowIds.indexOf(rowId)];
        if (card) cell.refresh(artworkAssets, card[name] ?? '');
      }
    } else if (message.type === 'IMAGE_ERROR') {
      const target = message.data as ImageTarget;
      if (target.uploadId && !imageTargets.matches(target)) return;
      imageTargets.finish(target);
      artworkCells.get(artworkKey(target.rowId, target.name))?.error(message.data.message);
      showDeckError(message.data.message);
    } else if (message.type === 'DECK_ERROR') {
      showDeckError(message.data);
    } else if (event.data.type == "PAGE_EMPTY") {
      if (event.data.data) {
        changeTab("create");
      } else {
        changeTab("cards");
      }
    } else if (event.data.type === 'TEMPLATE_SIZE' || event.data.type === 'POKER_SIZE_CORRECTED') {
      templateSizeInfo = event.data.data;
      updateTemplateSize();
      if (event.data.type === 'POKER_SIZE_CORRECTED') {
        pdfReady = false;
        document.getElementById('download-pdf')?.classList.add('hidden');
        const note = document.getElementById('template-size-note')!;
        note.textContent = 'Poker size corrected. Forge again to update the sheets. You can undo the correction in Penpot.';
        note.classList.remove('hidden');
      }
    } else if (event.data.type === 'TEMPLATE_SIZE_ERROR') {
      (document.getElementById('correct-poker-size') as HTMLButtonElement).disabled = false;
      const note = document.getElementById('template-size-note')!;
      note.textContent = event.data.data;
      note.classList.remove('hidden');
    } else if (event.data.type === 'FORGE_ERROR') {
      showForgeError(event.data.data);
    } else if (event.data.type === 'OUTPUT_READY') {
      (document.getElementById('box-forge-ok') as HTMLButtonElement).disabled = false;
      setPdfStatus('Cards generated. Choose single cards, six-up, nine-up, or Print and Play to download a multi-page PDF.');
    } else if (event.data.type === 'FRONT_OUTPUT_READY') {
      pdfReady = true;
      (document.getElementById('box-forge-ok') as HTMLButtonElement).disabled = false;
      document.getElementById('download-pdf')?.classList.remove('hidden');
      setPdfStatus(`Generated ${event.data.data.sheets} ${event.data.data.sheets === 1 ? 'page' : 'pages'}. Download the PDF and print at Actual Size (100%).`);
    } else if (event.data.type === 'PDF_EXPORT_PROGRESS') {
      if (pdfOperation?.id !== message.requestId) return;
      setPdfStatus(`Preparing sheet ${event.data.data.current} of ${event.data.data.total}…`);
    } else if (event.data.type === 'FRONT_PDF_IMAGES') {
      if (pdfOperation && pdfOperation.id === message.requestId) void downloadPdfImages(message.data, pdfOperation);
    } else if (event.data.type === 'PDF_EXPORT_ERROR') {
      if (pdfOperation?.id !== message.requestId) return;
      pdfOperation = null; setPdfBusy(false);
      showForgeError(event.data.data);
    } else if (event.data.type === 'OUTPUT_SETTINGS') {
      const settings = event.data.data;
      if (settings && typeof settings.type === 'string' && (isFaceMode(settings.type) || ['standard', 'printplay', 'tabletop'].includes(settings.type))) {
        (document.getElementById('forge-type') as HTMLSelectElement).value = settings.type;
        if (settings.paper === 'a4' || settings.paper === 'letter') {
          (document.getElementById('forge-paper') as HTMLSelectElement).value = settings.paper;
        }
        if (typeof settings.cutMarks === 'boolean') sheetCutLines = settings.cutMarks;
        changeForgeType();
      }
    }
  });
}


///////////////////////////// TAB SELECTORS

const tabSelectors = document.querySelectorAll<HTMLButtonElement>('.tab-selector');
const tabs = document.querySelectorAll('.tab');

function changeTab(name: string) {
  for (const element of tabSelectors) {
    const selected = element.dataset.tab === name;
    element.classList.toggle('current', selected);
    element.setAttribute('aria-selected', String(selected));
    element.tabIndex = selected ? 0 : -1;
  }

  for (const element of tabs) {
    element.classList.add("hidden");
  }

  document.getElementById("tab-" + name)?.classList.remove("hidden");
  if (name === 'export') {
    sendMessage({ type: 'load-template-size', data: null });
    if (!pdfBusy) changeForgeType(false);
  }
}

function initTabSelectors() {
  document.getElementById('create-edit-deck-link')?.addEventListener('click', event => {
    event.preventDefault();
    changeTab('cards');
    document.getElementById('ts-cards')?.focus();
  });
  for (const [index, element] of [...tabSelectors].entries()) {
    element.addEventListener('click', () => {
      changeTab(element.getAttribute('data-tab') as string);
    });
    element.addEventListener('keydown', event => {
      let target: number;
      switch (event.key) {
        case 'ArrowRight': target = (index + 1) % tabSelectors.length; break;
        case 'ArrowLeft': target = (index + tabSelectors.length - 1) % tabSelectors.length; break;
        case 'Home': target = 0; break;
        case 'End': target = tabSelectors.length - 1; break;
        default: return;
      }
      event.preventDefault();
      const next = tabSelectors[target];
      changeTab(next.dataset.tab!);
      next.focus();
    });
  }
  changeTab('create');
}


///////////////////////////// CREATE DECK
let customDeckSize: () => { width: number; height: number } | null;






function createDeck(this: HTMLElement, ev: Event) {
  ev.preventDefault();
  document.getElementById('create-size-error')?.classList.add('hidden');
  let name = (document.getElementById("create-deck-name") as HTMLInputElement)?.value;
  let size = (document.getElementById("create-deck-size") as HTMLInputElement)?.value;
  let orientation = (document.getElementById("create-deck-orientation") as HTMLInputElement)?.value;

  try {
    sendMessage({ type: 'create-deck', name, size, orientation, data: customDeckSize() });
  } catch (error) {
    showCreateSizeError(error instanceof Error ? error.message : 'Enter a valid card size.');
  }

}


function createDeckShowError(show: boolean) {

  if (show) {
    document.getElementById("box-create-error")?.classList.remove("hidden");
    document.getElementById("box-create")?.classList.add("hidden");
  } else {
    document.getElementById("box-create-error")?.classList.add("hidden");
    document.getElementById("box-create")?.classList.remove("hidden");
  }

}

function showCreateSizeError(message: string) {
  const error = document.getElementById('create-size-error')!;
  error.textContent = message; error.classList.remove('hidden');
}

function initCreateDeck() {
  document.getElementById("create-deck-frm")?.addEventListener("submit", createDeck);
  document.getElementById("box-create-error-close")?.addEventListener("click", () => { createDeckShowError(false) });
  customDeckSize = initDeckSizing();
}



////////////////////////////// CARDS

const cardList = document.getElementById("card-list") as HTMLElement;
let cardFields: CardField[] = [];
let cardsData: CardRecord[] = [];


function saveCardsData() {
  invalidateOutput();
  sendMessage({ type: 'save-cards-data', data: JSON.stringify(cardsData), rowIds });
}

function showDeckError(message: string) {
  const note = document.getElementById('csv-deck-status')!;
  note.textContent = message; note.classList.remove('hidden');
}

function updateImageInfo(target: ImageTarget, id: string, imageId: string) {
  updateImageReference(target, `${imageId}|${id}`);
}

function updateImageReference(target: ImageTarget, reference: string) {
  if (!imageTargets.matches(target)) return;
  imageTargets.finish(target);
  if (!assignCardImage(cardsData, rowIds, target, reference)) return;
  const note = document.getElementById('csv-deck-status');
  if (note) { note.textContent = ''; note.classList.add('hidden'); }
  artworkCells.get(artworkKey(target.rowId, target.name))?.accept(artworkAssets, reference);
  saveCardsData();
}

function chooseCardArtwork(rowId: string, session: number, name: string, value: string) {
  if (pageBinding.session !== session || !rowIds.includes(rowId)) return;
  const target = { rowId, name, uploadId: crypto.randomUUID() };
  imageTargets.start(target);
  invalidateOutput();
  sendMessage({ type: 'select-artwork', data: { ...target, value } });
}

function loadCardsData(data: string, identities: string[]) {
  cardsData = JSON.parse(data);
  rowIds = identities;
  loadCardFields(false);
  reloadCardEntries();
}

function createCardEntry(num: number, cardData: CardRecord) {
  const rowId = rowIds[num - 1];
  const entrySession = pageBinding.session;
  const currentIndex = () => pageBinding.session === entrySession ? rowIds.indexOf(rowId) : -1;
  let entry = document.createElement("div");
  entry.classList.add("card-entry");
  entry.id = "card-entry-" + num;

  let actions = document.createElement("div");
  actions.classList.add("card-actions");

  let copy = document.createElement("button");
  copy.type = 'button'; copy.setAttribute('aria-label', `Duplicate card ${num}`);
  copy.classList.add("card-action-copy");
  copy.addEventListener("click", () => { currentIndex() >= 0 && copyCard(currentIndex() + 1) });
  actions.appendChild(copy);

  let del = document.createElement("button");
  del.type = 'button'; del.setAttribute('aria-label', `Delete card ${num}`);
  del.classList.add("card-action-delete");
  del.addEventListener("click", () => { currentIndex() >= 0 && deleteCard(currentIndex() + 1) });
  actions.appendChild(del);

  let number = document.createElement("div");
  number.classList.add("card-num");
  number.innerText = String(num).padStart(2, '0');
  entry.appendChild(number);

  if (cardsData.some(card => card.card_id !== undefined)) {
    const div = document.createElement('div'); div.className = 'card-text';
    const input = document.createElement('input'); input.value = cardData.card_id ?? '';
    input.setAttribute('aria-label', `Card ID for card ${num}`);
    input.addEventListener('input', () => saveCardText(rowId, entrySession, 'card_id', input.value));
    div.appendChild(input); entry.appendChild(div);
  }

  const quantityCell = document.createElement('div'); quantityCell.className = 'card-quantity';
  const quantityInput = document.createElement('input');
  quantityInput.type = 'number'; quantityInput.min = '0'; quantityInput.max = '100'; quantityInput.step = '1'; quantityInput.required = true;
  quantityInput.value = cardData.quantity ?? '1';
  quantityInput.setAttribute('aria-label', `Quantity for card ${num}`);
  quantityInput.title = 'Number of printed copies (0–100). Use 0 to exclude this card.';
  quantityInput.addEventListener('input', () => {
    const value = quantityInput.validity.valid ? String(quantityInput.valueAsNumber) : quantityInput.value;
    saveCardText(rowId, entrySession, 'quantity', value);
  });
  quantityInput.addEventListener('change', () => quantityInput.reportValidity());
  quantityCell.appendChild(quantityInput); entry.appendChild(quantityCell);

  for (let i = 0; i < cardFields.length; i++) {
    const field = cardFields[i];
    if (field.type == "text") {
      let div = document.createElement("div");
      div.classList.add("card-text");

      let input = document.createElement("textarea");
      input.rows = 1;
      input.setAttribute('aria-label', `${field.name.substring(1)} for card ${num}`);
      if (Object.prototype.hasOwnProperty.call(cardData, field.name)) {
        input.value = cardData[field.name];
      }
      input.addEventListener("input", () => { saveCardText(rowId, entrySession, field.name, input.value) });
      div.appendChild(input);

      entry.appendChild(div);
    } else {
      const cell = createArtworkCell({
        label: `${field.name.substring(1)} for card ${num}`,
        reference: cardData[field.name] ?? '', assets: artworkAssets, assetsUrl,
        choose: value => chooseCardArtwork(rowId, entrySession, field.name, value),
        upload: event => { void saveCardImage(rowId, entrySession, field.name, event); },
        draft: () => { imageTargets.cancel(rowId, field.name); invalidateOutput(); },
      });
      artworkCells.set(artworkKey(rowId, field.name), cell);
      entry.appendChild(cell.element);
    }
  }

  entry.appendChild(actions);
  return entry;
}

function addEmptyCard() {
  const cardData = { ...newManualCard(cardsData), ...Object.fromEntries(cardFields.map(field => [field.name, ''])) };
  cardsData.push(cardData);
  rowIds.push(crypto.randomUUID());
  let entry = createCardEntry(cardsData.length, cardData);
  cardList?.appendChild(entry);
  updateCardsEmptyState();
  saveCardsData();
  cardList.scrollTop = cardList?.scrollHeight;
  entry.querySelector<HTMLTextAreaElement>('textarea')?.focus();
}

function deleteCard(num: number) {
  cardsData.splice((num - 1), 1);
  rowIds.splice(num - 1, 1);
  imageTargets.retainRows(rowIds);
  saveCardsData();
  reloadCardEntries();
}

function copyCard(num: number) {
  const card = duplicateManualCard(cardsData[num - 1], cardsData);
  cardsData.splice(num - 1, 0, card);
  rowIds.splice(num - 1, 0, crypto.randomUUID());
  saveCardsData();

  reloadCardEntries();
}

function saveCardText(rowId: string, session: number, name: string, val: string) {
  const index = rowIds.indexOf(rowId);
  if (pageBinding.session !== session || index < 0) return;
  cardsData[index][name] = val;
  saveCardsData();
}

async function saveCardImage(rowId: string, session: number, name: string, event: Event) {
  if (pageBinding.session !== session || !rowIds.includes(rowId)) return;
  const fileInput = event.target as HTMLInputElement;
  const file = fileInput.files?.[0];
  if (!file) return;
  const target = { rowId, name, uploadId: crypto.randomUUID() };
  const context = { ...pageBinding };
  imageTargets.start(target);
  artworkCells.get(artworkKey(rowId, name))?.pending(`Uploading ${file.name}…`);
  invalidateOutput();
  try {
    if (file.size > 32 * 1024 * 1024) throw new Error('Choose an image smaller than 32 MiB.');
    const data = new Uint8Array(await file.arrayBuffer());
    if (pageBinding.session !== context.session || !rowIds.includes(target.rowId) || !imageTargets.matches(target)) return;
    sendMessage({ type: 'create-image-data', data: { ...target, data, mimeType: file.type, filename: file.name } });
  } catch (error) {
    if (pageBinding.session === context.session && imageTargets.matches(target)) {
      imageTargets.finish(target);
      const text = error instanceof Error ? error.message : 'Could not read the image.';
      artworkCells.get(artworkKey(rowId, name))?.error(text); showDeckError(text);
    }
  } finally { fileInput.value = ''; }
}



function loadCardFields(requestData = true) {
  //cardFields = [{ "name": "Nombre", "type": "text" }, { "name": "Fuerza", "type": "text" }];
  const cardHeader = document.getElementById("cards-header");
  const cardsHeaderActions = document.getElementById("cards-header-actions");

  document.querySelectorAll('.card-header').forEach(e => e.remove());
  document.getElementById('cards-fields-note')?.classList.toggle('hidden', cardFields.length > 0);
  if (cardsData.some(card => card.card_id !== undefined)) {
    const div = document.createElement('div'); div.className = 'card-header card-text'; div.textContent = 'Card ID';
    cardHeader?.insertBefore(div, cardsHeaderActions);
  }
  const quantityHeader = document.createElement('div'); quantityHeader.className = 'card-header card-quantity'; quantityHeader.textContent = 'Quantity';
  cardHeader?.insertBefore(quantityHeader, cardsHeaderActions);
  for (let i = 0; i < cardFields.length; i++) {
    let field = cardFields[i];
    let div = document.createElement("div");
    div.classList.add("card-header");
    if (field.type == "image") {
      div.classList.add("card-image");
    } else {
      div.classList.add("card-text");
    }
    div.innerText = field.name.substring(1);
    cardHeader?.insertBefore(div, cardsHeaderActions)
  }


  if (requestData) sendMessage({ type: 'load-cards-data', data: "" });
}


function reloadCardEntries() {
  closeArtworkPicker();
  artworkCells.clear();
  document.querySelectorAll('.card-entry').forEach(e => e.remove());
  updateCardsEmptyState();

  for (let i = 0; i < cardsData.length; i++) {
    let entry = createCardEntry(i + 1, cardsData[i]);
    cardList?.appendChild(entry);
  }
}

function updateCardsEmptyState() {
  document.getElementById('cards-empty')?.classList.toggle('hidden', cardsData.length > 0);
}

function invalidateOutput() {
  editRevision++;
  pdfReady = false;
  document.getElementById('download-pdf')?.classList.add('hidden');
  setPdfStatus('');
}

function forgeCards() {
  try {
    const mode = (document.getElementById('forge-type') as HTMLSelectElement).value;
    if (!mode.startsWith('backs-')) for (const [key, cell] of artworkCells) {
      const [rowId] = JSON.parse(key) as string[];
      const card = cardsData[rowIds.indexOf(rowId)];
      if (card && cardQuantity(card) > 0 && !cell.ready()) {
        changeTab('cards'); cell.focus(); showDeckError('Finish choosing the Artwork image before generating cards.'); return;
      }
    }
    pdfReady = false;
    document.getElementById('download-pdf')?.classList.add('hidden');
    setPdfStatus('');
    const request = parseForgeRequest({
      cardsData,
      type: (document.getElementById('forge-type') as HTMLSelectElement).value,
      cutMarks: (document.getElementById('forge-cut-marks') as HTMLSelectElement).value,
      paper: (document.getElementById('forge-paper') as HTMLSelectElement).value,
    });
    showForgeError('');
    (document.getElementById('box-forge-ok') as HTMLButtonElement).disabled = true;
    sendMessage({ type: 'forge-cards', data: request });
  } catch (error) {
    showForgeError(error instanceof Error ? error.message : 'Check your output settings.');
  }
}

function setPdfStatus(message: string) {
  const status = document.getElementById('pdf-status') as HTMLElement;
  status.textContent = message;
  status.classList.toggle('hidden', !message);
}

function setPdfBusy(busy: boolean) {
  pdfBusy = busy;
  for (const id of ['box-forge-ok', 'box-forge-cancel', 'download-pdf', 'forge-type', 'forge-paper', 'forge-cut-marks']) {
    (document.getElementById(id) as HTMLButtonElement | HTMLSelectElement).disabled = busy;
  }
  if (!busy) (document.getElementById('forge-cut-marks') as HTMLSelectElement).disabled = !isSheetMode((document.getElementById('forge-type') as HTMLSelectElement).value) && (document.getElementById('forge-type') as HTMLSelectElement).value !== 'standard' && (document.getElementById('forge-type') as HTMLSelectElement).value !== 'printplay';
}

function requestPdf() {
  if (!pdfReady || pdfBusy) return;
  showForgeError('');
  setPdfBusy(true);
  setPdfStatus('Preparing print PDF…');
  pdfOperation = { id: crypto.randomUUID(), revision: editRevision, session: pageBinding.session };
  sendMessage({ type: 'export-front-pdf', requestId: pdfOperation.id, data: {
    cardsData,
    type: (document.getElementById('forge-type') as HTMLSelectElement).value,
    paper: (document.getElementById('forge-paper') as HTMLSelectElement).value,
    cutMarks: (document.getElementById('forge-cut-marks') as HTMLSelectElement).value,
  } });
}

async function downloadPdfImages(data: { pages: Uint8Array[]; paper: 'letter' | 'a4'; deckName: string; layout: string; landscape?: boolean; pageSize?: [number, number] }, operation: NonNullable<typeof pdfOperation>) {
  let url: string | undefined;
  try {
    const assertCurrent = () => {
      if (pdfOperation !== operation || editRevision !== operation.revision || pageBinding.session !== operation.session) throw new Error('The deck changed during export. Generate again before downloading.');
    };
    assertCurrent();
    const images = data.pages.map(page => page instanceof Uint8Array ? page : new Uint8Array(page));
    const bytes = await createSheetPdf(images, data.paper, { assertCurrent, landscape: data.landscape, pageSize: data.pageSize });
    assertCurrent();
    if (bytes.byteLength > 256 * 1024 * 1024) throw new Error('The PDF exceeds the 256 MiB download limit.');
    url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = pdfFilename(data.deckName, data.layout);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setPdfStatus('PDF ready. Print at Actual Size (100%), with no scaling.');
  } catch (error) {
    if (pdfOperation === operation) showForgeError(error instanceof Error ? error.message : 'PDF download failed. Try again.');
  } finally {
    if (pdfOperation === operation) { pdfOperation = null; setPdfBusy(false); }
    if (url) setTimeout(() => URL.revokeObjectURL(url!), 30_000);
  }
}

function showForgeError(message: string) {
  const error = document.getElementById('forge-error') as HTMLElement;
  error.textContent = message;
  error.classList.toggle('hidden', !message);
  (document.getElementById('box-forge-ok') as HTMLButtonElement).disabled = false;
}

function changeForgeType(invalidate = true) {
  try { for (const card of cardsData) cardQuantity(card); }
  catch (error) { showForgeError(error instanceof Error ? error.message : 'Check quantities.'); return; }
  const text = document.getElementById("forge-explain-type") as HTMLInputElement;
  const value = (document.getElementById("forge-type") as HTMLInputElement).value;
  const cutMarks = document.getElementById("forge-cut-marks") as HTMLInputElement
  const frontOnly = isFaceMode(value);
  if (invalidate) invalidateOutput();
  document.getElementById('forge-paper-row')?.classList.toggle('hidden', !isSheetMode(value));
  document.getElementById('forge-explain-warning')!.textContent = frontOnly
    ? `Replaces only this deck’s generated ${value.startsWith('backs-') ? 'Backs' : 'Fronts'} Output. Template and other boards stay intact.`
    : 'Replaces only this deck’s generated Output. Unclaimed older output and other boards stay intact.';
  if (frontOnly) {
    const backOnly = value.startsWith('backs-');
    const count = printedCopies(cardsData);
    const sheetCount = Math.ceil(count / (value.endsWith('-6') ? 6 : 9));
    text.innerText = !isSheetMode(value)
      ? backOnly ? 'One separate board with the shared Back design. No fronts.' : `One separate front board per included design (${cardsData.filter(card => cardQuantity(card) > 0).length} cards). No backs.`
      : `${value.endsWith('-6') ? '2 × 3' : '3 × 3'} grid, ${sheetCount} ${sheetCount === 1 ? 'sheet' : 'sheets'} for ${count} ${backOnly ? 'backs' : 'fronts'}. 5 mm margins. Cards share edges with no gaps; template size is preserved.`;
    cutMarks.value = !isSheetMode(value) ? 'false' : sheetCutLines ? 'true' : 'false';
    cutMarks.disabled = !isSheetMode(value);
  } else if (value == "standard") {
    text.innerText = "It will generate a frame for each card, and an extra frame for the back.";
    cutMarks.disabled = false;
  } else if (value == "printplay") {
    text.innerText = "A4 pages with the cards. Cards with the front and the back joined, to cut them together and fold them by the joint.";
    cutMarks.disabled = false;
  } else {
    text.innerHTML = "It will generate a frame with a <a href='https://kb.tabletopsimulator.com/custom-content/custom-deck/' target='_blank'>card set for Tabletop Simulator</a>.";
    cutMarks.value = "false";
    cutMarks.disabled = true;
  }
  changeCutMarks();
}


function changeCutMarks() {
  let text = document.getElementById("forge-explain-marks") as HTMLInputElement;
  const mode = (document.getElementById('forge-type') as HTMLSelectElement).value;
  const enabled = (document.getElementById('forge-cut-marks') as HTMLSelectElement).value === 'true';
  const sheet = isSheetMode(mode);
  if (sheet) sheetCutLines = enabled;
  if (enabled) {
    text.innerText = sheet ? 'One straight cut line at each shared card edge.' : 'Cut marks will be printed to indicate how to cut the cards.';
  } else {
    text.innerText = "No cut lines.";
  }
}

function updateTemplateSize() {
  const description = templateSizeInfo.templates.map(template => `${template.name}: ${Number(template.width.toFixed(2))} × ${Number(template.height.toFixed(2))} px`).join(' · ');
  document.getElementById('template-size')!.textContent = description || 'Poker size: 750 × 1050 px (2.5 × 3.5 inches at 300 ppi).';
  const button = document.getElementById('correct-poker-size') as HTMLButtonElement;
  button.disabled = false;
  button.classList.toggle('hidden', !templateSizeInfo.canCorrectPoker);
  const label = document.getElementById('forge-template-size');
  if (label) label.textContent = description ? `${description}. Cards keep this size.` : '';
}

function initCards() {
  loadCardFields(false);
  document.getElementById('refresh-artwork')?.addEventListener('click', () => sendMessage({ type: 'load-artwork', data: null }));
  document.getElementById('correct-poker-size')?.addEventListener('click', () => {
    (document.getElementById('correct-poker-size') as HTMLButtonElement).disabled = true;
    document.getElementById('template-size-note')?.classList.add('hidden');
    sendMessage({ type: 'correct-poker-size', data: null });
  });

  document.getElementById("add-card")?.addEventListener("click", () => { addEmptyCard() });
  document.getElementById('empty-add-card')?.addEventListener('click', addEmptyCard);
  document.getElementById("box-forge-cancel")?.addEventListener("click", () => {
    changeTab('cards');
    document.getElementById('ts-cards')?.focus();
  });
  document.getElementById('forge-frm')?.addEventListener('submit', event => { event.preventDefault(); forgeCards(); });
  document.getElementById("forge-type")?.addEventListener("change", () => { changeForgeType() });
  document.getElementById("forge-cut-marks")?.addEventListener("change", () => { changeCutMarks() });
  document.getElementById('download-pdf')?.addEventListener('click', requestPdf);
  for (const id of ['forge-paper', 'forge-cut-marks']) document.getElementById(id)?.addEventListener('change', () => {
    pdfReady = false;
    document.getElementById('download-pdf')?.classList.add('hidden');
    if (id === 'forge-paper') changeForgeType();
    setPdfStatus('Settings changed. Forge again to download.');
  });
}


function renderHelpCardSizes() {
  const body = document.getElementById('help-card-sizes')!;
  body.replaceChildren(...cardPresets.map(preset => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row'; name.textContent = preset.name; row.append(name);
    const width = toPixels(preset.width, preset.unit);
    const height = toPixels(preset.height, preset.unit);
    for (const unit of ['inch', 'mm', 'px'] as const) {
      const cell = document.createElement('td');
      cell.textContent = formatDimensions(width, height, unit); row.append(cell);
    }
    return row;
  }));
}

//////////////////////////// ONLOAD

window.onload = (_event) => {
  initMessageListener();
  initTabSelectors();
  initCreateDeck();
  initCards();
  csvMessage = initCsvUi({
    send: (type, data) => sendMessage({ type, data }),
    apply: cards => { cardsData = cards; loadCardFields(false); reloadCardEntries(); },
    invalidate: invalidateOutput,
  });
  renderHelpCardSizes();

  sendMessage({ type: 'load-page', data: null });
};
