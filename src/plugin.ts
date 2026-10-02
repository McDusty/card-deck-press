
import { resolveDeckSize } from './card-sizes';
import { Shape, Board } from '@penpot/plugin-types';
import type { PluginUIEvent, DeckEvent, CardField } from './model';
import { isFaceMode, isSheetMode, parseForgeRequest } from './output-options';
import type { CardRecord } from './output-options';
import { generateFrontOutput, exportFrontSheets } from './front-output';
import { correctPokerTemplates, getTemplateSizeInfo } from './template-size';
import { CsvImporter, validateImportedFields } from './csv-import';
import { cardsForOutput } from './deck-data';
import { createArtworkBoard, getArtworkBoard } from './artwork';
const csvImporter = new CsvImporter(penpot);
let pdfExporting = false;





let front: Board;
let back: Board;

penpot.ui.open("CardForge", "", {
    width: 1200,
    height: 650,
});


function loadCardsData() {
    let data = penpot.currentPage?.getPluginData("cardsData");
    console.log("loaded cards data:", data);
    if (data) {
        penpot.ui.sendMessage({ "type": "CARDS_DATA", "data": JSON.parse(data) });
    }
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
    const card = (findByName(root, "Front") as Board);

    const fields = card ? findFields(card, []) : [];

    const assetsUrl = "https://design.penpot.app/assets/by-file-media-id/";
    penpot.ui.sendMessage({ "type": "CARD_FIELDS", "data": { fields: fields, assetsUrl: assetsUrl } });
}


// see findShapes
function findByName(parent: Board, name: string): Shape | undefined {
    for (let i = 0; i < parent.children.length; i++) {
        let child = parent.children[i];
        if ((child.hasOwnProperty("name")) && (child["name"] === name)) {
            return child;
        } if ((child as Board).children?.length > 0) {
            let inner = findByName((child as Board), name);
            if (inner) {
                return inner;
            }
        }
    }
    return undefined;
}



function createDeck(message: DeckEvent) {
    if (penpot.currentPage) {
        const { width, height } = resolveDeckSize(message.size, message.orientation, message.data);
        penpot.currentPage.name = message.name;

        createArtworkBoard(penpot);


        front = penpot.createBoard();
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
        back.name = "Back";
        back.x += front.width + 100;

        penpot.closePlugin();
    }
}


function handleCreateDeck(message: DeckEvent) {
    const root: Board = (penpot.currentPage?.getShapeById("00000000-0000-0000-0000-000000000000") as Board);
    if (root.children.length == 0) {
        try { createDeck(message); }
        catch (error) { penpot.ui.sendMessage({ type: 'DECK_SIZE_ERROR', data: error instanceof Error ? error.message : 'Could not create the deck.' }); }
    } else {
        penpot.ui.sendMessage({ "type": "ERROR_DECK_CREATE_PAGE_NOT_EMPTY" });
    }
}

function handleIsPageEmpty() {
    const root: Board = (penpot.currentPage?.getShapeById("00000000-0000-0000-0000-000000000000") as Board);
    penpot.ui.sendMessage({ "type": "PAGE_EMPTY", "data": (root.children.length == 0) });
}



function createImage(data: Uint8Array, mimeType: string, num: number, name: string, filename: string) {
    penpot
        .uploadMediaData('image', data, mimeType)
        .then((data) => {
            const shape = penpot.createRectangle();
            shape.resize(data.width, data.height);
            shape.fills = [{ fillOpacity: 1, fillImage: data }];
            shape.x = 0;
            shape.y = 0;

            const images = getArtworkBoard(penpot);
            shape.name = filename || name;
            images.appendChild(shape);
            shape.x = images.x + (images.children.length - 1) * 300;
            shape.y = images.y;
            penpot.ui.sendMessage({ "type": "IMAGE_CREATED", "data": { "num": num, "name": name, "id": shape.fills[0].fillImage?.id, "imageId": shape.id } });
        })
        .catch((err) => console.error(err));
}


function cloneCard(card: Shape, cardData: Record<string, any>, cardNum: string): Board {
    const card2 = card.clone() as Board;
    card2.name = "card" + cardNum.padStart(2, '0');

    for (const prop in cardData) {
        if (Object.prototype.hasOwnProperty.call(cardData, prop)) {
            const field = findByName(card2, prop);
            if (field) {
                if (field.type === "text") {
                    field.characters = cardData[prop];
                } else {
                    const imageId = cardData[prop].split("|")[0];
                    const image = penpot.currentPage?.getShapeById(imageId);
                    if (!cardData[prop]) field.fills = [];
                    else if (image && image.fills !== 'mixed') {
                        const fillImage = image.fills.find(fill => fill.fillImage)?.fillImage;
                        field.fills = fillImage ? [{ ...(Array.isArray(field.fills) ? field.fills[0] : {}), fillImage }] : [];
                    }
                }
            }
        }
    }

    return card2;
}


