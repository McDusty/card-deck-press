export function createFakePenpot({ back = false, width = 750, height = 1039 } = {}) {
  let nextId = 0;
  const shapes = new Map();
  const messages = [];
  const undoBlocks = [];
  let listener;
  const handlers = new Map();
  let binding = { pageId: 'page-1', session: 1 };
  let rows = [];
  let rowSerial = 0;
  let cloneCount = 0;
  let failCloneAt = Infinity;
  let closed = false;
  class Shape {
    constructor(type = 'board', attach = true) {
      this.id = `shape-${++nextId}`;
      this.name = '';
      this.type = type;
      this.width = 1;
      this.height = 1;
      this._x = 0;
      this._y = 0;
      this.fills = [];
      this.strokes = [];
      this.characters = '';
      this.parent = null;
      this.data = new Map();
      if (type === 'board') this.children = [];
      shapes.set(this.id, this);
      if (attach) root.appendChild(this);
    }
    get x() { return this._x; }
    set x(value) {
      const change = value - this._x;
      this._x = value;
      for (const child of this.children ?? []) child.x += change;
    }
    get y() { return this._y; }
    set y(value) {
      const change = value - this._y;
      this._y = value;
      for (const child of this.children ?? []) child.y += change;
    }
    async export() { return new Uint8Array([1, 2, 3]); }
    resize(width, height) { this.width = width; this.height = height; }
    rotate(angle) { this.rotation = angle; }
    appendChild(child) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = this;
      this.children.push(child);
    }
    getPluginData(key) { return this.data.get(key) ?? ''; }
    setPluginData(key, value) { this.data.set(key, value); }
    clone() {
      if (++cloneCount === failCloneAt) throw new Error('Injected clone failure');
      const copy = new Shape(this.type);
      copy.name = this.name;
      copy.resize(this.width, this.height);
      copy.x = this.x;
      copy.y = this.y;
      copy.characters = this.characters;
      copy.fills = structuredClone(this.fills);
      copy.data = new Map(this.data);
      for (const child of this.children ?? []) copy.appendChild(child.clone());
      return copy;
    }
    remove() {
      for (const child of [...this.children ?? []]) child.remove();
      if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
      shapes.delete(this.id);
      this.parent = null;
    }
  }
  const root = new Shape('board', false);
  root.id = '00000000-0000-0000-0000-000000000000';
  shapes.set(root.id, root);
  const front = new Shape();
  front.name = 'Front';
  front.resize(width, height);
  front.x = 137;
  front.y = 251;
  const name = new Shape('text');
  name.name = '#name';
  name.x = front.x + 24;
  name.y = front.y + 24;
  name.characters = 'Template name';
  front.appendChild(name);
  if (back) {
    const board = new Shape();
    board.name = 'Back';
    board.resize(width, height);
  }
  const data = new Map();
  const page = {
    id: 'page-1', root,
    getShapeById: id => shapes.get(id) ?? null,
    findShapes: (criteria = {}) => [...shapes.values()].filter(shape => shape !== root && Object.entries(criteria).every(([key, value]) => shape[key] === value)),
    getPluginData: key => data.get(key) ?? '',
    setPluginData: (key, value) => data.set(key, value),
  };
  const api = {
    currentPage: page,
    on(event, callback) { handlers.set(event, callback); },
    history: { undoBlockBegin() { const block = Symbol(); undoBlocks.push(['begin', block]); return block; }, undoBlockFinish(block) { undoBlocks.push(['finish', block]); } },
    createBoard: () => new Shape(),
    createRectangle: () => new Shape('rectangle'),
    createText: characters => { const text = new Shape('text'); text.characters = characters; return text; },
    uploadMediaData: async (name, data, mtype) => ({ id: name, width: 100, height: 100, mtype }),
    closePlugin: () => { closed = true; },
    ui: { open() {}, onMessage(callback) { listener = callback; }, sendMessage(message) { messages.push(message); if(['PAGE_CONTEXT', 'SOURCE_CONTEXT'].includes(message.type)) binding = message.data; if(message.type === 'CARDS_DATA' || message.type === 'CSV_APPLIED') rows = [...message.rowIds]; } },
  };
  function dispatch(type, data, extra = {}) {
    if(api.currentPage?.id !== binding.pageId) handlers.get('pagechange')?.();
    if(type === 'save-cards-data' && !extra.rowIds) {
      const cards = JSON.parse(data);
      extra = {...extra, rowIds: cards.map((_, index) => rows[index] ?? `client-${++rowSerial}`)};
    }
    if(type === 'save-cards-data' && extra.rowIds && (extra.pageId === undefined || extra.pageId === binding.pageId)) rows = [...extra.rowIds];
    listener({...binding,...extra,type,data}); return messages.at(-1);
  }
  return {
    api, page, front, root, shapes, messages, Shape, undoBlocks,
    message: dispatch,
    restore() { dispatch('csv-status', null); return dispatch('csv-restore', messages.at(-1).data.restoreToken); },
    context: () => ({...binding}),
    rowIds: () => [...rows],
    switchPage(next) { api.currentPage = next; handlers.get('pagechange')?.(); },
    templateSize() { dispatch('load-template-size', null); return messages.at(-1).data; },
    correctPokerSize() { dispatch('correct-poker-size', null); },
    failNextClone() { failCloneAt = cloneCount + 1; },
    failSecondClone() { failCloneAt = cloneCount + 3; },
    forge(type, cardsData, extra = {}) { closed = false; dispatch('forge-cards', { type, cardsData, cutMarks: false, paper: 'a4', ...extra }); },
    output() { return page.getShapeById(page.getPluginData('front-output-current')); },
    async exportPdf(type, cardsData, extra = {}) { const requestId = `pdf-test-${++rowSerial}`; dispatch('export-front-pdf', { type, cardsData, cutMarks: false, paper: 'a4', ...extra }, {requestId}); await new Promise(resolve => setImmediate(resolve)); if (messages.at(-1)?.type === 'FRONT_PDF_IMAGES') dispatch('pdf-finish', null, {requestId}); },
    backOutput() { return page.getShapeById(page.getPluginData('back-output-current')); },
    createDeck(orientation = 'portrait') {
      for (const child of [...root.children]) child.remove();
      dispatch('create-deck', null, {name:'Poker',size:'0',orientation});
    },
    reopenSettings() { dispatch('load-output-settings', null); },
    wasClosed() { return closed; },
  };
}
