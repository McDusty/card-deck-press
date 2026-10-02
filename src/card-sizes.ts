// All card dimensions are finished trim sizes, without bleed, at 300 ppi.
export type MeasurementUnit = 'px' | 'inch' | 'mm';
export interface CardDimensions { width: number; height: number }
export interface CardPreset extends CardDimensions {
    name: string;
    unit: 'inch' | 'mm';
}
export const PIXELS_PER_INCH = 300;
const scale: Record<MeasurementUnit, number> = { px: 1, inch: PIXELS_PER_INCH, mm: PIXELS_PER_INCH / 25.4 };
export const toPixels = (value: number, unit: MeasurementUnit): number => value * scale[unit];
export const fromPixels = (value: number, unit: MeasurementUnit): number => value / scale[unit];
export function formatDimensions(width: number, height: number, unit: MeasurementUnit): string {
    const format = (value: number) => Number(fromPixels(value, unit).toFixed(2)).toString();
    return `${format(width)} × ${format(height)} ${unit === 'inch' ? 'in' : unit}`;
}

// Rectangular trim sizes from MakePlayingCards' image-upload guide.
// Other printers can use different sizes. See docs/card-size-audit.md.
export const cardPresets: readonly CardPreset[] = [
    { name: 'Standard (Poker)', width: 2.5, height: 3.5, unit: 'inch' },
    { name: 'Bridge', width: 2.25, height: 3.5, unit: 'inch' },
    { name: 'Large', width: 3.5, height: 5.75, unit: 'inch' },
    { name: 'Tarot', width: 2.75, height: 4.75, unit: 'inch' },
    { name: 'Medium', width: 2.45, height: 3.95, unit: 'inch' },
    { name: 'Mini', width: 1.75, height: 2.5, unit: 'inch' },
    { name: 'Micro', width: 1.25, height: 1.75, unit: 'inch' },
    { name: 'Domino', width: 1.75, height: 3.5, unit: 'inch' },
    { name: 'Small square', width: 2, height: 2, unit: 'inch' },
    { name: 'Large square', width: 3.5, height: 3.5, unit: 'inch' },
    { name: 'Business', width: 2, height: 3.5, unit: 'inch' },
];
export const DEFAULT_CARD_SIZE = String(cardPresets.findIndex(preset => preset.name === 'Standard (Poker)'));
export const cardSizes: readonly (readonly [string, number, number])[] = cardPresets.map(preset => [
    preset.name, toPixels(preset.width, preset.unit), toPixels(preset.height, preset.unit),
]);

// Validate before changing the page name or creating any shapes.
export function resolveDeckSize(size: string, orientation: string, custom: unknown): CardDimensions {
    if (orientation !== 'portrait' && orientation !== 'landscape') throw new Error('Choose Portrait or Landscape.');
    let dimensions: CardDimensions;
    if (size === 'custom') {
        if (!custom || typeof custom !== 'object') throw new Error('Enter a custom width and height.');
        const { width, height } = custom as Record<string, unknown>;
        if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 12000 || height > 12000) throw new Error('Each card dimension must be between 1 and 12,000 px (40 inches at 300 ppi).');
        dimensions = { width, height };
    } else {
        if (!/^\d+$/.test(size)) throw new Error('Choose a card size.');
        const preset = cardSizes[Number(size)];
        if (!preset) throw new Error('Choose a card size.');
        dimensions = { width: preset[1], height: preset[2] };
    }
    const short = Math.min(dimensions.width, dimensions.height);
    const long = Math.max(dimensions.width, dimensions.height);
    return orientation === 'portrait' ? { width: short, height: long } : { width: long, height: short };
}
