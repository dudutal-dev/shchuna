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
    invitations: 'הזמנות בקול',
    invitationsHint: 'כשהילד לא נוגע זמן מה, המשחק מציע משהו לעשות ויד שקופה מראה איך.',
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
    guide: 'איך משחקים? הדרכה להורים',
    guideHint: 'סיור קצר שמראה מה עושה כל כפתור, כדי שתוכלו להסביר לילד.',
    close: 'חזרה למשחק',
  },
  install: {
    message:
      'להורים: באנדרואיד מתקינים את המשחק דרך כרום. פותחים את הקישור בכרום, ובתפריט ⋮ בוחרים "התקנת אפליקציה". בדפדפן הזה ההתקנה עלולה להיחסם.',
    close: 'הבנתי',
  },
  guide: {
    next: 'הבא',
    previous: 'הקודם',
    finish: 'סיום',
    close: 'סגירה',
    step: (n: number, of: number) => `${n} מתוך ${of}`,
  },
} as const;

/** A step of the parents' guided tour. `button` is spotlighted on screen when it shows. */
export interface GuideStep {
  button?: 'map' | 'book' | 'undo' | 'family' | 'lock';
  title: string;
  body: string;
  /** Short lines shown as a list under the body. */
  points?: readonly string[];
}

export const guideSteps: readonly GuideStep[] = [
  {
    title: 'ברוכים הבאים לשכונה',
    body: 'שכונה היא עולם משחק פתוח: בית, מכולת, גן, מרפאה ופלאפליה. אין ניצחון, אין הפסד ואין טעויות, הילד מחליט מה קורה. הסיור הקצר הזה מראה מה עושה כל כפתור, כדי שתוכלו להסביר לילד.',
  },
  {
    button: 'map',
    title: 'המפה',
    body: 'חוזרים למפת השכונה. במפה נוגעים במקום כדי להיכנס אליו. מקום שמכוסה בענן עם מנעול עוד לא פתוח.',
  },
  {
    button: 'book',
    title: 'ספר האותיות',
    body: 'כאן נאספות האותיות שהילד מצא. נגיעה באות צבעונית משמיעה את שמה ואת המילה שלה. נגיעה באות אפורה נותנת רמז איפה לחפש.',
  },
  {
    button: 'undo',
    title: 'חזור',
    body: 'מבטל את הפעולה האחרונה במקום הזה, עד 20 צעדים אחורה. אי אפשר לקלקל שום דבר.',
  },
  {
    button: 'family',
    title: 'הדמויות',
    body: 'פותח את בונה הדמויות: בוחרים דמות בשורה העליונה, ומשנים גוף, צבע עור, שיער, בגדים ואביזר. הכפתור מופיע רק במקום שיש בו דמויות.',
  },
  {
    button: 'lock',
    title: 'מנעול ההורים',
    body: 'רק להורים. לחיצה ארוכה של 2 שניות ותרגיל חשבון פותחים את ההגדרות: עוצמה, ניקוד, פנייה לבן או לבת, איפוס המשחק, והסיור הזה.',
  },
  {
    title: 'איך משחקים',
    body: 'הכול נעשה באצבע אחת:',
    points: [
      'נגיעה: מדליקה, פותחת וסוגרת (מקרר, מנורה, טלוויזיה, נדנדה).',
      'גרירה: מזיזה חפצים ודמויות. אפשר להניח על שולחן, מדף, כיסא או מיטה.',
      'חפץ אל חפץ: כוס אל הכיור מתמלאת, סיר על הכיריים מבעבע, פלאפל לתוך הפיתה.',
      'חפץ אל דמות: אוכל נאכל, וצעצוע נשאר לה ביד.',
      'דמות על כיסא או מיטה: יושבת או שוכבת.',
      'לחיצה ארוכה על חפץ: שומעים את השם שלו ורואים אותו כתוב.',
      'לזוז בחדר: נגיעה בחץ הגדול בצד המסך מזיזה את החדר. אפשר גם להחליק על הקיר, והחדר ממשיך לגלוש. חפץ שמחזיקים ליד קצה המסך מזיז את החדר איתו.',
    ],
  },
  {
    title: 'אותיות וכסף',
    body: 'אותיות מסתתרות על חפצים, בכוכב צהוב קטן. נגיעה בחפץ מוצאת את האות. במכולת גוררים מוצר אל המסוע, ואז מטבעות מהפס שלמטה אל הצלחת. הקופה סופרת בקול ומחזירה עודף, והקניות מגיעות למקרר בבית. קופת החיסכון בחדר הילדים ממלאת את הארנק.',
  },
  {
    title: 'זהו!',
    body: 'אם הילד לא נוגע 20 שניות, משהו על המסך מנצנץ בעדינות כדי לרמוז מה אפשר לעשות. את הסיור אפשר לפתוח שוב מההגדרות. משחק נעים!',
  },
];