function addCard(output: Board, card: Board, x: number, y: number) {
    card.x = x;
    card.y = y;

    output.appendChild(card);

    x += card.width;
    if ((x + card.width) > output.width) {
        x = output.x;
        y += card.height;
    }
    return [x, y];
}


function addCutMarks(board: Board, clone = true) {
    let cutMBoard = penpot.createBoard();
    cutMBoard.name = "cutMBoard";
    cutMBoard.resize(board.width + 200, board.height + 200);

    let rect = penpot.createRectangle();
    rect.resize(200, 2);
    rect.x = 0;
    rect.y = 98;
    cutMBoard.appendChild(rect);

    rect = penpot.createRectangle();
    rect.resize(200, 2);
    rect.x = cutMBoard.width - 200;
    rect.y = 98;
    cutMBoard.appendChild(rect);

    rect = penpot.createRectangle();
    rect.resize(200, 2);
    rect.x = 0;
    rect.y = cutMBoard.height - 100;
    cutMBoard.appendChild(rect);

    rect = penpot.createRectangle();
    rect.resize(200, 2);
    rect.x = cutMBoard.width - 200;
    rect.y = cutMBoard.height - 100;
    cutMBoard.appendChild(rect);


    rect = penpot.createRectangle();
    rect.resize(2, 200);
    rect.x = 98;
    rect.y = 0;
    cutMBoard.appendChild(rect);

    rect = penpot.createRectangle();
    rect.resize(2, 200);
    rect.x = cutMBoard.width - 100;
    rect.y = 0;
    cutMBoard.appendChild(rect);

    rect = penpot.createRectangle();
    rect.resize(2, 200);
    rect.x = 98;
    rect.y = cutMBoard.height - 200;
    cutMBoard.appendChild(rect);

    rect = penpot.createRectangle();
    rect.resize(2, 200);
    rect.x = cutMBoard.width - 100;
    rect.y = cutMBoard.height - 200;
    cutMBoard.appendChild(rect);

    if (clone) {
        board = (board.clone() as Board);
    }
    board.x = 100;
    board.y = 100;
    cutMBoard.appendChild(board);

    return cutMBoard;
}

function countRectsFit(rectA: { width: number, height: number }, rectB: { width: number, height: number }): number {
    const countWidth = Math.floor(rectA.width / rectB.width);
    const countHeight = Math.floor(rectA.height / rectB.height);
    return countWidth * countHeight;
}

