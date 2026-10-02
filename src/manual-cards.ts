import type { CardRecord } from './output-options';

function unusedId(cards: readonly CardRecord[], base: string): string {
  const ids = new Set(cards.map(card => card.card_id));
  let id = base, number = 2;
  while (ids.has(id)) id = `${base}-${number++}`;
  return id;
}

export function newManualCard(cards: readonly CardRecord[]): CardRecord {
  // Imported decks need unique IDs for reimport; manual decks only need quantity.
  return cards.some(card => card.card_id !== undefined)
    ? { card_id: unusedId(cards, 'manual'), quantity: '1' } : { quantity: '1' };
}

export function duplicateManualCard(card: CardRecord, cards: readonly CardRecord[]): CardRecord {
  const copy = { ...card };
  if (cards.some(card => card.card_id !== undefined)) copy.card_id = unusedId(cards, `${card.card_id || 'manual'}-copy`);
  return copy;
}
