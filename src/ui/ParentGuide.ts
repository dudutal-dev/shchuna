import { guideSteps, parentStrings, type GuideStep } from '../content/parent.he';
import { artUrl } from '../engine/art';
import type { HudButtonId } from './Hud';
import { el } from './ParentGate';

const text = parentStrings.guide;
const ICONS: Record<NonNullable<GuideStep['button']>, string> = {
  map: 'ui/map.svg',
  book: 'ui/letter-book.svg',
  undo: 'ui/undo.svg',
  family: 'ui/family.svg',
  lock: 'ui/lock.svg',
};
/** Radius of the bright circle around a button, in CSS pixels. */
const SPOT_RADIUS = 52;

/** Where a HUD button is on screen, or null when it isn't showing here. */
export type ButtonLocator = (id: HudButtonId) => { x: number; y: number } | null;

/**
 * A guided tour for parents (reached from settings): step by step it lights up each
 * button on the real screen and explains what it does, then the gestures, so a parent
 * can show a child how to play. Resolves when the parent finishes or closes it.
 */
export class ParentGuide {
  /** The step showing now, for tests. */
  step = 0;
  private root: HTMLDivElement | null = null;

  open(locate: ButtonLocator): Promise<void> {
    return new Promise((resolve) => {
      const root = el('div', 'guide-overlay');
      const spot = el('div', 'guide-spot');
      const card = el('div', 'parent-card guide-card');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'guide-title');
      root.append(spot, card);
      document.body.appendChild(root);
      this.root = root;

      const finish = (): void => {
        this.close();
        resolve();
      };
      const show = (index: number): void => {
        this.step = index;
        const step = guideSteps[index]!;
        const at = step.button ? locate(step.button) : null;
        // A lit circle around the button, or a plain dimmed screen when there's none here.
        root.classList.toggle('dim', !at);
        spot.hidden = !at;
        if (at) {
          spot.style.left = `${at.x - SPOT_RADIUS}px`;
          spot.style.top = `${at.y - SPOT_RADIUS}px`;
        }
        // Keep the card clear of the lit button.
        card.classList.toggle('low', !!at && at.y < window.innerHeight / 2);

        const title = el('h2', 'parent-title', step.title);
        title.id = 'guide-title';
        const head = el('div', 'guide-head');
        if (step.button) {
          const icon = el('img', 'guide-icon');
          icon.src = artUrl(ICONS[step.button]);
          icon.alt = '';
          head.append(icon);
        }
        head.append(title);
        const body = el('p', 'guide-body', step.body);
        const list = el('ul', 'guide-points');
        for (const point of step.points ?? []) list.append(el('li', '', point));

        const nav = el('div', 'guide-nav');
        const counter = el('span', 'guide-count', text.step(index + 1, guideSteps.length));
        const last = index === guideSteps.length - 1;
        const next = el('button', 'parent-button', last ? text.finish : text.next);
        next.type = 'button';
        next.addEventListener('click', () => (last ? finish() : show(index + 1)));
        nav.append(next);
        if (index > 0) {
          const previous = el('button', 'parent-button secondary', text.previous);
          previous.type = 'button';
          previous.addEventListener('click', () => show(index - 1));
          nav.append(previous);
        }
        if (!last) {
          const close = el('button', 'parent-button secondary', text.close);
          close.type = 'button';
          close.addEventListener('click', finish);
          nav.append(close);
        }
        nav.append(counter);
        card.replaceChildren(head, body, ...(step.points ? [list] : []), nav);
        next.focus();
      };
      show(0);
    });
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }
}