function forgeCards(cardsData: CardRecord[], type: string, cutMarks: boolean) {
    console.log("start forgecards", type, cutMarks);
    const page = penpot.currentPage;
    if (!page) throw new Error('Open a Penpot page first.');
    const frontTemplate = page.findShapes({ name: 'Front', type: 'board' })[0];
    const backTemplate = page.findShapes({ name: 'Back', type: 'board' })[0];
    if (!frontTemplate || !backTemplate) throw new Error('This layout needs Front and Back boards. Choose a Fronts only layout to omit backs.');
    if (type === 'printplay' && Math.max(
        countRectsFit({ width: 2480, height: 3508 }, { width: frontTemplate.width + (cutMarks ? 200 : 0), height: frontTemplate.height * 2 + (cutMarks ? 200 : 0) }),
        countRectsFit({ width: 3508, height: 2480 }, { width: frontTemplate.width + (cutMarks ? 200 : 0), height: frontTemplate.height * 2 + (cutMarks ? 200 : 0) })
    ) === 0) throw new Error('A front-and-back pair does not fit on A4. Choose a smaller template or another layout.');
    let shapes = penpot.currentPage?.findShapes({ name: "Output" })
    if (shapes && (shapes.length > 0)) {
        shapes[0].remove();
    }


    let baseFront = (penpot.currentPage?.findShapes({ name: "Front" })[0] as Board);
    let baseBack = (penpot.currentPage?.findShapes({ name: "Back" })[0] as Board);

    let card: Board;
    let output: Board;
    let tmpFront: Board | null = null;
    let tmpBack: Board | null = null;

    let x = baseFront.x;
    let y = baseFront.y + baseFront.height + 400;

    output = penpot.createBoard();
    output.name = "Output";
    output.x = x;
    output.y = y;

    if (type == "standard") {

        if (cutMarks) {
            tmpFront = addCutMarks(baseFront);
            tmpBack = addCutMarks(baseBack);

            baseFront = tmpFront;
            baseBack = tmpBack;
        }

        output.resize(baseFront.width * (cardsData.length + 1), baseFront.height);
    } else if (type == "tabletop") {
        output.resize(baseFront.width * 10, baseFront.height * 7);
    }

    if ((type == "tabletop") || (type == "standard")) {
        for (let i = 0; i < cardsData.length; i++) {
            card = cloneCard(baseFront, cardsData[i], String(i + 1));
            [x, y] = addCard(output, card, x, y);
        }

        card = (baseBack.clone() as Board);
        card.x = output.width - card.width;
        card.y = output.y + output.height - card.height;
        output.appendChild(card);
    } else if (type == "printplay") {
        tmpFront = penpot.createBoard();
        tmpFront.name = "tmpFront";
        tmpFront.resize(baseFront.width, baseFront.height * 2);
        let backClone = baseBack.clone();
        backClone.rotate(180);
        tmpFront.appendChild(backClone);
        backClone.x = 0;
        backClone.y = 0;
        let frontClone = baseFront.clone();
        tmpFront.appendChild(frontClone);
        frontClone.x = 0;
        frontClone.y = frontClone.height;
        if (cutMarks) {
            tmpFront = addCutMarks(tmpFront, false);
        }
        baseFront = tmpFront;


        // A4


        let page: Board;
        let cardsPerPage: number;
        let width: number;
        let height: number;
        let fitPortrait = countRectsFit({ width: 2480, height: 3508 }, { width: baseFront.width, height: baseFront.height });
        let fitLandscape = countRectsFit({ width: 3508, height: 2480 }, { width: baseFront.width, height: baseFront.height });

        console.log("fitPortrait ", fitPortrait);
        console.log("fitLandscape ", fitLandscape);

        if (fitPortrait >= fitLandscape) {
            width = 2480;
            height = 3508;
            cardsPerPage = fitPortrait;
        } else {
            width = 3508;
            height = 2480;
            cardsPerPage = fitLandscape;
        }

        let numPages = Math.ceil(cardsData.length / cardsPerPage);
        let numCard = 0;

        output.resize(width, (height + 100) * numPages);


        let cardsPerLine = Math.floor(width / baseFront.width);
        let linesPerPage = Math.floor(height / baseFront.height);
        let gapH = Math.floor((width - cardsPerLine * baseFront.width) / (cardsPerLine + 1));
        let gapV = Math.floor((height - linesPerPage * baseFront.height) / (linesPerPage + 1));

        for (let i = 0; i < numPages; i++) {
            page = penpot.createBoard();
            page.name = "Page " + String(i + 1).padStart(2, '0');
            page.resize(width, height);
            page.x = output.x;
            page.y = output.y + i * (height + 100);

            x = page.x + gapH;
            y = page.y;

            for (let j = 0; j < cardsPerPage; j++) {
                if (j % cardsPerLine == 0) {
                    y += gapV;
                }

                card = cloneCard(baseFront, cardsData[numCard], String(numCard + 1));
                [x, y] = addCard(page, card, x, y);
                x += gapH;
                numCard++;
                if (numCard >= cardsData.length) {
                    break;
                }
            }
            output.appendChild(page);

            console.log("page y " + page.y);
        }

    }

    tmpFront?.remove();
    tmpBack?.remove();

    penpot.closePlugin();
}


async function uploadArtwork(value: unknown) {
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
            if (penpot.currentPage?.id !== page.id) throw new Error('The active page changed. Return to the deck before uploading more artwork.');
            const shape = penpot.createRectangle();
            shape.name = file.name; shape.resize(media.width, media.height);
            shape.fills = [{ fillImage: media, fillOpacity: 1 }];
            const offset = board.children.reduce((right, child) => Math.max(right, child.x + child.width - board.x), 0);
            board.appendChild(shape); shape.x = board.x + offset + 40; shape.y = board.y;
            uploaded++;
            penpot.ui.sendMessage({ type: 'ARTWORK_PROGRESS', data: { uploaded, total: files.length } });
        }
        penpot.ui.sendMessage({ type: 'ARTWORK_READY', data: { uploaded } });
    } catch (error) {
        penpot.ui.sendMessage({ type: 'CSV_ERROR', data: { message: `${uploaded} images uploaded. ${error instanceof Error ? error.message : 'Artwork upload failed.'}` } });
    }
}


