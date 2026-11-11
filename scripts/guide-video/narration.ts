// The parents' video guide: what is said and shown, one segment at a time. The recording
// (tests/video/guide.video.ts) performs each segment's actions while its narration plays.
// For grown-ups, so written as plain Hebrew without niqqud.

export interface Segment {
  id: string;
  /** Said by the narrator, and shown as a caption. */
  text: string;
}

export const SEGMENTS: readonly Segment[] = [
  {
    id: 'intro',
    text: 'ברוכים הבאים לשכונה: עולם משחק בעברית לילדים. אין ניצחון ואין הפסד, הילד מחליט מה קורה. בואו נראה איך משחקים.',
  },
  {
    id: 'map',
    text: 'אחרי מסך הפתיחה מגיעים למפת השכונה. נגיעה במקום נכנסת אליו: בית, מכולת, גן, מרפאה, פלאפליה, חוף ותחנה.',
  },
  {
    id: 'bet',
    text: 'על הבית במפה מסתתרת האות בית. נגיעה מגלה אותה, ואז נכנסים הביתה.',
  },
  {
    id: 'tap',
    text: 'בבית נוגעים בדברים כדי להפעיל אותם. המקרר נפתח, הסיר מבעבע, והטלוויזיה נדלקת.',
  },
  {
    id: 'drag',
    text: 'גוררים חפצים באצבע. למשל את החלב מהמקרר אל השולחן. אוכל שנותנים לדמות, היא אוכלת.',
  },
  {
    id: 'letter',
    text: 'אותיות מסתתרות על חפצים, בכוכב צהוב. נגיעה בחפץ מגלה את האות, עם מילה שמתחילה בה.',
  },
  {
    id: 'move',
    text: 'כדי לעבור בין החדרים, נוגעים בחץ הגדול בצד המסך, או מחליקים על הקיר.',
  },
  {
    id: 'buttons',
    text: 'למעלה יש את כפתור המפה ואת ספר האותיות. למטה: כפתור חזור, שמבטל את הפעולה האחרונה, וכפתור הדמויות, להחלפת בגדים ושיער.',
  },
  {
    id: 'parents',
    text: 'ולהורים: לחיצה ארוכה על המנעול בפינה, ותרגיל קטן, פותחים את ההגדרות ואת סיור ההדרכה. משחק נעים!',
  },
];
