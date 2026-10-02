
import "./style.css";
import { initDeckSizing } from './deck-sizing-ui';
import { cardPresets, formatDimensions, toPixels } from './card-sizes';
import { newManualCard, duplicateManualCard } from './manual-cards';
import { isFaceMode, isSheetMode, parseForgeRequest } from './output-options';
import type { CardRecord } from './output-options';
import { createSheetPdf, pdfFilename } from './sheet-pdf';
import type { TemplateSizeInfo } from './template-size';
import { initCsvUi } from './csv-ui';
import { printedCopies, cardQuantity } from './deck-data';
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
let templateSizeInfo: TemplateSizeInfo = { templates: [], canCorrectPoker: false };

function sendMessage(message: PluginUIEvent) {
  parent.postMessage(message, '*');
}


function initMessageListener() {
  window.addEventListener("message", (event) => {
    console.log("[main] received:");
    console.log(event);
    csvMessage?.(event.data.type, event.data.data);
    if (event.data.type == "ERROR_DECK_CREATE_PAGE_NOT_EMPTY") {
      createDeckShowError(true);
    } else if (event.data.type === 'DECK_SIZE_ERROR') {
      showCreateSizeError(event.data.data);
    } else if (event.data.type == "CARDS_DATA") {
      loadCardsData(event.data.data);
    } else if (event.data.type == "CARD_FIELDS") {
      assetsUrl = document.referrer ? new URL('/assets/by-file-media-id/', document.referrer).href : event.data.data.assetsUrl;
      cardFields = event.data.data.fields;
      loadCardFields();
    } else if (event.data.type == "IMAGE_CREATED") {
      updateImageInfo(event.data.data.num, event.data.data.name, event.data.data.id, event.data.data.imageId);
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
    } else if (event.data.type === 'FRONT_OUTPUT_READY') {
      pdfReady = true;
      (document.getElementById('box-forge-ok') as HTMLButtonElement).disabled = false;
      document.getElementById('download-pdf')?.classList.remove('hidden');
      setPdfStatus(`Generated ${event.data.data.sheets} ${event.data.data.sheets === 1 ? 'sheet' : 'sheets'}. Download the PDF and print at Actual Size (100%).`);
    } else if (event.data.type === 'PDF_EXPORT_PROGRESS') {
      setPdfStatus(`Preparing sheet ${event.data.data.current} of ${event.data.data.total}…`);
    } else if (event.data.type === 'FRONT_PDF_IMAGES') {
      void downloadPdfImages(event.data.data);
    } else if (event.data.type === 'PDF_EXPORT_ERROR') {
      setPdfBusy(false);
      showForgeError(event.data.data);
    } else if (event.data.type === 'OUTPUT_SETTINGS') {
      const settings = event.data.data;
      if (settings && typeof settings.type === 'string' && isFaceMode(settings.type)) {
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
  sendMessage({ type: 'save-cards-data', data: JSON.stringify(cardsData) });
}

function updateImageInfo(num: number, name: string, id: string, imageId: string) {
  cardsData[num - 1][name] = imageId + "|" + id;
  saveCardsData();
}

function loadCardsData(data: string) {
  if (data) {
    cardsData = JSON.parse(data);
    loadCardFields(false);
    reloadCardEntries();
  }
}

function createCardEntry(num: number, cardData: CardRecord) {
  let entry = document.createElement("div");
  entry.classList.add("card-entry");
  entry.id = "card-entry-" + num;

  let actions = document.createElement("div");
  actions.classList.add("card-actions");

  let copy = document.createElement("div");
  copy.classList.add("card-action-copy");
  copy.addEventListener("click", () => { copyCard(num) });
  actions.appendChild(copy);

  let del = document.createElement("div");
  del.classList.add("card-action-delete");
  del.addEventListener("click", () => { deleteCard(num) });
  actions.appendChild(del);

  let number = document.createElement("div");
  number.classList.add("card-num");
  number.innerText = String(num).padStart(2, '0');
  entry.appendChild(number);

  if (cardsData.some(card => card.card_id !== undefined)) {
    const div = document.createElement('div'); div.className = 'card-text';
    const input = document.createElement('input'); input.value = cardData.card_id ?? '';
    input.setAttribute('aria-label', `Card ID for card ${num}`);
    input.addEventListener('blur', () => saveCardText(num, 'card_id', input.value));
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
    saveCardText(num, 'quantity', value);
  });
  quantityInput.addEventListener('change', () => quantityInput.reportValidity());
  quantityCell.appendChild(quantityInput); entry.appendChild(quantityCell);

  for (let i = 0; i < cardFields.length; i++) {
    if (cardFields[i].type == "text") {
      let div = document.createElement("div");
      div.classList.add("card-text");

      let input = document.createElement("textarea");
      input.rows = 1;
      input.setAttribute('aria-label', `${cardFields[i].name.substring(1)} for card ${num}`);
      if (Object.prototype.hasOwnProperty.call(cardData, cardFields[i].name)) {
        input.value = cardData[cardFields[i].name];
      }
      input.addEventListener("blur", () => { saveCardText(num, cardFields[i].name, input.value) });
      div.appendChild(input);

      entry.appendChild(div);
    } else {
      let div = document.createElement("div");
      div.classList.add("card-image");
      let img = document.createElement("img");


      let fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";

      div.appendChild(fileInput);


      if (cardData[cardFields[i].name]) {
        let assetId = cardData[cardFields[i].name].split("|")[1];
        img.src = assetsUrl + assetId;
        div.classList.add("card-image-full");
      } else {
        img.src = "images/add_image.png";
      }

      div.appendChild(img);
      img.addEventListener("click", () => { fileInput.click() });
      fileInput.addEventListener("change", (ev: Event) => { saveCardImage(num, cardFields[i].name, img, ev) });

      entry.appendChild(div);
    }
  }

  entry.appendChild(actions);
  return entry;
}

function addEmptyCard() {
  const cardData = newManualCard(cardsData);
  cardsData.push(cardData);
  let entry = createCardEntry(cardsData.length, cardData);
  cardList?.appendChild(entry);
  updateCardsEmptyState();
  saveCardsData();
  cardList.scrollTop = cardList?.scrollHeight;
  entry.querySelector<HTMLTextAreaElement>('textarea')?.focus();
}

function deleteCard(num: number) {
  cardsData.splice((num - 1), 1);
  saveCardsData();
  reloadCardEntries();
}

function copyCard(num: number) {
  const card = duplicateManualCard(cardsData[num - 1], cardsData);
  cardsData.splice(num - 1, 0, card);
  saveCardsData();

  reloadCardEntries();
}

function saveCardText(num: number, name: string, val: string) {
  cardsData[num - 1][name] = val;
  saveCardsData();
}

/*
function handleImagePreview(fileInput, previewContainer) {
  const file = fileInput.files[0];

  fileInput.dataset.dirty = true;

  if (file) {
    const reader = new FileReader();

    reader.onload = (event) => {
      const imageBlob = event.target.result;
      const imageUrl = URL.createObjectURL(new Blob([imageBlob], { type: 'image/jpeg' }));

      previewContainer.src = imageUrl;

    };

    reader.readAsArrayBuffer(file);
  } else {
    alert("Please select an image first!");
  }
}
*/

async function saveCardImage(num: number, name: string, img: HTMLImageElement, event: Event) {
  const fileInput = event.target as HTMLInputElement;
  if (fileInput?.files?.length) {
    const file = fileInput?.files[0];

    if (file) {
      const buff = await file.arrayBuffer();
      const data = new Uint8Array(buff);
      const mimeType = file.type;

      const imageUrl = URL.createObjectURL(new Blob([data], { type: mimeType }));
      img.src = imageUrl;

      if (img.parentNode instanceof HTMLElement) {
        img.parentNode.classList.add("card-image-full");
      }

      sendMessage({ type: 'create-image-data', data: { data, mimeType, num, name, filename: file.name } });
      fileInput.value = '';
    }
  }
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
  pdfReady = false;
  document.getElementById('download-pdf')?.classList.add('hidden');
  setPdfStatus('');
}

function forgeCards() {
  try {
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
  sendMessage({ type: 'export-front-pdf', data: {
    cardsData,
    type: (document.getElementById('forge-type') as HTMLSelectElement).value,
    paper: (document.getElementById('forge-paper') as HTMLSelectElement).value,
    cutMarks: (document.getElementById('forge-cut-marks') as HTMLSelectElement).value,
  } });
}

async function downloadPdfImages(data: { pages: Uint8Array[]; paper: 'letter' | 'a4'; deckName: string; layout: string }) {
  let url: string | undefined;
  try {
    const bytes = await createSheetPdf(data.pages.map(page => new Uint8Array(page)), data.paper);
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
    showForgeError(error instanceof Error ? error.message : 'PDF download failed. Try again.');
  } finally {
    setPdfBusy(false);
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
    : 'WARNING: Old Output will be deleted.';
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
  sendMessage({ type: 'load-template-size', data: null });
  document.getElementById('correct-poker-size')?.addEventListener('click', () => {
    (document.getElementById('correct-poker-size') as HTMLButtonElement).disabled = true;
    document.getElementById('template-size-note')?.classList.add('hidden');
    sendMessage({ type: 'correct-poker-size', data: null });
  });
  sendMessage({ type: 'load-card-fields', data: "" });
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

  sendMessage({ type: 'is-page-empty', data: "" });
  sendMessage({ type: 'load-output-settings', data: '' });
};
