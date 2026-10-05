
import { resolveDeckSize } from './card-sizes';
import { Shape, Board } from '@penpot/plugin-types';
import type { PluginUIEvent, DeckEvent, CardField } from './model';
import { isFaceMode, parseForgeRequest } from './output-options';
import { generateFrontOutput, exportFrontSheets, templateSignature } from './front-output';
import { correctPokerTemplates, getTemplateSizeInfo } from './template-size';
import { CsvImporter, validateImportedFields, readDeck, importFields } from './csv-import';
import { cardsForOutput } from './deck-data';
import { createArtworkBoard, getArtworkBoard, listArtwork, resolveArtwork } from './artwork';
import { templatePlaceholder } from './template-placeholder';
import { DeckSession } from './deck-session';
import type { PageBinding } from './deck-session';
import { ImageTargets } from './image-targets';
import type { ImageTarget } from './image-targets';
import { forgeLegacyCards } from './legacy-output';
import { readSource, requireLocalSource, localSource, SOURCE_KEY } from './deck-source';
import { deckFingerprint } from './deck-fingerprint';
import { captureState, commitState, recoverState, requireRecovered, RECOVERY_KEY } from './deck-storage';
import { artworkThumbnail } from './artwork-thumbnail';
const deckSession = new DeckSession(penpot);
const imageTargets = new ImageTargets();
const csvImporter = new CsvImporter(penpot);
let pdfOperation: { id: string; context: PageBinding; fingerprint: string; deadline: number } | null = null;
let pdfSerial = 0;
let sheetRead: { context: PageBinding; state: string } | null = null;
function pdfFingerprint(): string {
    const page = penpot.currentPage;
    if (!page) return '';
    const templates = ('children' in page.root ? page.root.children : []).filter(shape => shape.type === 'board' && ['Front', 'Back', 'Artwork', '_Images'].includes(shape.name));
    const outputs = ['front-output-current', 'back-output-current', 'legacy-output-current'].map(key => page.getPluginData(key)).map(id => id ? page.getShapeById(id) : null);
    return JSON.stringify([deckFingerprint(page), templates.map(shape => templateSignature(shape as Board)), outputs.map(shape => shape?.type === 'board' ? [
        shape.id, templateSignature(shape), ['front-output-state', 'front-output-owner', 'front-output-request', 'front-output-template', 'cardforge-legacy-state', 'cardforge-legacy-owner'].map(key => shape.getPluginData(key)),
    ] : null)]);
}
function pdfLocked(): boolean {
    if (pdfOperation && Date.now() > pdfOperation.deadline) {
        const expired = pdfOperation; pdfOperation = null;
        sendUi({ type: 'PDF_EXPORT_ERROR', data: 'PDF export timed out. Download again.', requestId: expired.id }, expired.context);
    }
    return Boolean(pdfOperation);
}
function advanceSource(): void {
    csvImporter.invalidate(); sheetRead = null; imageTargets.clear(); deckSession.advance();
    sendUi({ type: 'SOURCE_CONTEXT', data: deckSession.context });
}
function sourceStatus(): void {
    const page = penpot.currentPage;
    if (!page) { sendUi({ type: 'SHEET_STATUS', data: { source: localSource(), recovery: false } }); return; }
    try { sendUi({ type: 'SHEET_STATUS', data: { source: readSource(page), recovery: Boolean(page.getPluginData(RECOVERY_KEY)), blocked: page.getPluginData(RECOVERY_KEY) ? 'Recover the interrupted import before changing this deck.' : undefined } }); }
    catch (error) { sendUi({ type: 'SHEET_STATUS', data: { source: localSource(), recovery: Boolean(page.getPluginData(RECOVERY_KEY)), blocked: error instanceof Error ? error.message : 'Saved connection is invalid.' } }); }
}
function healthyDeck(): void {
    const page = penpot.currentPage;
    if (!page) throw new Error('Open a deck page first.');
    requireRecovered(page); readSource(page);
}
function sendUi(message: PluginUIEvent, context = deckSession.context) {
    penpot.ui.sendMessage({ ...message, ...context });
}
function safeSettings(raw: string | undefined) {
    try { return raw ? JSON.parse(raw) : { type: 'fronts-single', paper: 'letter', cutMarks: false }; }
    catch { return { type: 'fronts-single', paper: 'letter', cutMarks: false }; }
}
function loadPage() {
    sendUi({ type: 'THEME_CHANGED', data: penpot.theme });
    sendUi({ type: 'PAGE_CONTEXT', data: deckSession.context });
    sourceStatus();
    try { loadCardsData(); }
    catch (error) { sendUi({ type: 'DECK_ERROR', data: error instanceof Error ? error.message : 'Saved cards could not be read. Recover the interrupted import.' }); }
    loadCardFields();
    sendUi({ type: 'TEMPLATE_SIZE', data: getTemplateSizeInfo(penpot.currentPage) });
    sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
    handleIsPageEmpty();
    const settings = penpot.currentPage?.getPluginData('outputSettings');
    sendUi({ type: 'OUTPUT_SETTINGS', data: safeSettings(settings) });
}
penpot.on('pagechange', () => {
    deckSession.changePage();
    csvImporter.invalidate(); sheetRead = null; pdfOperation = null;
    imageTargets.clear();
    loadPage();
});
penpot.on('themechange', theme => sendUi({ type: 'THEME_CHANGED', data: theme }));






