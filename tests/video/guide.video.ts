// Records the parents' video guide: plays the game for real, one narration segment at a time,
// with a caption and a visible "finger". Run through scripts/guide-video.ts, which records the
// narration first and adds it to the video afterwards.
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import {
  propCenter,
  tap,
  tapToStart,
  touchDrag,
  touchHold,
} from "../e2e/helpers";

interface Narrated {
  id: string;
  text: string;
  durationMs: number;
}

const DIR = ".voice-samples/guide";
const narration = JSON.parse(
  readFileSync(`${DIR}/narration.json`, "utf8"),
) as Narrated[];

// Only in this recording: a caption box, and a soft circle wherever the finger is.
const overlay = () => {
  // Runs before the page has a <head>: wait for the document first.
  addEventListener("DOMContentLoaded", () => {
    const css = document.createElement("style");
    css.textContent = `
    #guide-caption { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
      width: min(92%, 1000px); padding: 14px 22px; border-radius: 18px; direction: rtl;
      background: rgb(59 47 47 / 80%); color: #fff; font: 700 26px/1.4 Rubik, sans-serif;
      text-align: center; pointer-events: none; z-index: 10; }
    #guide-finger { position: fixed; width: 54px; height: 54px; margin: -27px 0 0 -27px;
      border-radius: 50%; background: rgb(255 194 60 / 45%); border: 4px solid #ffc23c;
      pointer-events: none; z-index: 11; display: none; }`;
    document.head.append(css);
    const finger = document.createElement("div");
    finger.id = "guide-finger";
    const place = (event: PointerEvent) => {
      finger.style.left = `${event.clientX}px`;
      finger.style.top = `${event.clientY}px`;
    };
    addEventListener(
      "pointerdown",
      (event) => {
        place(event);
        finger.style.display = "block";
      },
      true,
    );
    addEventListener("pointermove", place, true);
    addEventListener("pointerup", () => (finger.style.display = "none"), true);
    document.body.append(finger);
  });
};

test("parents video guide", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const t0 = Date.now();
  const timeline: Array<{ id: string; atMs: number }> = [];
  await page.addInitScript(overlay);

  /** Shows a segment's caption, runs its actions, and waits until its narration is over. */
  const segment = async (
    id: string,
    actions: () => Promise<void> = async () => {},
  ) => {
    const line = narration.find((n) => n.id === id);
    if (!line) throw new Error(`No narration ${id}`);
    const start = Date.now();
    timeline.push({ id, atMs: start - t0 });
    await page.evaluate((text) => {
      let caption = document.getElementById("guide-caption");
      if (!caption) {
        caption = document.createElement("div");
        caption.id = "guide-caption";
        document.body.append(caption);
      }
      caption.textContent = text;
    }, line.text);
    await actions();
    const left = line.durationMs + 600 - (Date.now() - start);
    if (left > 0) await page.waitForTimeout(left);
  };
  const hook = <T>(read: () => T) => page.evaluate(read);

  await page.goto("./?e2e");
  await page.waitForFunction(() => window.__shchuna?.stage === "start");

  await segment("intro");
  await tapToStart(page);
  await segment("map");
  await segment("bet", async () => {
    await tap(page, (await hook(() => window.__shchuna!.mapCenter?.("home")))!);
    await page.waitForFunction(
      () =>
        window.__shchuna?.stage === "playing" &&
        window.__shchuna.here() === "home",
      undefined,
      { timeout: 30_000 },
    );
  });
  await segment("tap", async () => {
    await page.waitForTimeout(800);
    await tap(page, await propCenter(page, "fridge"));
  });
  await segment("drag", async () => {
    const scale = page.viewportSize()!.height / 600;
    const table = await propCenter(page, "kitchen-table");
    await touchDrag(
      page,
      await propCenter(page, "milk"),
      { x: table.x - 40 * scale, y: table.y - 60 * scale },
      300,
    );
  });
  await segment("letter", async () => {
    await page.waitForTimeout(600);
    await tap(
      page,
      (await hook(() => window.__shchuna!.letterCenter("bread")))!,
    );
  });
  await segment("move", async () => {
    await page.waitForTimeout(1500);
    for (let i = 0; i < 2; i++) {
      const arrow = await hook(() => window.__shchuna!.arrowCenter("left"));
      if (arrow) await tap(page, arrow);
      await page.waitForTimeout(1600);
    }
  });
  await segment("buttons", async () => {
    await page.waitForTimeout(2500);
    await tap(page, await hook(() => window.__shchuna!.hudCenter("book")));
    await page.waitForTimeout(3500);
    const done = await hook(() => window.__shchuna!.bookCenter?.("done"));
    if (done) await tap(page, done);
  });
  await segment("parents", async () => {
    await page.waitForTimeout(800);
    await touchHold(
      page,
      await hook(() => window.__shchuna!.hudCenter("lock")),
      2400,
    );
  });
  await page.waitForTimeout(1500);

  writeFileSync(`${DIR}/timeline.json`, JSON.stringify(timeline, null, 2));
});
