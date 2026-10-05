/** Keyboard-accessible disclosure for secondary deck actions. */
export function initActionMenu(trigger: HTMLButtonElement, menu: HTMLElement) {
  const items = () => [...menu.querySelectorAll<HTMLButtonElement>('button')]
    .filter(item => !item.disabled && !item.hidden && !item.classList.contains('hidden'));
  function close(returnFocus = false) {
    const wasOpen = !menu.hidden;
    menu.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    if (wasOpen && returnFocus) trigger.focus();
  }
  function open(last = false) {
    menu.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    const enabled = items(); enabled[last ? enabled.length - 1 : 0]?.focus();
  }
  trigger.addEventListener('click', () => menu.hidden ? open() : close(true));
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); open(event.key === 'ArrowUp');
    } else if (event.key === 'Escape') close(true);
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { close(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabled = items(); if (!enabled.length) return;
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length;
    enabled[next].focus();
  });
  for (const item of menu.querySelectorAll<HTMLButtonElement>('button')) {
    item.addEventListener('click', () => { if (!item.disabled) close(true); });
  }
  document.addEventListener('pointerdown', event => {
    if (event.target instanceof Node && !trigger.contains(event.target) && !menu.contains(event.target)) close();
  });
  document.addEventListener('focusin', event => {
    if (event.target instanceof Node && !trigger.contains(event.target) && !menu.contains(event.target)) close();
  });
  return { close };
}
