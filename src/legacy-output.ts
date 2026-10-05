import type { Penpot, Page, Shape, Board } from '@penpot/plugin-types';
import type { CardRecord, LegacyMode } from './output-options';
import { getFrontTemplate, templateSignature } from './front-output';
import type { ForgeRequest } from './output-options';
import { cloneTracked } from './output-clone';

const OWNER = 'cardforge-legacy-owner', STATE = 'cardforge-legacy-state';
const CURRENT = 'legacy-output-current', CLEANUP = 'legacy-output-cleanup';

class LegacyBuild {
  readonly current: Board | null;
  private readonly created: Shape[] = [];
  private published = false;
  constructor(private readonly api: Penpot, private readonly page: Page, private readonly owner: string) {
    this.current = this.owned(page.getPluginData(CURRENT));
    const cleanup = page.getPluginData(CLEANUP);
    if (this.current && cleanup !== this.current.id) this.owned(cleanup)?.remove();
  }
  private owned(id: string): Board | null {
    const shape = id ? this.page.getShapeById(id) : null;
    return shape?.type === 'board' && shape.getPluginData(OWNER) === this.owner && shape.getPluginData(STATE) === 'complete' ? shape : null;
  }
  board(): Board { const shape = this.api.createBoard(); this.created.push(shape); return shape; }
  rectangle() { const shape = this.api.createRectangle(); this.created.push(shape); return shape; }
  clone(shape: Shape): Shape {
    return cloneTracked(this.page, shape, this.created);
  }
  publish(output: Board): void {
    const previous = this.page.getPluginData(CURRENT);
    const cleanup = this.page.getPluginData(CLEANUP);
    try {
      output.setPluginData(OWNER, this.owner);
      output.setPluginData(STATE, 'complete');
      this.page.setPluginData(CLEANUP, this.current?.id ?? '');
      this.page.setPluginData(CURRENT, output.id);
    } catch (error) {
      this.page.setPluginData(CURRENT, previous);
      this.page.setPluginData(CLEANUP, cleanup);
      throw error;
    }
    this.published = true;
    try {
      const position = this.current ? { x: this.current.x, y: this.current.y } : null;
      this.current?.remove();
      this.page.setPluginData(CLEANUP, '');
      if (position) { output.x = position.x; output.y = position.y; }
    } catch (error) { console.warn('Completed output retained; cleanup will retry next time.', error); }
  }
  rollback(): void {
    if (this.published) return;
    for (const shape of [...this.created].reverse()) if (this.page.getShapeById(shape.id)) shape.remove();
  }
}

function findByName(parent: Board, name: string): Shape | undefined {
  for (const child of parent.children) {
    if (child.name === name) return child;
    if ('children' in child) { const found = findByName(child as Board, name); if (found) return found; }
  }
}

