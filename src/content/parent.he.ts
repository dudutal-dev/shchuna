/**
 * Text for grown-ups only: the parents' gate and settings. It is not shown to children
 * as play text, so it is written without niqqud and has no voice (SPEC §12: the gate's
 * question is written, never spoken). The question itself keeps niqqud, as in SPEC.
 */

// TODO: proofread — the number words and the question.
const NUMBER_WORDS: Readonly<Record<number, string>> = {
  3: 'שָׁלֹשׁ',
  4: 'אַרְבַּע',
  5: 'חָמֵשׁ',
  6: 'שֵׁשׁ',
  7: 'שֶׁבַע',
  8: 'שְׁמוֹנֶה',
  9: 'תֵּשַׁע',
};

export function numberWord(n: number): string {
  const word = NUMBER_WORDS[n];
  if (!word) throw new Error(`No number word for ${n}`);
  return word;
}

export const parentStrings = {
  lockLabel: 'הורים: לחיצה ארוכה',
  gate: {
    title: 'להורים',
    question: (a: number, b: number) => `כַּמָּה זֶה ${numberWord(a)} כָּפוּל ${numberWord(b)}?`,
    tryAgain: 'לא בדיוק. נסו שוב.',
    back: 'חזרה למשחק',
  },
  settings: {
    title: 'הגדרות',
    sound: 'עוצמה',
    music: 'מוזיקה',
    voice: 'קול',
    sfx: 'צלילים',
    niqqud: 'הצגת ניקוד',
    gender: 'פנייה לילד',
    male: 'זכר',
    female: 'נקבה',
    genderHint: 'למשל "מָצָאתָ" או "מָצָאת".',
    reset: 'איפוס המשחק',
    resetAsk: 'לאפס את המשחק? הבית, הדמויות והאותיות שנמצאו יחזרו להתחלה.',
    resetYes: 'כן, לאפס',
    resetSure: 'בטוחים? אי אפשר לבטל את זה.',
    resetFinal: 'איפוס סופי',
    cancel: 'ביטול',
    privacyTitle: 'פרטיות',
    privacy:
      'שכונה לא אוספת שום מידע: אין חשבון, אין פרסומות, אין מעקב ואין חיבור לאינטרנט בזמן משחק. הכול נשמר במכשיר הזה בלבד.',
    privacyLink: 'מדיניות הפרטיות המלאה',
    close: 'חזרה למשחק',
  },
} as const;
