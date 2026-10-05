// Share visible and screen-reader busy feedback across asynchronous actions.
export function setBusy(element: HTMLElement | null, busy: boolean): void {
  if (!element) return;
  element.classList.toggle('is-busy', busy);
  element.setAttribute('aria-busy', String(busy));
}