function cloneCard(api: Penpot, build: LegacyBuild, card: Shape, cardData: Record<string, any>, cardNum: string): Board {
    const card2 = build.clone(card) as Board;
    card2.name = "card" + cardNum.padStart(2, '0');

    for (const prop in cardData) {
        if (Object.prototype.hasOwnProperty.call(cardData, prop)) {
            const field = findByName(card2, prop);
            if (field) {
                if (field.type === "text") {
                    field.characters = cardData[prop];
                } else {
                    const imageId = cardData[prop].split("|")[0];
                    const image = api.currentPage?.getShapeById(imageId);
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
    if ((x + card.width) > output.x + output.width) {
        x = output.x;
        y += card.height;
    }
    return [x, y];
}


function addCutMarks(build: LegacyBuild, board: Board, clone = true) {
    let cutMBoard = build.board();
    cutMBoard.name = "cutMBoard";
    cutMBoard.resize(board.width + 200, board.height + 200);

    let rect = build.rectangle();
    rect.resize(200, 2);
    rect.x = 0;
    rect.y = 98;
    cutMBoard.appendChild(rect);

    rect = build.rectangle();
    rect.resize(200, 2);
    rect.x = cutMBoard.width - 200;
    rect.y = 98;
    cutMBoard.appendChild(rect);

    rect = build.rectangle();
    rect.resize(200, 2);
    rect.x = 0;
    rect.y = cutMBoard.height - 100;
    cutMBoard.appendChild(rect);

    rect = build.rectangle();
    rect.resize(200, 2);
    rect.x = cutMBoard.width - 200;
    rect.y = cutMBoard.height - 100;
    cutMBoard.appendChild(rect);


    rect = build.rectangle();
    rect.resize(2, 200);
    rect.x = 98;
    rect.y = 0;
    cutMBoard.appendChild(rect);

    rect = build.rectangle();
    rect.resize(2, 200);
    rect.x = cutMBoard.width - 100;
    rect.y = 0;
    cutMBoard.appendChild(rect);

    rect = build.rectangle();
    rect.resize(2, 200);
    rect.x = 98;
    rect.y = cutMBoard.height - 200;
    cutMBoard.appendChild(rect);

    rect = build.rectangle();
    rect.resize(2, 200);
    rect.x = cutMBoard.width - 100;
    rect.y = cutMBoard.height - 200;
    cutMBoard.appendChild(rect);

    if (clone) {
        board = (build.clone(board) as Board);
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

export function forgeLegacyCards(api: Penpot, cardsData: CardRecord[], type: LegacyMode, cutMarks: boolean, request?: ForgeRequest) {
    console.log("start forgecards", type, cutMarks);
    const page = api.currentPage;
    if (!page) throw new Error('Open a Penpot page first.');
    const fronts = page.findShapes({ name: 'Front', type: 'board' });
    const backs = page.findShapes({ name: 'Back', type: 'board' });
    if (!fronts.length || !backs.length) throw new Error('This layout needs Front and Back boards.');
    const frontTemplate = getFrontTemplate(page);
    const backTemplate = getFrontTemplate(page, 'Back');
    if (!frontTemplate || !backTemplate) throw new Error('This layout needs Front and Back boards. Choose a Fronts only layout to omit backs.');
    if (type === 'printplay' && Math.max(
        countRectsFit({ width: 2480, height: 3508 }, { width: frontTemplate.width + (cutMarks ? 200 : 0), height: frontTemplate.height * 2 + (cutMarks ? 200 : 0) }),
        countRectsFit({ width: 3508, height: 2480 }, { width: frontTemplate.width + (cutMarks ? 200 : 0), height: frontTemplate.height * 2 + (cutMarks ? 200 : 0) })
    ) === 0) throw new Error('A front-and-back pair does not fit on A4. Choose a smaller template or another layout.');
    const build = new LegacyBuild(api, page, `${page.id}:${frontTemplate.id}:${backTemplate.id}`);
    const undo = api.history.undoBlockBegin();
    try {


    let baseFront = frontTemplate as Board;
    let baseBack = backTemplate as Board;

    let card: Board;
    let output: Board;
    let tmpFront: Board | null = null;
    let tmpBack: Board | null = null;

    let x = baseFront.x;
    let y = baseFront.y + baseFront.height + 400;

    output = build.board();
    output.name = "Output";
    output.x = build.current ? build.current.x + build.current.width + 100 : x;
    output.y = y;
    x = output.x;

    if (type == "standard") {

        if (cutMarks) {
            tmpFront = addCutMarks(build, baseFront);
            tmpBack = addCutMarks(build, baseBack);

            baseFront = tmpFront;
            baseBack = tmpBack;
        }

        output.resize(baseFront.width * (cardsData.length + 1), baseFront.height);
    } else if (type == "tabletop") {
        output.resize(baseFront.width * 10, baseFront.height * 7);
    }

    if ((type == "tabletop") || (type == "standard")) {
        for (let i = 0; i < cardsData.length; i++) {
            card = cloneCard(api, build, baseFront, cardsData[i], String(i + 1));
            [x, y] = addCard(output, card, x, y);
        }

        card = (build.clone(baseBack) as Board);
        card.x = output.x + output.width - card.width;
        card.y = output.y + output.height - card.height;
        output.appendChild(card);
    } else if (type == "printplay") {
        tmpFront = build.board();
        tmpFront.name = "tmpFront";
        tmpFront.resize(baseFront.width, baseFront.height * 2);
        let backClone = build.clone(baseBack);
        backClone.rotate(180);
        tmpFront.appendChild(backClone);
        backClone.x = 0;
        backClone.y = 0;
        let frontClone = build.clone(baseFront);
        tmpFront.appendChild(frontClone);
        frontClone.x = 0;
        frontClone.y = frontClone.height;
        if (cutMarks) {
            tmpFront = addCutMarks(build, tmpFront, false);
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
            page = build.board();
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

                card = cloneCard(api, build, baseFront, cardsData[numCard], String(numCard + 1));
                page.appendChild(card);
                card.x = page.x + gapH + (j % cardsPerLine) * (card.width + gapH);
                card.y = page.y + gapV + Math.floor(j / cardsPerLine) * (card.height + gapV);
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

    if (api.currentPage?.id !== page.id) throw new Error('The active page changed. Return to the deck and try again.');
    if (type === 'printplay' && request) {
      output.setPluginData('front-output-request', JSON.stringify(request));
      output.setPluginData('front-output-template', JSON.stringify([templateSignature(frontTemplate), templateSignature(backTemplate)]));
    }
    build.publish(output);
    return output;
    } catch (error) { build.rollback(); throw error; }
    finally { api.history.undoBlockFinish(undo); }
}
