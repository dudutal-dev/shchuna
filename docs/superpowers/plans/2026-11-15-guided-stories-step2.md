# Guided Stories — Step 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The hoopoe guide offers the next story on the map, a first-launch screen picks the age level, a finished story leaves a sticker in an album, and parents see which stories were finished.

**Architecture:** The pure engine decides which story is on offer anywhere (`nextStory` loses its `place` argument); `Game` shows that offer on `NeighbourhoodMap` and starts the story only in the place it begins. A Pixi `LevelPicker` runs once between the start screen and the map. The letter book gets two tabs; the second is a `StickerAlbum`. The parents' progress panel lists finished stories.

**Tech Stack:** TypeScript strict, PixiJS v8, Vitest, Playwright (ipad + iphone), ElevenLabs via `npm run voice` (build time only).

**Spec:** `docs/superpowers/specs/2026-11-14-guided-stories-design.md` (§5.2, §5.4, §6 "בחירת הרמה", §8 "הורים", §10 step 2).

## Global Constraints

- No runtime network calls, no third-party SDKs, no personal data: the level is one of three pictures, saved on the device only.
- Nothing needs reading to go on. Every child-facing text is pointed and spoken. New pointed text is marked `proofread: false` / `// TODO: proofread`.
- Touch targets at least 64 points; feedback (sound + small animation) within 100ms. RTL.
- No scores, counts, percentages, streaks or timers anywhere, including the album and the parents' list.
- Art: original SVG only, per `docs/style-guide.md` (rounded shapes, 3–4 unit outline in a darker tone of the fill, no text inside SVG).
- The guide must not talk all the time: the map's opening line is said once per story per session unless the child taps the guide.
- Stories never block free play. Existing tests without `stories` in the URL must behave exactly as before.
- Code and comments in English. Small commits. No push, no merge to main.

## Review Focus

1. A story is on offer on the map but its place is locked or a needed character is elsewhere: the guide must not point at a place the story can't start in (`nextStory` already skips stranded stories; the map must use the same function).
2. A story in progress whose current step is in another place: on the map the guide stands by that step's place and says nothing new.
3. First launch with stories switched off, or with a saved level: the picker must not appear. An old save without a level sees it once.
4. A story finished a second time gives no second sticker and no "new sticker" line.
5. The album on a 640×360 phone: tabs and stickers stay at least 64 points and inside the safe area.

---

### Task 1: One offer for the whole neighbourhood

**Files:**
- Modify: `src/learning/StoryEngine.ts`, `src/content/stories.ts`, `src/app/Game.ts`
- Test: `tests/unit/StoryEngine.test.ts`

**Interfaces:**
- Produces: `nextStory(stories, progress, whereIs, skipped): Story | null` — the story on offer anywhere (fresh ones in list order first; once all are done, the one done longest ago; never a skipped or stranded one). `Story.sticker: string` (art path) and `Story.nameLine: string` (voice line id). For `pita`: `sticker: 'stickers/pita.svg'`, `nameLine: 'story.pita.name'`.
- `Game.offerStory` starts the story only when `story.start === this.location.id`.

- [ ] **Step 1:** Change the `nextStory` tests to the new signature and add: `nextStory(STORIES, fresh(), everyoneAt('falafel'), new Set())?.id === 'pita'`; with two fake stories (`a` at home done at 5, `b` at falafel done at 3) it returns `b`; with `a` fresh and `b` done it returns `a`; a stranded fresh story is passed over for the next one.
- [ ] **Step 2:** Run `npx vitest run tests/unit/StoryEngine.test.ts`. Expected: FAIL (type error / wrong arity).
- [ ] **Step 3:** Implement the signature change; add `sticker` and `nameLine` to `Story` and to `pita`; in `Game.offerStory` compare `story.start` with the place.
- [ ] **Step 4:** Run `npx vitest run && npm run lint`. Expected: PASS, clean.
- [ ] **Step 5:** Commit `Stories: one offer for the whole neighbourhood`.

### Task 2: The guide on the map

**Files:**
- Modify: `src/ui/NeighbourhoodMap.ts`, `src/app/Game.ts`, `src/app/testHook.ts`
- Test: `tests/e2e/stories.spec.ts`

