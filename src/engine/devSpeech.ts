import voiceLines from '../content/voice-lines.json';

/** Development only: reads a line through the browser's own voice until its MP3 exists. */
export function speakWithBrowserVoice(lineId: string): void {
  const line =
    voiceLines.find((candidate) => candidate.id === lineId) ??
    voiceLines.find((candidate) => candidate.id === `${lineId}.m`);
  console.warn(`Voice file missing for ${lineId}, using Web Speech`);
  if (!line || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(line.text);
  utterance.lang = 'he-IL';
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}
