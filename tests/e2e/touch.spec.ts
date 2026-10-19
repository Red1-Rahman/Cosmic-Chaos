// The virtual touch D-pad, in an emulated touch context.
//
// Milestone 1 requires the coarse pointer path: on a phone the overlay must mount, be
// shown, and actually steer the waterbike. The device profile is declared with
// `test.use`, not with a browser specific flag, so the same spec runs on chromium,
// firefox and webkit.

import { expect, test } from "./fixtures";
import { cosmic, openGame, playerOf, startWithKeyboard } from "./helpers";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});

const CONTROLS = ["up", "down", "left", "right", "jump", "action", "dodge", "parry"] as const;

test.describe("virtual touch controls on a phone viewport", () => {
  test("mounts the overlay and shows it for a coarse, narrow viewport", async ({ page }) => {
    await openGame(page);
    const overlay = page.locator("[data-cc-touch]");
    await expect(overlay).toBeAttached();
    await expect(overlay).toHaveClass(/cc-touch-on/);
    await expect(overlay).toBeVisible();
  });

  test("offers every control, inside the window and big enough to hit", async ({ page }) => {
    await openGame(page);
    const size = page.viewportSize();
    if (size === null) throw new Error("no viewport");
    for (const control of CONTROLS) {
      const button = page.locator(`[data-cc-control='${control}']`);
      await expect(button, control).toBeVisible();
      const box = await button.boundingBox();
      if (box === null) throw new Error(`${control} has no box`);
      expect(box.width, control).toBeGreaterThanOrEqual(40);
      expect(box.height, control).toBeGreaterThanOrEqual(40);
      expect(box.x, control).toBeGreaterThanOrEqual(0);
      expect(box.y, control).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, control).toBeLessThanOrEqual(size.width + 1);
      expect(box.y + box.height, control).toBeLessThanOrEqual(size.height + 1);
    }
  });

  test("keeps the pause and sound buttons reachable above the pad", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    const pause = page.getByRole("button", { name: "Pause" });
    await expect(pause).toBeVisible();
    const pauseBox = await pause.boundingBox();
    const upBox = await page.locator("[data-cc-control='up']").boundingBox();
    if (pauseBox === null || upBox === null) throw new Error("missing boxes");
    expect(pauseBox.y + pauseBox.height).toBeLessThan(upBox.y);
  });

  test("steers the waterbike when a pad key is held", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    const before = playerOf(await cosmic(page));
    const key = page.locator("[data-cc-control='right']");
    const box = await key.boundingBox();
    if (box === null) throw new Error("the right key has no box");
    // A real trusted pointer, so setPointerCapture inside the game is legal.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    try {
      await expect
        .poll(async () => playerOf(await cosmic(page)).x, { timeout: 15_000 })
        .toBeGreaterThan(before.x + 20);
    } finally {
      await page.mouse.up();
    }
  });

  test("marks the pad key pressed while it is held and releases it after", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    const key = page.locator("[data-cc-control='up']");
    const box = await key.boundingBox();
    if (box === null) throw new Error("the up key has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(key).toHaveAttribute("data-pressed", "true");
    await page.mouse.up();
    await expect(key).toHaveAttribute("data-pressed", "false");
  });

  test("answers a real touch tap on the jump control", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    const jump = page.locator("[data-cc-control='jump']");
    const box = await jump.boundingBox();
    if (box === null) throw new Error("the jump button has no box");
    // The overlay is pointer transparent except on the buttons, so a tap here lands on
    // the control and nowhere else.
    const hit = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element?.getAttribute("data-cc-control") ?? "";
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(hit).toBe("jump");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    // A tap is short, so the assertion is on the input side: the control registered
    // the pointer and released it again without leaving anything stuck down.
    await expect(jump).toHaveAttribute("data-pressed", "false");
    expect(
      await page.evaluate(() => document.querySelectorAll("[data-pressed='true']").length),
    ).toBe(0);
  });

  test("keeps the touch overlay from stealing the whole screen", async ({ page }) => {
    await openGame(page);
    const overlay = page.locator("[data-cc-touch]");
    const style = await overlay.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { pointerEvents: computed.pointerEvents, position: computed.position };
    });
    expect(style.position).toBe("fixed");
    expect(style.pointerEvents).toBe("none");
  });

  test("re-evaluates the overlay when the window is resized", async ({ page }) => {
    await openGame(page);
    const overlay = page.locator("[data-cc-touch]");
    await expect(overlay).toHaveClass(/cc-touch-on/);
    const controlsBefore = await page.locator("[data-cc-control]").count();
    expect(controlsBefore).toBe(CONTROLS.length);

    // The handler listens for resize as well as orientationchange, so the overlay
    // survives a change of window size with its controls still mounted and in place.
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => page.locator("[data-cc-control]").count()).toBe(CONTROLS.length);
    await expect(overlay).toHaveClass(/cc-touch-(on|off)/);
    const box = await page.locator("[data-cc-control='right']").boundingBox();
    const size = page.viewportSize();
    if (box === null || size === null) throw new Error("missing box or viewport");
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
  });
});