let front: Board;
let back: Board;

penpot.ui.open("Card Deck Press", "", {
    width: 840,
    height: 650,
});


function loadCardsData() {
    const cards = penpot.currentPage ? readDeck(penpot.currentPage) : [];
    sendUi({ type: 'CARDS_DATA', data: JSON.stringify(cards), rowIds: deckSession.loadRows(cards.length) });
}


function isValidField(shape: Shape) {
    return (shape.name?.startsWith("#") &&
        ((shape.type == "text") ||
            ((shape.type == "rectangle") &&
                (shape.fills?.length) == 1 &&
                (shape["fills"][0]["fillImage"]))));
}


function findFields(board: Board, fields: CardField[]) {
    for (let i = 0; i < board.children.length; i++) {
        let child = board.children[i];
        if (isValidField(child)) {
            let type = (child["type"] == "text") ? "text" : "image";
            fields.push({ "name": child["name"], "type": type, "id": child.id });
        }
        if (child.hasOwnProperty("children")) {
            findFields((child as Board), fields);
        }
    }
    return fields;
}


function loadCardFields() {
    const root: Board = (penpot.currentPage?.getShapeById("00000000-0000-0000-0000-000000000000") as Board);
    const card = root?.children.find(shape => shape.type === 'board' && shape.name === 'Front') as Board | undefined;

    const fields = card ? findFields(card, []).filter((field, index, all) => all.findIndex(item => item.name === field.name) === index) : [];

    sendUi({ "type": "CARD_FIELDS", "data": { fields } });
    loadArtwork();
}

function loadArtwork() {
    sendUi({ type: 'ARTWORK_LIST', data: penpot.currentPage ? listArtwork(penpot.currentPage) : [] });
}

function selectArtwork(value: unknown) {
    let target: ImageTarget | undefined;
    try {
        if (!value || typeof value !== 'object') throw new Error('Choose an Artwork image.');
        const input = value as Record<string, unknown>;
        if (typeof input.rowId !== 'string' || typeof input.name !== 'string' || typeof input.uploadId !== 'string' || typeof input.value !== 'string') {
            throw new Error('Choose an Artwork image.');
        }
        target = { rowId: input.rowId, name: input.name, uploadId: input.uploadId };
        if (!deckSession.hasRow(target.rowId)) throw new Error('This card was removed.');
        imageTargets.start(target);
        const page = penpot.currentPage;
        if (!page || !importFields(page).some(field => field.name === target!.name && field.type === 'image')) {
            throw new Error('The template image field changed. Reopen the plugin and choose the image again.');
        }
        const reference = resolveArtwork(listArtwork(page), input.value);
        loadArtwork();
        sendUi({ type: 'ARTWORK_SELECTED', data: { ...target, reference } });
    } catch (error) {
        sendUi({ type: 'IMAGE_ERROR', data: { ...target, message: error instanceof Error ? error.message : 'Could not choose Artwork.' } });
    } finally { if (target) imageTargets.finish(target); }
}