penpot.ui.onMessage((message: PluginUIEvent) => {
    console.log("[plugin] message: ");
    console.log(message);

    if (message.type === "create-deck") {
        handleCreateDeck((message as DeckEvent));
    } else if (['csv-preview', 'csv-apply', 'csv-restore', 'csv-export', 'csv-status'].includes(message.type)) {
        try {
            if (pdfExporting && message.type !== 'csv-status') throw new Error('Wait for the PDF download to finish.');
            if (message.type === 'csv-preview') penpot.ui.sendMessage({ type: 'CSV_PREVIEW', data: csvImporter.preview(message.data) });
            else if (message.type === 'csv-export') penpot.ui.sendMessage({ type: 'CSV_EXPORT', data: csvImporter.export() });
            else if (message.type === 'csv-status') penpot.ui.sendMessage({ type: 'CSV_STATUS', data: csvImporter.status() });
            else {
                const cards = message.type === 'csv-apply' ? csvImporter.apply(message.data) : csvImporter.restore();
                penpot.ui.sendMessage({ type: 'CSV_APPLIED', data: cards });
                loadCardFields();
                penpot.ui.sendMessage({ type: 'CSV_STATUS', data: csvImporter.status() });
                const settings = penpot.currentPage?.getPluginData('outputSettings');
                if (settings) penpot.ui.sendMessage({ type: 'OUTPUT_SETTINGS', data: JSON.parse(settings) });
            }
        } catch (error) {
            penpot.ui.sendMessage({ type: 'CSV_ERROR', data: { revision: message.data?.revision, message: error instanceof Error ? error.message : 'CSV operation failed.' } });
        }
    } else if (message.type === 'upload-artwork') {
        void uploadArtwork(message.data);
    } else if (message.type === "save-cards-data") {
        penpot.currentPage?.setPluginData("cardsData", JSON.stringify(message.data));
        penpot.currentPage?.setPluginData('csv-output-stale', 'true');
    } else if (message.type === "load-cards-data") {
        loadCardsData();
    } else if (message.type === "load-card-fields") {
        loadCardFields();
    } else if (message.type === "create-image-data") {
        const { data, mimeType, num, name } = message.data as {
            data: Uint8Array;
            mimeType: string;
            num: number;
            name: string;
        };
        createImage(data, mimeType, num, name, message.data.filename);
    } else if (message.type === "forge-cards") {
        try {
            if (pdfExporting) throw new Error('Wait for the PDF download to finish.');
            const request = parseForgeRequest(message.data);
            if (penpot.currentPage) validateImportedFields(penpot.currentPage, request.cardsData);
            const outputCards = cardsForOutput(request.cardsData, request.type);
            if (isFaceMode(request.type)) {
                const output = generateFrontOutput(penpot, outputCards, request.type, request.paper, request.cutMarks, request.cardsData);
                penpot.currentPage?.setPluginData('outputSettings', JSON.stringify({ type: request.type, paper: request.paper, cutMarks: request.cutMarks }));
                if (!isSheetMode(request.type)) penpot.closePlugin();
                else penpot.ui.sendMessage({ type: 'FRONT_OUTPUT_READY', data: { sheets: output.children.length } });
            } else {
                forgeCards(outputCards, request.type, request.cutMarks);
            }
            penpot.currentPage?.setPluginData('csv-output-stale', 'false');
            if (penpot.currentPage?.getPluginData('csv-import-metadata')) penpot.ui.sendMessage({ type: 'CSV_STATUS', data: csvImporter.status() });
        } catch (error) {
            penpot.ui.sendMessage({ type: 'FORGE_ERROR', data: error instanceof Error ? error.message : 'Generation failed. Check your template and try again.' });
        }
    } else if (message.type === 'export-front-pdf') {
        if (pdfExporting) return;
        pdfExporting = true;
        exportFrontSheets(penpot, message.data)
            .then(data => penpot.ui.sendMessage({ type: 'FRONT_PDF_IMAGES', data }))
            .catch(error => penpot.ui.sendMessage({ type: 'PDF_EXPORT_ERROR', data: error instanceof Error ? error.message : 'PDF export failed. Try again.' }))
            .finally(() => { pdfExporting = false; });
    } else if (message.type === 'load-template-size') {
        penpot.ui.sendMessage({ type: 'TEMPLATE_SIZE', data: getTemplateSizeInfo(penpot.currentPage) });
    } else if (message.type === 'correct-poker-size') {
        try {
            if (pdfExporting) throw new Error('Wait for the PDF download to finish.');
            penpot.ui.sendMessage({ type: 'POKER_SIZE_CORRECTED', data: correctPokerTemplates(penpot) });
        } catch (error) {
            penpot.ui.sendMessage({ type: 'TEMPLATE_SIZE_ERROR', data: error instanceof Error ? error.message : 'Size correction failed.' });
        }
    } else if (message.type === "load-output-settings") {
        const settings = penpot.currentPage?.getPluginData('outputSettings');
        if (settings) {
            try { penpot.ui.sendMessage({ type: 'OUTPUT_SETTINGS', data: JSON.parse(settings) }); }
            catch { console.warn('Saved output settings could not be read; using defaults.'); }
        }
    } else if (message.type === "is-page-empty") {
        handleIsPageEmpty();
    }


});
