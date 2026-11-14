# Guided Stories, Step 1 (engine, strip, "Pita for Grandpa") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A child who enters the falafel stand gets a short story ("Grandpa is hungry") shown as a strip of step pictures, in three age levels, that ends in a celebration, so Dudu can judge whether stories fix the "aimless" feeling.

**Architecture:** Stories are data (`src/content/stories.ts`). A pure engine (`src/learning/StoryEngine.ts`, no Pixi) decides which story to offer and whether a game event completes the current step. `Scene` reports what the child did as `StoryEvent`s; `Game` feeds them to the engine, saves progress through `actions`, speaks, and drives a Pixi `StoryStrip` at the top of the screen.

**Tech Stack:** TypeScript strict, PixiJS v8, Vitest, Playwright (touch emulation), existing `AudioManager`, `GhostFinger`, `SaveManager`.

**Spec:** `docs/superpowers/specs/2026-11-14-guided-stories-design.md` (build order step 1 only). Steps 2 (map guide, level picker screen, sticker album) and 3 (the other 11 stories) get their own plans after Dudu has played this one.

## Global Constraints

- No network calls at runtime; every spoken line is a pre-recorded file made by `npm run voice`.
- Nothing requires reading to progress; every child-facing text has niqqud and is spoken.
- Child strings live in `src/content/strings.he.ts`, voice lines in `src/content/voice-lines.json`; new niqqud is marked `// TODO: proofread` / `"proofread": false`.
- Touch targets at least 64×64 points; feedback within 100ms; RTL (step 1 is the rightmost circle).
- No scores, no success counts, no "wrong", no streaks, no timers. A story never blocks free play and never expires.
- The level never changes by itself.
- Art is SVG under `assets/art`, per `docs/style-guide.md`.
- Code and comments in English. Small commits on `main`, no force-push, **no push** (a push deploys; Dudu decides when).
- In e2e, stories run only when the URL has `&stories` (like `&invites`), so existing tests are untouched. `&level=1|2|3` overrides the saved level in e2e only.

## Review Focus

1. **The child leaves the falafel stand mid-story.** The strip stays, the map button pulses, and coming back continues at the same step. (Task 4 e2e.)
2. **Grandpa is not at the stand** (he travelled away earlier). The story is not offered, rather than offered and impossible. (Task 2 unit: `needs`.)
3. **The parent changes the level mid-story.** The story restarts at step 0 of the new level instead of pointing past the end of a shorter list. (Task 6 unit + e2e.)
4. **An unstuffed pita is served, or the stuffing is undone.** Serving an empty pita does not complete "serve"; a step already completed stays completed after undo. (Task 2 unit.)
5. **A save names a story that no longer exists**, or has no `stories` field at all. It loads with no active story and nothing thrown. (Task 1 unit, Task 2 unit: `sanitize`.)

---

### Task 1: Save shape and migration 6 → 7

**Files:**
- Modify: `src/types.ts`, `src/engine/SaveManager.ts`, `docs/progress.md`, `docs/superpowers/specs/2026-11-14-guided-stories-design.md`
- Test: `tests/unit/SaveManager.test.ts`

**Interfaces:**
- Produces, in `src/types.ts`:

```ts
export type StoryLevel = 1 | 2 | 3;
export interface StoryProgress {
  /** The story in progress and the index of its current step. */
  active?: { id: string; step: number };
  done: { id: string; at: number }[];
  offered: string[];
}
// Settings gains:  level?: StoryLevel;  stories?: boolean;   (missing means level 2, stories on)
// SaveGame gains:  stories: StoryProgress;
```

- [ ] **Step 1: Write failing tests** in `tests/unit/SaveManager.test.ts`:
  - `createNewSave().stories` equals `{ done: [], offered: [] }`, `version` is 7.
  - `migrate({...validV6Save})` returns version 7 with `stories` equal to `{ done: [], offered: [] }` and `settings` unchanged (no `level` added).
  - `migrate` of a v7 save whose `stories` is missing or not an object returns a save with `{ done: [], offered: [] }` (repair, not rejection).