async function createDeck(message: DeckEvent) {
    if (penpot.currentPage) {
        const { width, height } = resolveDeckSize(message.size, message.orientation, message.data);
        const context = { ...deckSession.context };
        const media = await penpot.uploadMediaData('Card Deck Press image placeholder.png', templatePlaceholder, 'image/png');
        if (!deckSession.matches(context)) throw new Error('The page changed. Return to an empty page and create the deck again.');
        const pageRoot = penpot.currentPage.root;
        if ('children' in pageRoot && pageRoot.children.length) throw new Error('The page must still be empty to create a deck.');
        const previousName = penpot.currentPage.name;
        const created: Board[] = [];
        try {
            penpot.currentPage.name = message.name;

            created.push(createArtworkBoard(penpot));


            front = penpot.createBoard();
            created.push(front);
            front.name = "Front";

            const inside = penpot.createBoard();
            inside.name = "inside";
            inside.borderRadius = 50;

            inside.strokes = [
                {
                    strokeColor: '#000000',
                    strokeStyle: 'solid',
                    strokeWidth: 12,
                    strokeAlignment: 'inner',
                },
            ];

            front.resize(width, height);
            inside.resize(width, height);
            inside.x = 0;
            inside.y = 0;

            front.appendChild(inside);

            back = (front.clone() as Board);
            created.push(back);
            back.name = "Back";
            back.x += front.width + 100;

            const title = penpot.createText('Card title');
            if (!title) throw new Error('Could not create the title placeholder.');
            title.name = '#title'; title.fontSize = String(Math.min(width, height) * 0.06);
            title.growType = 'auto-height'; title.fills = [{ fillColor: '#173d33', fillOpacity: 1 }];
            inside.appendChild(title); title.resize(width * 0.84, height * 0.1);
            title.x = front.x + width * 0.08; title.y = front.y + height * 0.08;

            const image = penpot.createRectangle(); image.name = '#image';
            image.fills = [{ fillImage: media, fillOpacity: 1 }];
            inside.appendChild(image); image.resize(width * 0.84, height * 0.6);
            image.x = front.x + width * 0.08; image.y = front.y + height * 0.25;

            const backInside = back.children.find(shape => shape.name === 'inside') as Board;
            const backImage = image.clone(); backImage.name = 'Image';
            backInside.appendChild(backImage);
            backImage.x = back.x + width * 0.08; backImage.y = back.y + height * 0.25;

            penpot.closePlugin();
        } catch (error) {
            for (const board of created.reverse()) board.remove();
            penpot.currentPage.name = previousName;
            throw error;
        }
    }
}


let creatingDeck = false;
async function handleCreateDeck(message: DeckEvent) {
    if (creatingDeck) return;
    const root: Board = (penpot.currentPage?.getShapeById("00000000-0000-0000-0000-000000000000") as Board);
    if (root && root.children.length == 0) {
        creatingDeck = true;
        try { await createDeck(message); }
        catch (error) { sendUi({ type: 'DECK_SIZE_ERROR', data: error instanceof Error ? error.message : 'Could not create the deck.' }); }
        finally { creatingDeck = false; }
    } else {
        sendUi({ "type": "ERROR_DECK_CREATE_PAGE_NOT_EMPTY", data: null });
    }
}

function handleIsPageEmpty() {
    const root: Board = (penpot.currentPage?.getShapeById("00000000-0000-0000-0000-000000000000") as Board);
    sendUi({ "type": "PAGE_EMPTY", "data": (root?.children.length === 0) });
}



