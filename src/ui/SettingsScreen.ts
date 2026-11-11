import { parentStrings } from '../content/parent.he';
import type { AddressGender, Settings } from '../types';
import { el, overlay } from './ParentGate';

const text = parentStrings.settings;

export interface SettingsHandlers {
  change(patch: Partial<Settings>): void;
  reset(): void;
}

/** The parents' settings (SPEC §12), reached only through the gate. Resolves when closed. */
export class SettingsScreen {
  private root: HTMLDivElement | null = null;

  open(settings: Settings, handlers: SettingsHandlers): Promise<void> {
    return new Promise((resolve) => {
      const { root, card } = overlay('settings-title');
      this.root = root;
      const title = el('h2', 'parent-title', text.title);
      title.id = 'settings-title';

      const volumes = el('fieldset', 'parent-group');
      volumes.append(el('legend', '', text.sound));
      for (const key of ['music', 'voice', 'sfx'] as const) {
        const label = el('label', 'parent-row');
        const slider = el('input', 'parent-slider');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.step = '5';
        slider.value = String(Math.round(settings[key] * 100));
        slider.name = key;
        slider.addEventListener('input', () => handlers.change({ [key]: Number(slider.value) / 100 }));
        label.append(el('span', '', text[key]), slider);
        volumes.append(label);
      }

      const niqqudRow = el('label', 'parent-row parent-group');
      const niqqud = el('input', 'parent-check');
      niqqud.type = 'checkbox';
      niqqud.name = 'niqqud';
      niqqud.checked = settings.showNiqqud;
      niqqud.addEventListener('change', () => handlers.change({ showNiqqud: niqqud.checked }));
      niqqudRow.append(el('span', '', text.niqqud), niqqud);

      const gender = el('fieldset', 'parent-group');
      gender.append(el('legend', '', text.gender));
      const options = el('div', 'parent-options');
      for (const [value, label] of [
        ['m', text.male],
        ['f', text.female],
      ] as Array<[AddressGender, string]>) {
        const option = el('label', 'parent-option');
        const radio = el('input', '');
        radio.type = 'radio';
        radio.name = 'gender';
        radio.value = value;
        radio.checked = settings.addressGender === value;
        radio.addEventListener('change', () => {
          if (radio.checked) handlers.change({ addressGender: value });
        });
        option.append(radio, el('span', '', label));
        options.append(option);
      }
      gender.append(options, el('p', 'parent-hint', text.genderHint));

      const reset = el('div', 'parent-group');
      const resetButton = el('button', 'parent-button danger', text.reset);
      resetButton.type = 'button';
      reset.append(resetButton);
      // Two confirmations before anything is wiped.
      resetButton.addEventListener('click', () =>
        this.confirm(reset, text.resetAsk, text.resetYes, () =>
          this.confirm(reset, text.resetSure, text.resetFinal, () => handlers.reset(), resetButton),
        resetButton),
      );

      const privacy = el('div', 'parent-group');
      const link = el('a', 'parent-link', text.privacyLink);
      link.href = 'privacy.html';
      link.target = '_blank';
      link.rel = 'noopener';
      privacy.append(el('h3', '', text.privacyTitle), el('p', 'parent-hint', text.privacy), link);

      const close = el('button', 'parent-button', text.close);
      close.type = 'button';
      close.addEventListener('click', () => {
        this.close();
        resolve();
      });

      card.append(title, volumes, niqqudRow, gender, reset, privacy, close);
    });
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }

  /** Swaps a group's content for a question with yes and cancel; cancel puts it back. */
  private confirm(
    group: HTMLElement,
    question: string,
    yes: string,
    onYes: () => void,
    restore: HTMLElement,
  ): void {
    const ask = el('p', 'parent-warning', question);
    const yesButton = el('button', 'parent-button danger', yes);
    yesButton.type = 'button';
    const cancel = el('button', 'parent-button secondary', text.cancel);
    cancel.type = 'button';
    const buttons = el('div', 'parent-options');
    buttons.append(yesButton, cancel);
    group.replaceChildren(ask, buttons);
    yesButton.addEventListener('click', onYes);
    cancel.addEventListener('click', () => group.replaceChildren(restore));
  }
}
