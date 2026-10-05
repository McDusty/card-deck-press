
import { resolveDeckSize } from './card-sizes';
import { Shape, Board } from '@penpot/plugin-types';
import type { PluginUIEvent, DeckEvent, CardField } from './model';
import { isFaceMode, parseForgeRequest } from './output-options';
import { generateFrontOutput, exportFrontSheets } from './front-output';
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
const deckSession = new DeckSession(penpot);
const imageTargets = new ImageTargets();
const csvImporter = new CsvImporter(penpot);
let pdfExporting = false;
function sendUi(message: PluginUIEvent, context = deckSession.context) {
    penpot.ui.sendMessage({ ...message, ...context });
}
function loadPage() {
    sendUi({ type: 'THEME_CHANGED', data: penpot.theme });
    sendUi({ type: 'PAGE_CONTEXT', data: deckSession.context });
    loadCardsData();
    loadCardFields();
    sendUi({ type: 'TEMPLATE_SIZE', data: getTemplateSizeInfo(penpot.currentPage) });
    sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
    handleIsPageEmpty();
    const settings = penpot.currentPage?.getPluginData('outputSettings');
    sendUi({ type: 'OUTPUT_SETTINGS', data: settings ? JSON.parse(settings) : { type: 'fronts-single', paper: 'letter', cutMarks: true } });
}
penpot.on('pagechange', () => {
    deckSession.changePage();
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

    const assetsUrl = "https://design.penpot.app/assets/by-file-media-id/";
    sendUi({ "type": "CARD_FIELDS", "data": { fields: fields, assetsUrl: assetsUrl } });
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
    const mutating = ['create-deck', 'save-cards-data', 'create-image-data', 'select-artwork', 'upload-artwork', 'forge-cards', 'export-front-pdf', 'correct-poker-size', 'csv-preview', 'csv-apply', 'csv-restore', 'csv-export'];
    if (mutating.includes(message.type)) {
        try { deckSession.require(message); }
        catch (error) {
            const type = message.type.startsWith('csv-') || message.type === 'upload-artwork' ? 'CSV_ERROR' : message.type === 'export-front-pdf' ? 'PDF_EXPORT_ERROR' : 'DECK_ERROR';
            const text = error instanceof Error ? error.message : 'The active deck changed.';
            sendUi({ type, data: type === 'CSV_ERROR' ? { message: text } : text, requestId: message.requestId });
            return;
        }
    }


    if (message.type === "create-deck") {
        handleCreateDeck((message as DeckEvent));
    } else if (['csv-preview', 'csv-apply', 'csv-restore', 'csv-export', 'csv-status'].includes(message.type)) {
        try {
            if (pdfExporting && message.type !== 'csv-status') throw new Error('Wait for the PDF download to finish.');
            if (message.type === 'csv-preview') sendUi({ type: 'CSV_PREVIEW', data: csvImporter.preview(message.data) });
            else if (message.type === 'csv-export') sendUi({ type: 'CSV_EXPORT', data: csvImporter.export(message.data?.spreadsheetSafe === true) });
            else if (message.type === 'csv-status') sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
            else {
                const cards = message.type === 'csv-apply' ? csvImporter.apply(message.data) : csvImporter.restore();
                sendUi({ type: 'CSV_APPLIED', data: cards, rowIds: deckSession.replaceRows(cards.length) });
                imageTargets.clear();
                loadCardFields();
                sendUi({ type: 'CSV_STATUS', data: csvImporter.status() });
                const settings = penpot.currentPage?.getPluginData('outputSettings');
                if (settings) sendUi({ type: 'OUTPUT_SETTINGS', data: JSON.parse(settings) });
            }
        } catch (error) {
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
            if (pdfExporting) throw new Error('Wait for the PDF download to finish.');
            const request = parseForgeRequest(message.data);
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
            sendUi({ type: 'FORGE_ERROR', data: error instanceof Error ? error.message : 'Generation failed. Check your template and try again.' });
        }
    } else if (message.type === 'export-front-pdf') {
        const context = deckSession.context;
        const requestId = message.requestId;
        if (pdfExporting) { sendUi({ type: 'PDF_EXPORT_ERROR', data: 'Wait for the previous PDF render to finish.', requestId }, context); return; }
        pdfExporting = true;
        exportFrontSheets(penpot, message.data, () => deckSession.matches(context), data => sendUi({ type: 'PDF_EXPORT_PROGRESS', data, requestId }, context))
            .then(data => sendUi({ type: 'FRONT_PDF_IMAGES', data, requestId }, context))
            .catch(error => sendUi({ type: 'PDF_EXPORT_ERROR', data: error instanceof Error ? error.message : 'PDF export failed. Try again.', requestId }, context))
            .finally(() => { pdfExporting = false; });
    } else if (message.type === 'load-template-size') {
        sendUi({ type: 'TEMPLATE_SIZE', data: getTemplateSizeInfo(penpot.currentPage) });
    } else if (message.type === 'correct-poker-size') {
        try {
            if (pdfExporting) throw new Error('Wait for the PDF download to finish.');
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