**Interfaces:**
- Consumes: `nextStory` (Task 1), `GUIDE_ART`.
- Produces: `NeighbourhoodMap.setGuide(place: LocationId | null): void` (a soft pulsing glow behind the place and the hoopoe standing by it, 72 map-independent screen points at least 64pt hit area), `guideCenter(): Point | null`, constructor option `onGuide?: () => void`. The idle hint points at the guide's place when there is one. Hook: `mapGuide(): { place: string; center: Point } | null`.
- `Game.mapOffer(): { story: Story; place: LocationId; active: boolean } | null` — the active story's current step place, else `nextStory(...)`'s start (only if that place is open). `showMapView` calls `map.setGuide`. When the offer is not active, not in a journey, and not yet announced this session, the map says `[..., story.openLine]` instead of `map.where`; entering that place right after says only the first step (not the opening again). Tapping the guide: tap sound, the place wiggles, the opening line (or the current step's line when active) is said.

- [ ] **Step 1:** Add e2e tests (map opened with `openGame(page, 'map', { stories: true, level: 2 })`): the guide stands by the falafel stand (`mapGuide().place === 'falafel'`) and `story.pita.open` is spoken; tapping the guide says it again; entering home starts no story; entering the falafel stand starts `pita` and `story.pita.open` is in `spoken()` exactly as many times as before entering; with a story in progress and the child at home → map, the guide is at `falafel` and no opening line is added; without `stories`, `mapGuide()` is null.
- [ ] **Step 2:** Run `npx playwright test stories -g "map"`. Expected: FAIL (`mapGuide` is not a function).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx playwright test stories map journeys`. Expected: PASS.
- [ ] **Step 5:** Commit `Stories: the guide waits on the map by the place a story starts`.

### Task 3: Who is playing today

**Files:**
- Create: `src/ui/LevelPicker.ts`, `assets/art/ui/kid-small.svg`, `assets/art/ui/kid-middle.svg`, `assets/art/ui/kid-big.svg`
- Modify: `src/app/Game.ts`, `src/app/testHook.ts`, `src/content/voice-lines.json`, `tests/e2e/helpers.ts`
- Test: `tests/e2e/parents.spec.ts` (describe "who is playing")

**Interfaces:**
- Produces: `class LevelPicker { constructor(app); show(): Promise<void>; waitForChoice(): Promise<StoryLevel>; center(level): Point; destroy() }` — three pictures in a row, right to left small → big, each at least 120 screen points, over the start-screen background colour; a press squishes the picture. Voice line `level.who` = "מִי מְשַׂחֵק הַיּוֹם?". Hook: stage `'level'`, `pickCenter: ((level: 1|2|3) => Point) | null`. Test flag `?e2e&pick` (in tests the picker shows only with it); `GameOptions.pick?: boolean`.
- `Game.start`: after the start tap, if `settings.level === undefined && settings.stories !== false` and the picker is allowed here: say `['ui.welcome', 'level.who']`, wait, `changeSettings({ level })`, then go on to the map as before (without repeating the welcome).

- [ ] **Step 1:** e2e tests: with `{ pick: true }` on the map, after the start tap the stage is `'level'` and `level.who` is spoken; tapping the small picture saves `settings.level === 1` and the stage becomes `'map'`; after `flushSave` + reload the picker does not come back; with a save whose stories are off the picker is skipped. `tapToStart` accepts the `'level'` stage.
- [ ] **Step 2:** Run them. Expected: FAIL (stage never `'level'`).
- [ ] **Step 3:** Draw the three pictures, implement, record the line (`npm run voice`).
- [ ] **Step 4:** Run `npx playwright test parents smoke map` and `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Commit `Stories: the first launch asks who is playing`.

### Task 4: The sticker album

**Files:**
- Create: `src/ui/StickerAlbum.ts`, `assets/art/stickers/pita.svg`, `assets/art/ui/tab-letters.svg`, `assets/art/ui/tab-stickers.svg`
- Modify: `src/ui/LetterBook.ts`, `src/app/Game.ts`, `src/app/testHook.ts`, `src/content/voice-lines.json`
- Test: `tests/e2e/stories.spec.ts`, `tests/e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `Story.sticker`, `Story.nameLine`.
- Produces: `class StickerAlbum { view; constructor(stories, isDone: (id) => boolean, audio); load(): Promise<void>; layout(area: Rectangle): void; center(id): Point | null }` — one sticker per story, 4 per row right to left, each at least 64pt; a finished story's sticker in colour, the others a pale silhouette; a tap squishes it and says the story's `nameLine`. `LetterBook`: two round tabs (84pt) at the top right, letters first; `LetterBook.center` also takes `'tab-letters' | 'tab-stickers' | 'sticker:<id>'`; constructor option to open on the stickers page is not needed.
- Voice lines: `story.pita.name` = "פִּיתָּה לְסַבָּא", `story.sticker` = "מַדְבֵּקָה חֲדָשָׁה!".
- `Game.onStoryEvent` on `finished`: stars as before; if the story was not in `done` before, the sticker grows in the middle of the screen and flies to the book button (`flySticker(app, art, bookAt)` in `StickerAlbum.ts`), and `[doneLine, 'story.sticker']` is said; otherwise only `doneLine`.

- [ ] **Step 1:** e2e: before the story the album shows `pita` not earned (open book → tab → `bookCenter('sticker:pita')` not null, tapping says `story.pita.name`); after finishing level 1 `story.sticker` is spoken once; finishing again does not add another. Layout test: on the four phone sizes the two tabs and the sticker are on screen and at least 64pt apart from the done button.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Draw, implement, record.
- [ ] **Step 4:** Run `npx playwright test stories letters layout`. Expected: PASS.
- [ ] **Step 5:** Commit `Stories: a sticker for a finished story, in the letter book`.

### Task 5: Parents see the finished stories

**Files:**
- Modify: `src/ui/ProgressPanel.ts`, `src/ui/SettingsScreen.ts`, `src/content/parent.he.ts`, `src/app/Game.ts`, `src/styles.css`
- Test: `tests/unit/progress.test.ts`

**Interfaces:**
- Produces: `storiesPanel(done: readonly { id: string; at: number }[], now?): HTMLElement` — title "סיפורים", one row per finished story ("פיתה לסבא — היום"), or "עוד לא הושלם סיפור." No counts. `parentStrings.progress.stories = { title, none, names: { pita: 'פיתה לסבא' } }`. `SettingsHandlers.storiesDone?`.

- [ ] **Step 1:** Unit tests: empty list shows the "none" sentence; one entry from yesterday shows the name and "אתמול"; an unknown id is left out.
- [ ] **Step 2:** Run `npx vitest run tests/unit/progress.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire into the settings screen under the letters panel.
- [ ] **Step 4:** Run `npx vitest run && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit `Parents: the stories the child finished`.

### Task 6: Screens, notes, the whole suite

- [ ] **Step 1:** Screenshots from the e2e tests: `docs/screens/story-map-*.png`, `story-level-*.png`, `story-album-*.png`.
- [ ] **Step 2:** `npm run lint && npm run test && npm run build && npm run e2e`. Expected: all green.
- [ ] **Step 3:** Update `docs/progress.md` (what was built, decisions, what waits for Dudu). Commit.
