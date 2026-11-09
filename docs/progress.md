# התקדמות — שכונה

## החלטות ברירת מחדל (עד שדודו יחליט אחרת)
| נושא | ההחלטה | למה |
|---|---|---|
| פונט | Rubik (מקומי ב-`public/fonts`) | בהשוואה בין Rubik, Heebo ו-Varela Round: הכי עגול, והניקוד הכי קריא בגודל גדול |
| TypeScript | נעול על 6.0 | typescript-eslint עדיין לא תומך ב-TS 7 |
| דפדפן בדיקות | Chromium עם touch emulation | SPEC מבקש touch emulation. זה לא מחליף בדיקה על iPad אמיתי לפני M8 |
| iPhone ב-e2e | 844×390 לרוחב | `CLAUDE.md` כותב 390×844, אבל SPEC §15–16.3 קובע שהמשחק לרוחב. לאורך תהיה בדיקה נפרדת לבקשת הסיבוב |
| הגנת רשת | CSP קשיח ב-build | אוכף בדפדפן עצמו את כלל "אפס קריאות רשת" |
| base של Vite | יחסי (`./`) | אותו build עובד ב-Pages בכל שם ריפו, ואחר כך ב-Capacitor |
| טווח גילאים (§19.1) | 3–8 | כפי שכתוב ב-SPEC |
| מוזיקה (§19.4) | לופ אקוסטי שקט | ברירת המחדל של SPEC §9.5 |
| ישראל/תפוצות (§19.6) | ישראל בלבד | הכי פשוט לשלב 0 |
| זהות git | `Dudu Tal`, כתובת noreply של `dudutal-dev`, רק בריפו הזה | לא הוגדרה זהות גלובלית במחשב |

## M0 — שלד
- [x] Vite + TS strict + Pixi v8 + PWA + Vitest + Playwright + ESLint
- [x] GitHub Actions ל-Pages (`.github/workflows/deploy.yml`)
- [x] `.env` ב-`.gitignore`
- [ ] עלייה בפועל ל-Pages: מחכה לריפו `dudutal-dev/shchuna` (ראה "מחכה לדודו")

## מחכה לדודו
- יצירת ריפו ב-GitHub, דחיפה והפעלת Pages (Settings → Pages → Source: GitHub Actions).
