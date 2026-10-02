import type { CardRecord, OutputMode } from './output-options';

export function cardQuantity(card: CardRecord): number {
  if (!Object.prototype.hasOwnProperty.call(card, 'quantity')) return 1;
  if (!/^(0|[1-9]\d*)$/.test(card.quantity)) throw new Error(`Card ${card.card_id || '(without ID)'}: quantity must be a whole number from 0 to 100.`);
  const quantity = Number(card.quantity);
  if (!Number.isSafeInteger(quantity) || quantity > 100) throw new Error(`Card ${card.card_id || '(without ID)'}: quantity cannot exceed 100.`);
  return quantity;
}

export function printedCopies(cards: readonly CardRecord[]): number {
  return cards.reduce((total, card) => total + cardQuantity(card), 0);
}

export function cardsForOutput(cards: readonly CardRecord[], mode: OutputMode): CardRecord[] {
  const quantities = cards.map(cardQuantity);
  const sheets = ['fronts-6', 'fronts-9', 'backs-6', 'backs-9', 'printplay'].includes(mode);
  const total = quantities.reduce((sum, value) => sum + (sheets ? value : value > 0 ? 1 : 0), 0);
  if (total === 0) throw new Error('All quantities are zero. There are no cards to generate. Existing output is kept.');
  if (total > 1000) throw new Error('Print layouts support up to 1,000 copies. Reduce the quantities.');
  if (mode === 'tabletop' && total > 69) throw new Error('Tabletop output has space for 69 cards and one back.');
  return cards.flatMap((card, index) => Array.from({ length: sheets ? quantities[index] : quantities[index] > 0 ? 1 : 0 }, () => card));
}