- [ ] **Step 2:** Run `npx vitest run tests/unit/SaveManager.test.ts`. Expected: the three new tests fail.
- [ ] **Step 3:** Add the types above; set `SAVE_VERSION = 7`; add migration `6: (save) => ({ ...save, stories: { done: [], offered: [] } })`; add `stories` to `createNewSave`; in `migrate`, after the loop, repair a non-object `stories`.
- [ ] **Step 4:** Run `npx vitest run tests/unit/SaveManager.test.ts`. Expected: PASS.
- [ ] **Step 5:** In the spec, change the "פיתה לסבא" row to: level 1 stuff and serve; level 2 falafel, salad, serve; level 3 falafel, serve, open the drinks fridge, serve lemonade, with the order written as words. (Level 2 with a drink would be five steps; the spec caps level 2 at three.) Add a short "שלב 1 של הסיפורים" plan entry to `docs/progress.md`, as CLAUDE.md asks at the start of a piece of work.
- [ ] **Step 6:** Commit: `git commit -am "Stories: save shape and migration to version 7"`.

---

### Task 2: Story data and the pure engine

**Files:**
- Create: `src/content/stories.ts`, `src/learning/StoryEngine.ts`
- Test: `tests/unit/StoryEngine.test.ts`

**Interfaces:**
- Consumes: `StoryLevel`, `StoryProgress` (Task 1); `Invitation['show']` from `src/content/invitations.ts`; `Activity` from `src/engine/DragSystem.ts`; `PropState`, `LocationId` from `src/types.ts`.
- Produces, in `src/content/stories.ts`:

```ts
/** What the child just did, reported by the Scene. */
export type StoryEvent =
  | { kind: 'tap'; prop: string }
  | { kind: 'state'; prop: string; key: string; value: unknown }
  | { kind: 'used'; source: string; target: string }
  | { kind: 'fed'; who: string; food: string; state: PropState }
  | { kind: 'surface'; id: string }
  | { kind: 'activity'; activity: Activity['kind'] };

export type StepDone =
  | { tap: string }
  | { state: { prop: string; key: string; value: unknown } }
  | { used: { source?: string; target: string } }
  | { fed: { who: string; food: string; state?: PropState } }
  | { surface: string }
  | { activity: Activity['kind'] };

export interface StoryStep {
  id: string;
  place: LocationId;
  /** Picture in the strip: a path under assets/art. */
  art: string;
  /** Level 3 only: a prop def id whose pointed name is written in the circle instead of the picture. */
  word?: string;
  line: string;
  show: Invitation['show'];
  done: StepDone;
}

export interface Story {
  id: string;
  start: LocationId;
  /** Characters that must be at `start` for the story to be offered. */
  needs: readonly string[];
  /** Prop instance ids put back as the place's data has them when the story starts. */
  resets: readonly string[];
  openLine: string;
  doneLine: string;
  steps: Record<StoryLevel, readonly StoryStep[]>;
}

export const STORIES: readonly Story[];
```

- Produces, in `src/learning/StoryEngine.ts`:

```ts
export const DEFAULT_LEVEL: StoryLevel = 2;
export function matches(done: StepDone, event: StoryEvent): boolean;
export function stepsOf(story: Story, level: StoryLevel): readonly StoryStep[];
/** The first story that starts here, is not done, not in `skipped`, and whose `needs` are all here. */
export function nextStory(
  stories: readonly Story[], progress: StoryProgress, place: LocationId,
  whereIs: (characterId: string) => LocationId | undefined, skipped: ReadonlySet<string>,
): Story | null;
/** Drops an active story that is unknown or whose step is past the end of this level's steps. */
export function sanitize(stories: readonly Story[], progress: StoryProgress, level: StoryLevel): StoryProgress;
export function advance(
  stories: readonly Story[], progress: StoryProgress, level: StoryLevel, event: StoryEvent, now: number,
): { progress: StoryProgress; outcome: 'none' | 'step' | 'finished' };
```

`advance` returns a new `StoryProgress` (never mutates). On `'finished'` the story id and `now` go into `done`, and `active` is removed. A `fed` condition with `state` requires every listed key to equal the event's `state` value. `sanitize` on an out-of-range step sets `step: 0` if the story still exists, else removes `active`.

- The one story, `id: 'pita'`, `start: 'falafel'`, `needs: ['falafel-2']`, `resets: ['falafel-falafel-pita', 'falafel-drinks-fridge', 'falafel-lemonade']`, `openLine: 'story.pita.open'`, `doneLine: 'story.pita.done'`. Steps (all `place: 'falafel'`):

