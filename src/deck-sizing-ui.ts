import { cardSizes, DEFAULT_CARD_SIZE, formatDimensions, fromPixels, resolveDeckSize, toPixels } from './card-sizes';
import type { CardDimensions, MeasurementUnit } from './card-sizes';

export function initDeckSizing(): () => CardDimensions | null {
  const size = document.getElementById('create-deck-size') as HTMLSelectElement;
  const units = document.getElementById('create-deck-units') as HTMLSelectElement;
  const orientation = document.getElementById('create-deck-orientation') as HTMLSelectElement;
  const panel = document.getElementById('custom-card-size')!;
  const width = document.getElementById('custom-card-width') as HTMLInputElement;
  const height = document.getElementById('custom-card-height') as HTMLInputElement;
  const note = document.getElementById('create-size-note')!;
  let unit: MeasurementUnit = 'px';
  let custom: CardDimensions = { width: 750, height: 1050 };
  const read = () => { custom = { width: toPixels(width.valueAsNumber, unit), height: toPixels(height.valueAsNumber, unit) }; };
  const write = () => {
    width.value = String(Number(fromPixels(custom.width, unit).toFixed(6)));
    height.value = String(Number(fromPixels(custom.height, unit).toFixed(6)));
    for (const input of [width, height]) {
      input.min = String(fromPixels(1, unit)); input.max = String(fromPixels(12000, unit));
    }
    document.getElementById('custom-width-label')!.textContent = `WIDTH (${unit === 'inch' ? 'INCHES' : unit.toUpperCase()})`;
    document.getElementById('custom-height-label')!.textContent = `HEIGHT (${unit === 'inch' ? 'INCHES' : unit.toUpperCase()})`;
  };
  const refresh = () => {
    const selected = size.value || DEFAULT_CARD_SIZE;
    size.replaceChildren(...cardSizes.map(([name, w, h], index) => {
      const option = document.createElement('option'); option.value = String(index);
      const landscape = orientation.value === 'landscape';
      option.textContent = `${name.replace(/ \([^()]*mm\)$/, '')} (${formatDimensions(landscape ? h : w, landscape ? w : h, unit)})`;
      return option;
    }));
    const option = document.createElement('option'); option.value = 'custom'; option.textContent = 'Custom size'; size.append(option); size.value = selected;
    const isCustom = selected === 'custom';
    panel.classList.toggle('hidden', !isCustom);
    width.disabled = height.disabled = !isCustom;
    width.required = height.required = isCustom;
    const dims = isCustom ? custom : { width: cardSizes[Number(selected)][1], height: cardSizes[Number(selected)][2] };
    try {
      const actual = resolveDeckSize(selected, orientation.value, dims);
      note.textContent = `Card: ${formatDimensions(actual.width, actual.height, unit)}. Pixels use 300 ppi (pixels per inch). No bleed is added.`;
    } catch (error) { note.textContent = error instanceof Error ? error.message : 'Enter a valid size.'; }
  };
  units.value = unit;
  units.addEventListener('change', () => { unit = units.value as MeasurementUnit; write(); refresh(); });
  size.addEventListener('change', refresh);
  orientation.addEventListener('change', refresh);
  for (const input of [width, height]) input.addEventListener('input', () => { read(); refresh(); });
  write(); refresh();
  return () => size.value === 'custom' ? resolveDeckSize('custom', orientation.value, custom) : null;
}
