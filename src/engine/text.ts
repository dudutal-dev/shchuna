const RLM = '‏';

/**
 * Canvas text is laid out left to right, which sends trailing punctuation to the
 * wrong end of a Hebrew sentence. Marks at both ends make the whole run RTL.
 */
export function rtl(text: string): string {
  return `${RLM}${text}${RLM}`;
}