| id | art | line | show | done |
|---|---|---|---|---|
| `fill` | `falafel/pita-full.svg` | `story.pita.fill` | drag prop `falafel-falafel-bowl` → prop `falafel-falafel-pita` | `used: { target: 'falafel-falafel-pita' }` |
| `falafel` | `falafel/falafel-bowl.svg` | `story.pita.fill` | same as `fill` | `used: { source: 'falafel-falafel-bowl', target: 'falafel-falafel-pita' }` |
| `salad` | `falafel/salad-bowl.svg` | `story.pita.salad` | drag prop `falafel-salad-bowl` → prop `falafel-falafel-pita` | `used: { source: 'falafel-salad-bowl', target: 'falafel-falafel-pita' }` |
| `serve` | `falafel/pita-full.svg` (level 3: `word: 'falafel-pita'`) | `story.pita.serve` | drag prop `falafel-falafel-pita` → surface `terrace-table-1` | `fed: { who: 'falafel-2', food: 'falafel-falafel-pita', state: { stuffed: true } }` |
| `fridge` | `falafel/drinks-fridge.svg` | `story.pita.fridge` | tap prop `falafel-drinks-fridge` | `state: { prop: 'falafel-drinks-fridge', key: 'open', value: true }` |
| `drink` | `falafel/lemonade.svg` (`word: 'lemonade'`) | `story.pita.drink` | drag prop `falafel-lemonade` → surface `terrace-table-1` | `fed: { who: 'falafel-2', food: 'falafel-lemonade' }` |

  Level 1: `fill`, `serve`. Level 2: `falafel`, `salad`, `serve`. Level 3: `falafel`, `serve`, `fridge`, `drink`.

- [ ] **Step 1: Write failing tests** in `tests/unit/StoryEngine.test.ts`:
  - `matches`: a `used` condition without `source` matches any source to that target; with `source`, only that one; `fed` with `state: { stuffed: true }` does **not** match an event whose `state` is `{}` (Review Focus 4); a `state` condition needs prop, key and value all equal.
  - `nextStory`: returns `pita` at `falafel`; `null` at `home`; `null` when `falafel-2` is at `home` (Review Focus 2); `null` when `pita` is in `done` or in `skipped`.
  - `advance`, level 1: with `active { id: 'pita', step: 0 }`, a `used` event to the pita gives `'step'` and step 1; an unrelated `tap` gives `'none'` and the same progress object; then a `fed` event with `state: { stuffed: true }` gives `'finished'`, `done` has `{ id: 'pita', at: now }`, `active` is undefined.
  - `advance` with no active story gives `'none'`.
  - A completed step stays completed: after `'step'`, no later event lowers `active.step` (Review Focus 4).
  - `sanitize`: unknown story id removes `active`; `step: 3` at level 1 becomes `step: 0` (Review Focus 3, 5); a valid active story is returned unchanged.
  - Every `line`, `openLine`, `doneLine` in `STORIES` exists in `voice-lines.json`; every `art` file exists under `assets/art`; every `word` is a def id in `src/content/props.ts`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/StoryEngine.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Write `stories.ts` and `StoryEngine.ts` to the interfaces above.
- [ ] **Step 4:** Add to `src/content/voice-lines.json`, all `"voice": "narrator", "proofread": false`:

| id | text |
|---|---|
| `story.pita.open` | סַבָּא רָעֵב! בּוֹאוּ נָכִין לוֹ פִּיתָּה. |
| `story.pita.fill` | שָׂמִים פָלָאפֶל בַּפִּיתָּה. |
| `story.pita.salad` | וְעַכְשָׁו סָלָט. |
| `story.pita.serve` | מַגִּישִׁים לְסַבָּא אֶת הַפִּיתָּה. |
| `story.pita.fridge` | פּוֹתְחִים אֶת הַמְּקָרֵר. |
| `story.pita.drink` | סַבָּא רוֹצֶה גַּם לִימוֹנָדָה. |
| `story.pita.done` | סַבָּא שָׂבֵעַ וּמְרֻצֶּה! |
| `story.later` | אוּלַי אַחַר כָּךְ. |

  Spell "פיתה" and "פלאפל" as the existing `invite.pita` line does.
- [ ] **Step 5:** Run `npx vitest run tests/unit/StoryEngine.test.ts tests/unit/voice.test.ts tests/unit/strings.test.ts`. Expected: PASS.
- [ ] **Step 6:** Commit: `git commit -am "Stories: content format, the pita story, and the engine"` (after `git add` of the new files).