async function createImage(value: unknown, context: PageBinding) {
    let target: ImageTarget | undefined;
    try {
        if (!value || typeof value !== 'object') throw new Error('Choose an image for this card.');
        const input = value as Record<string, unknown>;
        if (typeof input.rowId !== 'string' || typeof input.name !== 'string' || typeof input.uploadId !== 'string' ||
            typeof input.filename !== 'string' || typeof input.mimeType !== 'string' || !input.mimeType.startsWith('image/') || !(input.data instanceof Uint8Array)) {
            throw new Error('Choose an image for this card.');
        }
        if (input.data.byteLength > 32 * 1024 * 1024) throw new Error('Choose an image smaller than 32 MiB.');
        target = { rowId: input.rowId, name: input.name, uploadId: input.uploadId };
        if (!deckSession.hasRow(target.rowId)) throw new Error('This card was removed.');
        imageTargets.start(target);
        const media = await penpot.uploadMediaData(input.filename, input.data, input.mimeType);
        if (!deckSession.matches(context) || !deckSession.hasRow(target.rowId) || !imageTargets.matches(target)) return;
        if (!penpot.currentPage || !importFields(penpot.currentPage).some(field => field.name === target!.name && field.type === 'image')) {
            throw new Error('The template image field changed. Reopen the plugin and choose the image again.');
        }
        requireLocalSource(penpot.currentPage);
        healthyDeck();
        const board = getArtworkBoard(penpot);
        const shape = penpot.createRectangle();
        try {
            shape.resize(media.width, media.height);
            shape.fills = [{ fillOpacity: 1, fillImage: media }];
            shape.name = input.filename || target.name;
            board.appendChild(shape);
            shape.x = board.x + (board.children.length - 1) * 300;
            shape.y = board.y;
            loadArtwork();
            sendUi({ type: 'IMAGE_CREATED', data: { ...target, id: media.id, imageId: shape.id } }, context);
        } catch (error) { shape.remove(); throw error; }
    } catch (error) {
        if (deckSession.matches(context)) sendUi({ type: 'IMAGE_ERROR', data: { ...target, message: error instanceof Error ? error.message : 'Image upload failed.' } }, context);
    } finally { if (target) imageTargets.finish(target); }
}


async function uploadArtwork(value: unknown, context: PageBinding) {
    let uploaded = 0;
    try {
        if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Choose between 1 and 100 artwork files.');
        const files = value as { name: string; mimeType: string; data: Uint8Array }[];
        if (files.some(file => !file || typeof file.name !== 'string' || !file.mimeType?.startsWith('image/') || !(file.data instanceof Uint8Array))) throw new Error('Choose image files for artwork.');
        if (files.reduce((sum, file) => sum + file.data.byteLength, 0) > 32 * 1024 * 1024) throw new Error('Upload at most 32 MiB of artwork at a time.');
        const page = penpot.currentPage;
        if (!page) throw new Error('Open a deck page first.');
        const board = getArtworkBoard(penpot);
        for (const file of files) {
            const media = await penpot.uploadMediaData(file.name, file.data, file.mimeType);
            if (!deckSession.matches(context) || !penpot.currentPage?.getShapeById(board.id)) throw new Error('The deck changed. Return to the deck before uploading more artwork.');
            const shape = penpot.createRectangle();
            shape.name = file.name; shape.resize(media.width, media.height);
            shape.fills = [{ fillImage: media, fillOpacity: 1 }];
            const offset = board.children.reduce((right, child) => Math.max(right, child.x + child.width - board.x), 0);
            board.appendChild(shape); shape.x = board.x + offset + 40; shape.y = board.y;
            uploaded++;
            sendUi({ type: 'ARTWORK_PROGRESS', data: { uploaded, total: files.length } }, context);
        }
        loadArtwork();
        sendUi({ type: 'ARTWORK_READY', data: { uploaded } }, context);
    } catch (error) {
        if (deckSession.matches(context)) loadArtwork();
        sendUi({ type: 'CSV_ERROR', data: { message: `${uploaded} images uploaded. ${error instanceof Error ? error.message : 'Artwork upload failed.'}` } }, context);
    }
}


