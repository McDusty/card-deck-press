export const FRONT_MODES = ['fronts-single', 'fronts-auto', 'fronts-6', 'fronts-9'] as const;
export type FrontMode = typeof FRONT_MODES[number];
export const BACK_MODES = ['backs-single', 'backs-auto', 'backs-6', 'backs-9'] as const;
export type BackMode = typeof BACK_MODES[number];
export type FaceMode = FrontMode | BackMode;
export type LegacyMode = 'standard' | 'printplay' | 'tabletop';
export type OutputMode = FaceMode | LegacyMode;
export type PaperSize = 'a4' | 'letter';
export type PaperOrientation = 'auto' | 'portrait' | 'landscape';
export type CardRecord = Record<string, string>;

export interface ForgeRequest {
  cardsData: CardRecord[];
  type: OutputMode;
  cutMarks: boolean;
  paper: PaperSize;
  paperOrientation: PaperOrientation;
  gapMm: number;
  bufferColor: string;
}

export function isFrontMode(value: string): value is FrontMode {
  return FRONT_MODES.some(mode => mode === value);
}

export function isFaceMode(value: string): value is FaceMode {
  return isFrontMode(value) || BACK_MODES.some(mode => mode === value);
}

export function isSheetMode(value: string): value is Exclude<FaceMode, 'fronts-single' | 'backs-single'> {
  return isFaceMode(value) && !value.endsWith('-single');
}

export function parseForgeRequest(value: unknown): ForgeRequest {
  if (typeof value !== 'object' || value === null) throw new Error('Choose an output layout.');
  const input = value as Record<string, unknown>;
  const mode = input.type;
  if (typeof mode !== 'string' || (!isFaceMode(mode) && mode !== 'standard' && mode !== 'printplay' && mode !== 'tabletop')) {
    throw new Error('Choose an output layout.');
  }
  if (!Array.isArray(input.cardsData) || input.cardsData.length === 0) throw new Error('Add at least one card before forging.');
  for (const [index, card] of input.cardsData.entries()) {
    if (typeof card !== 'object' || card === null || Array.isArray(card) || Object.values(card).some(value => typeof value !== 'string')) {
      throw new Error(`Card ${index + 1} has invalid data. Reopen the card list and check its fields.`);
    }
  }
  const paper = input.paper ?? 'letter';
  if (paper !== 'a4' && paper !== 'letter') throw new Error('Choose A4 or US Letter paper.');
  const paperOrientation = input.paperOrientation ?? 'auto';
  if (paperOrientation !== 'auto' && paperOrientation !== 'portrait' && paperOrientation !== 'landscape') throw new Error('Choose Auto, Portrait, or Landscape for page orientation.');
  if (![undefined, true, false, 'true', 'false'].includes(input.cutMarks as boolean | string | undefined)) {
    throw new Error('Choose whether to include cut marks.');
  }
  const cutMarks = input.cutMarks === undefined ? isSheetMode(mode) : input.cutMarks === true || input.cutMarks === 'true';
  if (isFaceMode(mode) && !isSheetMode(mode) && cutMarks) throw new Error('Single cards contain only the card artwork. Choose a sheet layout to include cut lines.');
  const gapMm = input.gapMm ?? 0;
  const bufferColor = input.bufferColor ?? '#FFFFFF';
  if (typeof gapMm !== 'number' || !Number.isFinite(gapMm) || gapMm < 0 || gapMm > 10) throw new Error('Choose card spacing between 0 and 10 mm.');
  if (typeof bufferColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(bufferColor)) throw new Error('Choose a valid buffer color.');
  const pages = isSheetMode(mode) || mode === 'printplay';
  return { gapMm: pages ? gapMm : 0, bufferColor: pages && gapMm > 0 ? bufferColor.toUpperCase() : '#FFFFFF', cardsData: input.cardsData as CardRecord[], type: mode, cutMarks, paper, paperOrientation: isSheetMode(mode) ? paperOrientation : 'auto' };
}
