import { artworkName } from './artwork';
import type { ArtworkAsset } from './artwork';

interface Hooks {
  label: string;
  reference: string;
  assetsUrl: string;
  assets: readonly ArtworkAsset[];
  choose(value: string): void;
  upload(event: Event): void;
  draft(): void;
}

export interface ArtworkCell {
  element: HTMLElement;
  refresh(assets: readonly ArtworkAsset[], reference: string): void;
  pending(message: string): void;
  error(message: string): void;
  ready(): boolean;
  focus(): void;
}

export function createArtworkCell(hooks: Hooks): ArtworkCell {
  const element = document.createElement('div'); element.className = 'card-image';
  const controls = document.createElement('div'); controls.className = 'card-image-controls';
  const preview = document.createElement('img'); preview.alt = ''; preview.className = 'card-image-preview';
  const input = document.createElement('input'); input.type = 'text'; input.className = 'card-artwork-name';
  input.placeholder = 'Artwork image name'; input.setAttribute('aria-label', `Artwork name for ${hooks.label}`);
  const select = document.createElement('select'); select.className = 'card-artwork-select';
  select.setAttribute('aria-label', `Choose Artwork for ${hooks.label}`);
  const status = document.createElement('span'); status.className = 'card-artwork-status'; status.setAttribute('role', 'status');
  const statusId = `artwork-status-${crypto.randomUUID()}`; status.id = statusId;
  input.setAttribute('aria-describedby', statusId);
  const actions = document.createElement('div'); actions.className = 'card-image-actions';
  const upload = document.createElement('button'); upload.type = 'button'; upload.textContent = 'Upload';
  upload.setAttribute('aria-label', `Upload image for ${hooks.label}`);
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear';
  clear.setAttribute('aria-label', `Clear image for ${hooks.label}`);
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  let dirty = false;

  function invalid(message: string) {
    input.setCustomValidity(message); input.setAttribute('aria-invalid', 'true');
    status.textContent = message;
  }
  function choose(value: string) {
    dirty = true; input.value = value; invalid('Checking Artwork…'); hooks.choose(value);
  }
  input.addEventListener('input', () => {
    dirty = true; invalid('Press Enter or leave this field to match the image name.'); hooks.draft();
  });
  input.addEventListener('change', () => choose(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); choose(input.value); }
  });
  select.addEventListener('change', () => { if (select.value) choose(select.value); });
  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', hooks.upload);
  clear.addEventListener('click', () => choose(''));

  function refresh(assets: readonly ArtworkAsset[], reference: string) {
    select.replaceChildren();
    const prompt = document.createElement('option'); prompt.value = '';
    prompt.textContent = assets.length ? 'Choose from Artwork…' : 'No images in Artwork'; select.appendChild(prompt);
    const choices = assets.map(asset => ({ asset, value: artworkName(assets, asset.reference) }));
    for (const { asset, value } of choices.sort((a, b) => a.asset.path.localeCompare(b.asset.path))) {
      const option = document.createElement('option'); option.value = asset.path; option.textContent = value;
      select.appendChild(option);
    }
    select.disabled = !assets.length;
    const asset = assets.find(item => item.reference.split('|')[0] === reference.split('|')[0]);
    preview.hidden = !reference;
    if (reference) preview.src = hooks.assetsUrl + (asset?.reference ?? reference).split('|')[1];
    else preview.removeAttribute('src');
    if (!dirty) {
      input.value = artworkName(assets, reference); input.setCustomValidity(''); input.removeAttribute('aria-invalid');
      status.textContent = reference && !asset ? 'Current image is outside Artwork.' : '';
      select.value = asset?.path ?? '';
    }
  }
  actions.append(upload, clear);
  controls.append(input, select, actions, status);
  element.append(preview, controls, file);
  refresh(hooks.assets, hooks.reference);
  const message = (text: string) => { dirty = true; invalid(text); };
  return { element, refresh, pending: message, error: message, ready: () => input.validity.valid, focus: () => { input.focus(); input.reportValidity(); } };
}
