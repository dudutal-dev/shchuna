const RLM = '‏';

// Vowel points and cantillation, but not the maqaf (U+05BE) or punctuation like sof pasuq.
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/g;

let niqqudShown = true;

/** The parents' "show niqqud" setting. Applies to text drawn from now on. */
export function setNiqqudShown(shown: boolean): void {
  niqqudShown = shown;
}

export function stripNiqqud(text: string): string {
  return text.replace(NIQQUD, '');
}

/**
 * Prepares Hebrew for the canvas. Canvas text is laid out left to right, which sends
 * trailing punctuation to the wrong end of a sentence; marks at both ends make the
 * whole run RTL. Niqqud is dropped if the parents turned it off.
 */
export function rtl(text: string): string {
  return `${RLM}${niqqudShown ? text : stripNiqqud(text)}${RLM}`;
}