penpot.ui.onMessage((message: PluginUIEvent) => {
    if (message.type === 'load-page') {
        if (deckSession.context.pageId !== (penpot.currentPage?.id ?? null)) deckSession.changePage();
        loadPage(); return;
    }
    if (message.type === 'artwork-thumbnail') {
        const context = deckSession.context;
        const page = penpot.currentPage;
        try {
            deckSession.require(message);
            if (!page || typeof message.requestId !== 'string') throw new Error('Open the deck page to load artwork previews.');
            void artworkThumbnail(page, message.data).then(data => {
                if (deckSession.matches(context)) sendUi({ type: 'ARTWORK_THUMBNAIL', data, requestId: message.requestId }, context);
            }).catch(error => {
                if (deckSession.matches(context)) sendUi({ type: 'ARTWORK_THUMBNAIL_ERROR', data: error instanceof Error ? error.message : 'Artwork preview unavailable.', requestId: message.requestId }, context);
            });
        } catch (error) {
            sendUi({ type: 'ARTWORK_THUMBNAIL_ERROR', data: error instanceof Error ? error.message : 'Artwork preview unavailable.', requestId: message.requestId }, context);
        }
        return;
    }
    const mutating = ['create-deck', 'save-cards-data', 'create-image-data', 'select-artwork', 'upload-artwork', 'forge-cards', 'export-front-pdf', 'correct-poker-size', 'csv-preview', 'csv-apply', 'csv-restore', 'csv-export', 'sheet-begin', 'sheet-disconnect', 'source-recover', 'import-cancel', 'pdf-check'];
    if (mutating.includes(message.type)) {
        try {
            deckSession.require(message);
            if (!['sheet-disconnect', 'source-recover', 'import-cancel', 'pdf-check', 'csv-export'].includes(message.type)) healthyDeck();
            if (['save-cards-data', 'create-image-data', 'select-artwork', 'csv-restore'].includes(message.type)) {
                if (message.type !== 'csv-restore') requireLocalSource(penpot.currentPage!);
            }
        }
        catch (error) {
            const type = message.type.startsWith('csv-') || message.type === 'upload-artwork' || message.type.startsWith('sheet-') || message.type === 'source-recover' || message.type === 'import-cancel' ? 'CSV_ERROR' : ['export-front-pdf', 'pdf-check'].includes(message.type) ? 'PDF_EXPORT_ERROR' : message.type === 'forge-cards' ? 'FORGE_ERROR' : 'DECK_ERROR';
            const text = error instanceof Error ? error.message : 'The active deck changed.';
            if (['save-cards-data', 'forge-cards'].includes(message.type)) { try { loadCardsData(); } catch { /* Invalid stored rows remain blocked by source status. */ } }
            sourceStatus();
            sendUi({ type, data: type === 'CSV_ERROR' ? { message: text } : text, requestId: message.requestId });
            return;
        }
    }


    if (message.type === 'sheet-status') { sourceStatus();
    } else if (message.type === 'pdf-finish') {
        if (pdfOperation?.id === message.requestId && deckSession.matches(message)) pdfOperation = null;
    } else if (message.type === 'pdf-check') {
        const operation = pdfOperation;
        if (pdfLocked() && operation && operation.id === message.requestId && deckSession.matches(operation.context) && operation.fingerprint === pdfFingerprint()) {
            sendUi({ type: 'PDF_CHECKED', data: null, requestId: message.requestId });
        } else {
            if (operation?.id === message.requestId) pdfOperation = null;
            sendUi({ type: 'PDF_EXPORT_ERROR', data: 'The deck changed during export. Generate again before downloading.', requestId: message.requestId });
        }
    } else if (['sheet-begin', 'sheet-disconnect', 'source-recover', 'import-cancel'].includes(message.type)) {
        try {
            if (pdfLocked()) throw new Error('Wait for the PDF download to finish.');
            if (message.type === 'sheet-disconnect') {
                const page = penpot.currentPage!; requireRecovered(page);
                let revision = 0;
                try { revision = readSource(page).revision + 1; } catch { revision = 1; }
                commitState(page, { ...captureState(page), [SOURCE_KEY]: JSON.stringify(localSource(revision)) });
            } else if (message.type === 'source-recover') recoverState(penpot.currentPage!);
            advanceSource();
            if (message.type === 'sheet-begin') {
                sheetRead = { context: deckSession.context, state: JSON.stringify(captureState(penpot.currentPage!)) };
                sendUi({ type: 'SHEET_STARTED', data: { requestId: message.data?.requestId } });
            }
            else if (message.type !== 'import-cancel') loadCardsData();
            sourceStatus(); sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
        } catch (error) { sendUi({ type: 'CSV_ERROR', data: { message: error instanceof Error ? error.message : 'Could not update the deck connection.' } }); sourceStatus(); }
    } else if (message.type === "create-deck") {
        handleCreateDeck((message as DeckEvent));
    } else if (['csv-preview', 'csv-apply', 'csv-restore', 'csv-export', 'csv-status'].includes(message.type)) {
        try {
            if (pdfLocked() && message.type !== 'csv-status') throw new Error('Wait for the PDF download to finish.');
            if (message.type === 'csv-preview') {
                if (message.data?.sheet && (!sheetRead || !deckSession.matches(sheetRead.context) || sheetRead.state !== JSON.stringify(captureState(penpot.currentPage!)))) {
                    csvImporter.invalidate();
                    throw new Error('The deck connection or cards changed while the sheet was loading. Pull Latest again.');
                }
                sendUi({ type: 'CSV_PREVIEW', data: csvImporter.preview(message.data) });
            }
            else if (message.type === 'csv-export') sendUi({ type: 'CSV_EXPORT', data: csvImporter.export(message.data?.spreadsheetSafe === true) });
            else if (message.type === 'csv-status') sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
            else {
                const cards = message.type === 'csv-apply' ? csvImporter.apply(message.data) : csvImporter.restore(message.data);
                advanceSource();
                sendUi({ type: 'CSV_APPLIED', data: cards, rowIds: deckSession.replaceRows(cards.length), changes: csvImporter.lastChange });
                sourceStatus();
                imageTargets.clear();
                loadCardFields();
                sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
                const settings = penpot.currentPage?.getPluginData('outputSettings');
                if (settings) sendUi({ type: 'OUTPUT_SETTINGS', data: safeSettings(settings) });
            }
        } catch (error) {
            sourceStatus();
            if (message.type === 'csv-restore') sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
            sendUi({ type: 'CSV_ERROR', data: { revision: message.data?.revision, message: error instanceof Error ? error.message : 'CSV operation failed.' } });
        }
    } else if (message.type === 'upload-artwork') {
        void uploadArtwork(message.data, deckSession.context);
    } else if (message.type === "save-cards-data") {
        try {
            if (typeof message.data !== 'string') throw new Error('Card data is invalid.');
            const cards: unknown = JSON.parse(message.data);
            if (!Array.isArray(cards) || cards.some(card => !card || typeof card !== 'object' || Array.isArray(card) || Object.values(card).some(value => typeof value !== 'string'))) throw new Error('Card data is invalid.');
            const rows = deckSession.validateRows(message.rowIds, cards);
            penpot.currentPage?.setPluginData('cardsData', JSON.stringify(message.data));
            penpot.currentPage?.setPluginData('csv-output-stale', 'true');
            deckSession.setRows(rows);
            imageTargets.retainRows(rows);
        } catch (error) { sendUi({ type: 'DECK_ERROR', data: error instanceof Error ? error.message : 'Could not save the cards.' }); }
    } else if (message.type === "load-cards-data") {
        loadCardsData();
    } else if (message.type === "load-card-fields") {
        loadCardFields();
    } else if (message.type === "create-image-data") {
        void createImage(message.data, deckSession.context);
    } else if (message.type === 'select-artwork') {
        selectArtwork(message.data);
    } else if (message.type === 'load-artwork') {
        loadArtwork();
    } else if (message.type === "forge-cards") {
        try {
            if (pdfLocked()) throw new Error('Wait for the PDF download to finish.');
            const request = parseForgeRequest(message.data);
            if (penpot.currentPage && readSource(penpot.currentPage).mode === 'google-sheet' && JSON.stringify(request.cardsData) !== JSON.stringify(readDeck(penpot.currentPage))) throw new Error('The linked deck changed. Pull Latest or reload the card list before generating.');
            const outputCards = cardsForOutput(request.cardsData, request.type);
            if (penpot.currentPage && !request.type.startsWith('backs-')) validateImportedFields(penpot.currentPage, outputCards);
            if (isFaceMode(request.type)) {
                const output = generateFrontOutput(penpot, outputCards, request.type, request.paper, request.cutMarks, request.cardsData);
                penpot.currentPage?.setPluginData('outputSettings', JSON.stringify({ type: request.type, paper: request.paper, cutMarks: request.cutMarks }));
                sendUi({ type: 'FRONT_OUTPUT_READY', data: { sheets: output.children.length } });
            } else {
                const output = forgeLegacyCards(penpot, outputCards, request.type, request.cutMarks, request);
                penpot.currentPage?.setPluginData('outputSettings', JSON.stringify({ type: request.type, paper: request.paper, cutMarks: request.cutMarks }));
                if (request.type === 'printplay') sendUi({ type: 'FRONT_OUTPUT_READY', data: { sheets: output.children.length } });
                else sendUi({ type: 'OUTPUT_READY', data: null });
            }
            penpot.currentPage?.setPluginData('csv-output-stale', 'false');
            if (penpot.currentPage?.getPluginData('csv-import-metadata')) sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
        } catch (error) {
            sourceStatus();
            try { loadCardsData(); } catch { /* Invalid stored rows remain blocked by source status. */ }
            sendUi({ type: 'FORGE_ERROR', data: error instanceof Error ? error.message : 'Generation failed. Check your template and try again.' });
        }
    } else if (message.type === 'export-front-pdf') {
        const context = deckSession.context;
        const requestId = message.requestId;
        if (pdfLocked()) { sendUi({ type: 'PDF_EXPORT_ERROR', data: 'Wait for the previous PDF render to finish.', requestId }, context); return; }
        const operation = { id: requestId ?? `pdf-${++pdfSerial}`, context, fingerprint: pdfFingerprint(), deadline: Date.now() + 120_000 };
        pdfOperation = operation;
        // Bounded cleanup in real controllers; fixtures without timers still check the deadline on every action.
        if (typeof setTimeout === 'function') setTimeout(() => {
            if (pdfOperation === operation) { pdfOperation = null; sendUi({ type: 'PDF_EXPORT_ERROR', data: 'PDF export timed out. Download again.', requestId: operation.id }, context); }
        }, 120_000);
        exportFrontSheets(penpot, message.data, () => pdfOperation === operation && deckSession.matches(context) && Date.now() <= operation.deadline, data => sendUi({ type: 'PDF_EXPORT_PROGRESS', data, requestId }, context))
            .then(data => {
                if (pdfOperation !== operation || !deckSession.matches(context)) throw new Error('The deck changed during export. Forge again before downloading.');
                sendUi({ type: 'FRONT_PDF_IMAGES', data, requestId }, context);
            })
            .catch(error => {
                if (pdfOperation === operation) pdfOperation = null;
                sendUi({ type: 'PDF_EXPORT_ERROR', data: error instanceof Error ? error.message : 'PDF export failed. Try again.', requestId }, context);
            });
    } else if (message.type === 'load-template-size') {
        sendUi({ type: 'TEMPLATE_SIZE', data: getTemplateSizeInfo(penpot.currentPage) });
    } else if (message.type === 'correct-poker-size') {
        try {
            if (pdfLocked()) throw new Error('Wait for the PDF download to finish.');
            sendUi({ type: 'POKER_SIZE_CORRECTED', data: correctPokerTemplates(penpot) });
        } catch (error) {
            sendUi({ type: 'TEMPLATE_SIZE_ERROR', data: error instanceof Error ? error.message : 'Size correction failed.' });
        }
    } else if (message.type === "load-output-settings") {
        const settings = penpot.currentPage?.getPluginData('outputSettings');
        if (settings) {
            try { sendUi({ type: 'OUTPUT_SETTINGS', data: JSON.parse(settings) }); }
            catch { console.warn('Saved output settings could not be read; using defaults.'); }
        }
    } else if (message.type === "is-page-empty") {
        handleIsPageEmpty();
    }


});
