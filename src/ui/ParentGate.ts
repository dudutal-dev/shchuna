import { makeQuestion, MAX_MISTAKES, type GateQuestion } from '../app/parentGate';
import { parentStrings } from '../content/parent.he';

const text = parentStrings.gate;

/** Builds an element with a class and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/** A full-screen layer for grown-ups, in HTML over the canvas. */
export function overlay(labelledBy: string): { root: HTMLDivElement; card: HTMLDivElement } {
  const root = el('div', 'parent-overlay');
  const card = el('div', 'parent-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', labelledBy);
  root.appendChild(card);
  document.body.appendChild(root);
  return { root, card };
}

/**
 * The parents' gate (SPEC §12): a written times-table question with four answers.
 * Resolves true for the right answer, false after two mistakes or "back to the game".
 */
export class ParentGate {
  /** The current question, for tests. */
  question: GateQuestion | null = null;
  private root: HTMLDivElement | null = null;

  open(random: () => number = Math.random): Promise<boolean> {
    return new Promise((resolve) => {
      const { root, card } = overlay('gate-title');
      this.root = root;
      const title = el('h2', 'parent-title', text.title);
      title.id = 'gate-title';
      const prompt = el('p', 'gate-question');
      const choices = el('div', 'gate-choices');
      const message = el('p', 'gate-message');
      message.setAttribute('aria-live', 'polite');
      const back = el('button', 'parent-button secondary', text.back);
      back.type = 'button';
      card.append(title, prompt, choices, message, back);

      let mistakes = 0;
      const finish = (passed: boolean): void => {
        this.close();
        resolve(passed);
      };
      const ask = (): void => {
        const question = makeQuestion(random);
        this.question = question;
        prompt.textContent = text.question(question.a, question.b);
        choices.replaceChildren(
          ...question.choices.map((choice) => {
            const button = el('button', 'gate-choice', String(choice));
            button.type = 'button';
            button.addEventListener('click', () => {
              if (choice === question.answer) return finish(true);
              mistakes += 1;
              if (mistakes >= MAX_MISTAKES) return finish(false);
              message.textContent = text.tryAgain;
              // A fresh question, so guessing through the four doesn't work.
              ask();
            });
            return button;
          }),
        );
      };
      back.addEventListener('click', () => finish(false));
      ask();
    });
  }

  close(): void {
    this.root?.remove();
    this.root = null;
    this.question = null;
  }
}