---

### Task 3: The scene reports events; the game runs the story

**Files:**
- Modify: `src/engine/Scene.ts`, `src/app/actions.ts`, `src/app/Game.ts`, `src/app/testHook.ts`, `tests/e2e/helpers.ts`
- Test: `tests/unit/actions.test.ts`, `tests/e2e/stories.spec.ts` (new)

**Interfaces:**
- Consumes: Task 2's engine and `STORIES`.
- Produces:
  - `SceneContext.onStoryEvent?: (event: StoryEvent) => void`. `Scene` calls it at each existing `noteDone` call site (`tap`, `surface`, `activity`), in `eat` (`fed`, with the food's state **before** it is reset), where a `useOn` interaction applies (`used`, also when the target's state was already set), and where a `tap`/`toggle` interaction changes a prop's state (`state`, one event per changed key).
  - `Scene.resetProps(ids: readonly string[]): void` commits each listed instance back to its position, surface and state in `this.data.props` (the same "origin" lookup `eat` uses), outside the undo stack.
  - `actions.setStories(next: StoryProgress): void`, following the pattern of `setWallet`.
  - `TestHook.story(): { id: string; step: number; steps: string[] } | null` (the active story, with its step ids at the current level).
  - In `Game`: `private level(): StoryLevel` (`settings.level ?? DEFAULT_LEVEL`, or `?level=` in e2e); `private storiesAllowed(): boolean` (`settings.stories !== false`, and in e2e only with `&stories`); a session-only `private readonly storiesSkipped = new Set<string>()`.
- Behaviour in `Game`:
  - After load: `sanitize` the saved progress.
  - In `showScene()`: if allowed and no story is active, `nextStory(...)` for this place; if found, `scene.resetProps(story.resets)`, set `active: { id, step: 0 }`, add the id to `offered`, and `audio.sayAll([story.openLine, firstStep.line])`.
  - On each `StoryEvent`: `advance(...)`; on `'step'` save and `audio.say(nextStep.line)`; on `'finished'` save, `audio.sfx('success')`, the same star burst used when a letter is found, and `audio.say(story.doneLine)`.

- [ ] **Step 1: Write failing tests.**
  - `tests/unit/actions.test.ts`: `setStories` replaces `state.stories` and notifies subscribers.
  - `tests/e2e/helpers.ts`: `openGame(page, scene, options?: { stories?: boolean; level?: 1 | 2 | 3 })` appends `&stories` and `&level=N`.
  - `tests/e2e/stories.spec.ts`, all with `openGame(page, 'falafel', { stories: true, level })`:
    - *level 1 runs from opening line to celebration:* `story()` is `{ id: 'pita', step: 0, steps: ['fill', 'serve'] }`; `spoken()` contains `story.pita.open` then `story.pita.fill`; drag the falafel bowl onto the pita → `story().step` is 1 and `lastLine()` is `story.pita.serve`; drag the pita to `falafel-2` → `story()` is `null`, `state().stories.done[0].id` is `'pita'`, `spoken()` contains `story.pita.done`.
    - *level 2 has three steps and salad counts only after falafel:* dragging the salad bowl first leaves `step` at 0; falafel then salad then serving reaches `null`.
    - *an empty pita served does not finish the story* (level 1, skip the filling): `story().step` stays 0.
    - *the story continues after a reload:* complete step 0, `flushSave()`, reload with the same URL, `story().step` is 1.
    - *without `&stories` nothing starts:* `story()` is `null`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/actions.test.ts` and `npx playwright test tests/e2e/stories.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the interfaces and behaviour above.
- [ ] **Step 4:** Run `npm run lint && npm run test && npx playwright test tests/e2e/stories.spec.ts tests/e2e/falafel.spec.ts tests/e2e/invitations.spec.ts tests/e2e/wishes.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "Stories: the scene reports what happened and the game runs the pita story"`.

---

### Task 4: The step strip

**Files:**
- Create: `src/ui/StoryStrip.ts`, `assets/art/ui/guide.svg`
- Modify: `src/app/Game.ts`, `src/ui/Hud.ts`, `src/app/testHook.ts`, `src/engine/Scene.ts`
- Test: `tests/e2e/stories.spec.ts`, `tests/e2e/layout.spec.ts`

**Interfaces:**
- Produces, in `src/ui/StoryStrip.ts`:

