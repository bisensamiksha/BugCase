/**
 * Freeze / restore page state for the scroll-stitch capture (S2-12).
 *
 * `freezePageForCapture` hides sticky/fixed elements (so they don't repeat in every tile), stops CSS
 * animations/transitions, and records the scroll position. `restoreFrozenPage` reverses all of it.
 * State is stored in the DOM (a `<style>` with a known id, `data-*` markers, scroll attributes) so
 * the two functions can run as separate `chrome.scripting.executeScript` calls — which serialize the
 * function and run it in the page, with no shared JS scope. For that reason both functions are kept
 * self-contained (literal strings, no module references).
 */

/** Id of the injected style element that freezes animations/transitions. */
export const FREEZE_STYLE_ID = 'bugcase-capture-freeze';

/** Hide sticky/fixed elements, freeze animations, and save the scroll position. */
export function freezePageForCapture(doc: Document = document): void {
  const win = doc.defaultView;
  const root = doc.documentElement;
  root.setAttribute('data-bugcase-scroll-x', String(win ? win.scrollX : 0));
  root.setAttribute('data-bugcase-scroll-y', String(win ? win.scrollY : 0));

  if (!doc.getElementById('bugcase-capture-freeze')) {
    const style = doc.createElement('style');
    style.id = 'bugcase-capture-freeze';
    style.textContent =
      '*,*::before,*::after{animation:none !important;transition:none !important;scroll-behavior:auto !important;}';
    (doc.head ?? root).appendChild(style);
  }

  if (doc.body) {
    doc.body.querySelectorAll('*').forEach((node) => {
      const element = node as HTMLElement;
      const position = win ? win.getComputedStyle(element).position : '';
      if (position === 'fixed' || position === 'sticky') {
        element.setAttribute('data-bugcase-prev-visibility', element.style.visibility);
        element.style.visibility = 'hidden';
      }
    });
  }
}

/** Reverse {@link freezePageForCapture}: un-hide elements, drop the style, restore scroll. */
export function restoreFrozenPage(doc: Document = document): void {
  const win = doc.defaultView;
  const root = doc.documentElement;

  doc.getElementById('bugcase-capture-freeze')?.remove();

  doc.querySelectorAll('[data-bugcase-prev-visibility]').forEach((node) => {
    const element = node as HTMLElement;
    element.style.visibility = element.getAttribute('data-bugcase-prev-visibility') ?? '';
    element.removeAttribute('data-bugcase-prev-visibility');
  });

  if (root.hasAttribute('data-bugcase-scroll-y')) {
    const x = Number(root.getAttribute('data-bugcase-scroll-x') ?? '0');
    const y = Number(root.getAttribute('data-bugcase-scroll-y') ?? '0');
    root.removeAttribute('data-bugcase-scroll-x');
    root.removeAttribute('data-bugcase-scroll-y');
    win?.scrollTo(x, y);
  }
}
