interface Pending {
  state: 'waiting' | 'queued' | 'loading';
  reference: string;
  requestId: string;
  images: Set<HTMLImageElement>;
}
type Preview = Pending | { state: 'ready'; url: string } | { state: 'error' };

// Shared by editable rows, linked rows, and the image picker. Never use guessed
// asset URLs: the controller supplies small PNG previews from Penpot itself.
export class ArtworkPreviews {
  private previews = new Map<string, Preview>();
  private targets = new WeakMap<HTMLImageElement, string>();
  private requests = new Map<string, Pending>();
  private queue: Pending[] = [];
  private observer: IntersectionObserver | undefined;
  private serial = 0;
  constructor(private readonly send: (reference: string, requestId: string) => void) {
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          const image = entry.target as HTMLImageElement;
          this.observer?.unobserve(image);
          const reference = this.targets.get(image);
          if (reference) this.enqueue(reference);
        }
      }, { rootMargin: '100px' });
    }
  }
  show(image: HTMLImageElement, reference: string): void {
    this.observer?.unobserve(image);
    this.targets.set(image, reference);
    image.onerror = null; image.removeAttribute('src'); image.hidden = !reference;
    if (!reference) return;
    const existing = this.previews.get(reference);
    if (existing?.state === 'ready') { this.display(image, existing.url); return; }
    if (existing?.state === 'error') { this.unavailable(image); return; }
    const pending: Pending = existing ?? { state: 'waiting', reference, requestId: `artwork-preview-${++this.serial}`, images: new Set() };
    pending.images.add(image); this.previews.set(reference, pending);
    if (this.observer) this.observer.observe(image);
    else if (image.isConnected) this.enqueue(reference);
    else queueMicrotask(() => {
      // Cells are assembled before being attached to their row.
      if (this.targets.get(image) === reference) this.enqueue(reference);
    });
  }
  private display(image: HTMLImageElement, url: string): void {
    image.hidden = false; image.title = '';
    image.onerror = () => { if (image.src === url) this.unavailable(image); };
    image.src = url;
  }
  private unavailable(image: HTMLImageElement): void {
    image.onerror = null; image.removeAttribute('src'); image.hidden = true;
    image.title = 'Preview unavailable. The card’s artwork assignment is unchanged.';
  }
  private enqueue(reference: string): void {
    const pending = this.previews.get(reference);
    if (pending?.state !== 'waiting') return;
    pending.state = 'queued'; this.queue.push(pending); this.pump();
  }
  private pump(): void {
    while (this.requests.size < 2 && this.queue.length) {
      const pending = this.queue.shift()!;
      if (![...pending.images].some(image => image.isConnected && this.targets.get(image) === pending.reference)) {
        pending.state = 'waiting'; pending.images.clear(); continue;
      }
      pending.state = 'loading'; this.requests.set(pending.requestId, pending);
      this.send(pending.reference, pending.requestId);
    }
  }
  message(type: string, value: unknown, requestId: string | undefined): void {
    if (!['ARTWORK_THUMBNAIL', 'ARTWORK_THUMBNAIL_ERROR'].includes(type) || !requestId) return;
    const pending = this.requests.get(requestId);
    if (!pending) return;
    this.requests.delete(requestId);
    const data = value as { reference?: unknown; data?: unknown } | null;
    const raw = data?.data;
    const bytes = raw instanceof Uint8Array ? raw : Array.isArray(raw) && raw.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? new Uint8Array(raw) : null;
    if (type === 'ARTWORK_THUMBNAIL' && data?.reference === pending.reference && bytes?.length && bytes.length <= 1024 * 1024) {
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' }));
      this.previews.set(pending.reference, { state: 'ready', url });
      for (const image of pending.images) if (image.isConnected && this.targets.get(image) === pending.reference) this.display(image, url);
    } else {
      this.previews.set(pending.reference, { state: 'error' });
      for (const image of pending.images) if (this.targets.get(image) === pending.reference) this.unavailable(image);
    }
    pending.images.clear(); this.pump();
  }
  reset(): void {
    this.observer?.disconnect();
    for (const preview of this.previews.values()) if (preview.state === 'ready') URL.revokeObjectURL(preview.url);
    this.previews.clear(); this.requests.clear(); this.queue = [];
    this.targets = new WeakMap();
  }
}