```ts
export interface StripStep { art: string; /** Pointed text shown instead of the picture. */ word?: string }
export class StoryStrip {
  readonly view: Container;
  constructor(options: { onStep(index: number): void; onGuide(): void });
  /** Shows these steps, with `current` enlarged and pulsing; earlier ones coloured with a tick, later ones pale. */
  show(steps: readonly StripStep[], current: number): Promise<void>;
  setCurrent(index: number): void;
  hide(): void;
  layout(screen: { width: number; height: number }, safe: { top: number; left: number; right: number }): void;
  stepCenter(index: number): { x: number; y: number } | null;
  guideCenter(): { x: number; y: number } | null;
}
```

  - Layout: top centre, between the HUD buttons, inside the safe area. Right to left: the guide (hoopoe head, `ui/guide.svg`), then step 1, step 2, … Each circle is at least 64 points (the existing HUD button size rule: 64 when the screen is under 450 high, else 72); the current one is 1.2× and pulses gently (respect `prefers-reduced-motion`, as `tween.ts` does).
  - `guide.svg`: an original hoopoe head (crest, long beak), drawn to `docs/style-guide.md`. It must not resemble any existing character or brand.
  - `Scene.showHand(show: Invitation['show']): boolean` plays the ghost finger for a `show` if both ends are on screen (refactor `invitationPoints` to take a `show`), returning whether it played.
  - `Hud.setPulse(id: HudButtonId, on: boolean): void`.
  - `TestHook.storyStepCenter(index)`, `TestHook.storyGuideCenter()`.
