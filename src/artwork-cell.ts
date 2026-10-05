import { setBusy } from './busy-ui';
import { artworkName } from './artwork';
import type { ArtworkAsset } from './artwork';
import { openArtworkPicker, refreshArtworkPicker } from './artwork-picker';

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
  accept(assets: readonly ArtworkAsset[], reference: string): void;
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
  const field = document.createElement('div'); field.className = 'card-artwork-field';
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'card-artwork-edit';
  edit.setAttribute('aria-label', `Edit image for ${hooks.label}`); edit.setAttribute('aria-haspopup', 'dialog');
  edit.title = 'Search or change image';
  edit.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/></svg>';
  const status = document.createElement('span'); status.className = 'card-artwork-status'; status.setAttribute('role', 'status');
  const statusId = `artwork-status-${crypto.randomUUID()}`; status.id = statusId;
  input.setAttribute('aria-describedby', statusId);
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  let dirty = false;
  let currentAssets = hooks.assets;
  let currentReference = hooks.reference;

  function invalid(message: string) {
    setBusy(status, false);
    input.setCustomValidity(message); input.setAttribute('aria-invalid', 'true');
    status.textContent = message;
  }
  function choose(value: string) {
    dirty = true; input.value = value; invalid('Checking Artwork…'); setBusy(status, true); hooks.choose(value);
  }
  input.addEventListener('input', () => {
    dirty = true; invalid('Press Enter or leave this field to match the image name.'); hooks.draft();
  });
  input.addEventListener('change', () => { if (dirty) choose(input.value); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); choose(input.value); }
  });
  edit.addEventListener('click', () => openArtworkPicker({
    owner: element, label: hooks.label, assets: currentAssets, reference: currentReference,
    assetsUrl: hooks.assetsUrl, choose, upload: () => file.click(),
  }));
  file.addEventListener('change', hooks.upload);

  function refresh(assets: readonly ArtworkAsset[], reference: string) {
    currentAssets = assets; currentReference = reference;
    refreshArtworkPicker(element, assets, reference);
    const asset = assets.find(item => item.reference.split('|')[0] === reference.split('|')[0]);
    preview.hidden = !reference;
    if (reference) preview.src = hooks.assetsUrl + (asset?.reference ?? reference).split('|')[1];
    else preview.removeAttribute('src');
    if (!dirty) {
      setBusy(status, false);
      input.value = artworkName(assets, reference); input.setCustomValidity(''); input.removeAttribute('aria-invalid');
      status.textContent = reference && !asset ? 'Current image is outside Artwork.' : '';
    }
  }
  field.append(input, edit);
  controls.append(field, status);
  element.append(preview, controls, file);
  refresh(hooks.assets, hooks.reference);
  const message = (text: string) => { dirty = true; invalid(text); };
  return { element, refresh, accept: (assets, reference) => { dirty = false; refresh(assets, reference); },
    pending: text => { message(text); setBusy(status, true); }, error: message, ready: () => input.validity.valid, focus: () => { input.focus(); input.reportValidity(); } };
}
