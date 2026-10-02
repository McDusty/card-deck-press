import { searchArtwork } from './artwork';
import type { ArtworkAsset } from './artwork';

interface PickerOptions {
  owner: HTMLElement;
  label: string;
  assets: readonly ArtworkAsset[];
  reference: string;
  assetsUrl: string;
  choose(value: string): void;
  upload(): void;
}

let picker: ReturnType<typeof createPicker> | undefined;

function createPicker() {
  const dialog = document.createElement('dialog'); dialog.className = 'artwork-picker';
  const title = document.createElement('h2'); title.id = 'artwork-picker-title'; title.textContent = 'Choose image';
  dialog.setAttribute('aria-labelledby', title.id);
  const description = document.createElement('p'); description.id = 'artwork-picker-description';
  dialog.setAttribute('aria-describedby', description.id);
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close image picker'); close.addEventListener('click', () => dialog.close());
  const header = document.createElement('div'); header.className = 'artwork-picker-header'; header.append(title, close);
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search image names…';
  search.setAttribute('aria-label', 'Search Artwork images'); search.autofocus = true;
  const count = document.createElement('p'); count.className = 'artwork-picker-count'; count.setAttribute('role', 'status');
  const results = document.createElement('div'); results.className = 'artwork-picker-results';
  const footer = document.createElement('div'); footer.className = 'artwork-picker-actions';
  const upload = document.createElement('button'); upload.type = 'button'; upload.textContent = 'Upload image';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear image';
  footer.append(upload, clear);
  dialog.append(header, description, search, count, results, footer); document.body.append(dialog);
  let current: PickerOptions | undefined;

  function render() {
    if (!current) return;
    const options = current;
    const matches = searchArtwork(options.assets, search.value);
    count.textContent = matches.length > 60 ? `Showing 60 of ${matches.length} images. Search to narrow the list.`
      : matches.length ? `${matches.length} image${matches.length === 1 ? '' : 's'}`
      : options.assets.length ? 'No matching images. Try another name or upload an image.' : 'No images in Artwork yet. Upload an image to get started.';
    results.replaceChildren();
    for (const asset of matches.slice(0, 60)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'artwork-picker-result';
      button.setAttribute('aria-label', `Choose ${asset.path}`);
      button.setAttribute('aria-pressed', String(asset.reference.split('|')[0] === options.reference.split('|')[0]));
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy';
      image.src = options.assetsUrl + asset.reference.split('|')[1];
      const text = document.createElement('span');
      const name = document.createElement('strong'); name.textContent = asset.name;
      const path = document.createElement('small'); path.textContent = asset.path;
      text.append(name, path); button.append(image, text);
      button.addEventListener('click', () => { dialog.close(); options.choose(asset.path); });
      results.append(button);
    }
  }
  search.addEventListener('input', render);
  upload.addEventListener('click', () => { const options = current; dialog.close(); options?.upload(); });
  clear.addEventListener('click', () => { const options = current; dialog.close(); options?.choose(''); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
  });
  dialog.addEventListener('close', () => { if (!dialog.open) { current = undefined; results.replaceChildren(); } });
  return {
    open(options: PickerOptions) {
      current = options; description.textContent = options.label; search.value = ''; render();
      dialog.showModal(); search.focus();
    },
    refresh(owner: HTMLElement, assets: readonly ArtworkAsset[], reference: string) {
      if (current?.owner === owner) { current = { ...current, assets, reference }; render(); }
    },
    close() { if (dialog.open) dialog.close(); },
  };
}

export function openArtworkPicker(options: PickerOptions) { (picker ??= createPicker()).open(options); }
export function refreshArtworkPicker(owner: HTMLElement, assets: readonly ArtworkAsset[], reference: string) { picker?.refresh(owner, assets, reference); }
export function closeArtworkPicker() { picker?.close(); }