- Behaviour in `Game`:
  - The strip is on the stage above the scene whenever a story is active, in a scene or on the map; hidden while the letter book, creator, gate or settings are open.
  - Tapping a step circle: `audio.sfx('tap')`; for the current step, say its line again (level 3 with `word`: say the prop's name line, then the step line) and `scene.showHand(step.show)`; for a done or future step, only say its line.
  - Tapping the guide: `audio.say('story.later')`, add the id to `storiesSkipped`, clear `active`, hide the strip.
  - Level 1: `scene.showHand` also plays when a step starts.
  - When the current step's `place` is not the place on screen, `hud.setPulse('map', true)`.
  - Level 3 with `word`: the circle shows the def's `nameHe` (with niqqud unless the parents turned it off), minimum 32px, in the project font.

- [ ] **Step 1: Write failing e2e tests** in `tests/e2e/stories.spec.ts`:
  - *the strip shows the steps right to left:* level 2, `storyStepCenter(0).x > storyStepCenter(1).x > storyStepCenter(2).x`, and `storyGuideCenter().x` is greater than all of them.
  - *tapping the current step says it again and shows the hand:* after the opening lines, tap `storyStepCenter(0)`; `lastLine()` is `story.pita.fill` and `ghostShowing()` is true.
  - *tapping the guide puts the story away:* `story()` becomes `null`, `lastLine()` is `story.later`, `storyStepCenter(0)` is `null`; leaving to the map and coming back does not start it again in this session.
  - *leaving mid-story keeps the strip* (Review Focus 1): complete step 0, go to the map: `storyStepCenter(1)` is not null; enter `home`: still not null; travel back to `falafel`: `story().step` is 1.
  - *level 1 shows the hand as the step starts:* `ghostShowing()` is true without any tap.
  - Screenshot `docs/screens/story-strip-${project}.png` at level 2 after one step, and `story-word-${project}.png` at level 3 on the serve step.
  - In `tests/e2e/layout.spec.ts`, for the four phone sizes: with a level-3 story active (four steps), every strip circle is fully on screen, outside the notch, and overlaps no HUD button.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/stories.spec.ts tests/e2e/layout.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Draw `guide.svg`; implement `StoryStrip`, `Scene.showHand`, `Hud.setPulse`, the hook additions and the `Game` behaviour.
- [ ] **Step 4:** Run the same command. Expected: PASS. Look at the two screenshots on both projects: nothing clipped, the word readable.
- [ ] **Step 5:** Commit: `git commit -am "Stories: the step strip, repeat on tap, put away with the guide"`.

---

### Task 5: One voice at a time (idle hints and wishes)

**Files:**
- Modify: `src/engine/Scene.ts`, `src/app/Game.ts`
- Test: `tests/e2e/stories.spec.ts`

**Interfaces:**
- Produces: `SceneContext.story?: { current(): { id: string; line: string; show: Invitation['show'] } | null }` — the current step if it belongs to this place, else null.
- Behaviour in `Scene`:
  - In the idle hint path, before `offerInvitation()`: if `ctx.story?.current()` is set and `invites.enabled()` and `invites.canSpeak()` and this step id has been repeated fewer than `INVITE_MAX_TIMES` times this visit, say its line, play the hand, call `invites.spoke()`, set `lastHint = 'story:<stepId>'`, and stop there. While a story step is current, general invitations are not offered.
  - While `ctx.story?.current()` is set, no new wish appears. A wish already showing stays until it is granted or times out.

- [ ] **Step 1: Write failing e2e tests** (open with `&stories&invites` and a short `wishMs`, as `invitations.spec.ts` and `wishes.spec.ts` do):
  - *an idle child is reminded of the current step, not a general invitation:* after the idle time, `lastHint()` is `'story:falafel'` at level 2 and `spoken()` ends with `story.pita.fill`.
  - *no wish appears during a story:* with a short `wishMs`, `wish()` stays `null` while `story()` is active, and becomes non-null after the guide is tapped.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/stories.spec.ts`. Expected: the two new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx playwright test tests/e2e/stories.spec.ts tests/e2e/invitations.spec.ts tests/e2e/wishes.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "Stories: idle reminders point at the current step, wishes wait"`.

---

### Task 6: Parents' settings — level and stories switch

**Files:**
- Modify: `src/ui/SettingsScreen.ts`, `src/content/parent.he.ts`, `src/app/Game.ts`
- Test: `tests/e2e/parents.spec.ts`, `tests/e2e/stories.spec.ts`

**Interfaces:**
- Consumes: `Game.changeSettings(patch: Partial<Settings>)` (exists), `sanitize` (Task 2).
- Produces: in the settings screen, next to the "invitations" switch: a "סיפורים" switch (`settings.stories`, on by default) and a three-way level choice labelled "גיל 3–4", "גיל 5–6", "גיל 7–8" (`settings.level`, 5–6 selected by default). Parent text, so no niqqud and no voice, in `parent.he.ts`.
- Behaviour in `Game.changeSettings`: when `level` changes and a story is active, set `active.step` to 0 and refresh the strip; when `stories` becomes false, clear `active` and hide the strip.

- [ ] **Step 1: Write failing e2e tests:**
  - `parents.spec.ts`: both controls are present; choosing "גיל 3–4" makes `state().settings.level` 1; turning the switch off makes `state().settings.stories` false; both survive a reload.
  - `stories.spec.ts` (without `&level`): *a level change mid-story restarts it* (Review Focus 3): at the default level complete two steps, set level 1 in settings, `story()` is `{ id: 'pita', step: 0, steps: ['fill', 'serve'] }`. *Stories off mid-story:* `story()` is `null` and `storyStepCenter(0)` is `null`; entering the stand again starts nothing.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/parents.spec.ts tests/e2e/stories.spec.ts`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "Stories: parents choose the age level and can switch stories off"`.

---

### Task 7: Voice, full run, and the hand-over to Dudu

**Files:**
- Modify: `public/audio/lines/*`, `public/audio/manifest.json` (generated), `docs/progress.md`, `docs/screens/story-*`

- [ ] **Step 1:** Run `npm run voice -- --dry-run --only story.` and check it lists exactly the 8 new lines (about 190 characters, under 2 cents).
- [ ] **Step 2:** Run `npm run voice -- --only story.`. Expected: 8 files written, manifest updated, nothing else re-recorded.
- [ ] **Step 3:** Run `npm run lint && npm run test && npm run e2e && npm run build`. Expected: all green; the build's voice and niqqud checks pass.
- [ ] **Step 4:** Play it by hand in `npm run dev` at each level (set in the parents' settings): listen to the 8 lines, and check the strip on a phone-sized window. No console errors.
- [ ] **Step 5:** Update `docs/progress.md`: what was built, the decisions (level 2 has no drink; stories start on entering the stand until the map guide exists; a story put away comes back next launch), and under "מחכה לדודו": play the story at three levels and say whether it fixes the "aimless" feeling; a name for the hoopoe; proofreading the 8 lines.
- [ ] **Step 6:** Commit: `git commit -am "Stories: voice for the pita story, screenshots, progress notes"`. Do not push.
