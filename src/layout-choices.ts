import { calculateFrontLayout } from './front-layout';
import { isFaceMode, isSheetMode } from './output-options';
import type { PaperOrientation, PaperSize } from './output-options';
import type { TemplateSizeInfo } from './template-size';

/** Use generation's size/margin rules, including before any rows exist. */
export function updateLayoutChoices(select: HTMLSelectElement, templates: TemplateSizeInfo['templates'], paper: PaperSize, orientation: PaperOrientation, gapMm = 0): boolean {
  const selected = select.value;
  for (const option of Array.from(select.options)) {
    const mode = option.value;
    if (!isFaceMode(mode) || !isSheetMode(mode)) continue;
    const automatic = mode.endsWith('-auto');
    const face = mode.startsWith('backs-') ? 'Back' : 'Front';
    const template = templates.find(item => item.name === face);
    option.hidden = false;
    option.disabled = false;
    if (automatic) option.textContent = `${face}s on pages (automatic fit)`;
    if (!template) continue;
    try {
      const layout = calculateFrontLayout(mode, template.width, template.height, 1, paper, orientation, gapMm);
      if (automatic) option.textContent = `${face}s on pages (automatic fit: ${layout.perPage} per page)`;
    } catch {
      // Keep automatic fit available so users can change paper/orientation there.
      if (!automatic) { option.hidden = true; option.disabled = true; }
    }
  }
  const previous = Array.from(select.options).find(option => option.value === selected);
  if (previous?.disabled) select.value = selected.startsWith('backs-') ? 'backs-auto' : 'fronts-auto';
  return select.value !== selected;
}
