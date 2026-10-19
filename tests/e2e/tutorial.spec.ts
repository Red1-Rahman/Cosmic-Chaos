// The staged onboarding: one idea at a time, and only when it is asked for.
//
// `?tutorial=1` forces the tutorial on even under the test hooks, so a spec can drive
// it; the hooks' usual `?test=1` run stays tutorial-off with the full roster.

import { expect, test } from "./fixtures";
import { FRIENDLY_SEED, cosmic, holdKeys, openGame, playThroughHome, releaseAll } from "./helpers";

test.describe("staged tutorial", () => {
  test("opens on the rider alone and hands the cores over once the player rides", async ({
    page,
  }) => {
    await openGame(page, { seed: FRIENDLY_SEED, tutorial: true });
    await playThroughHome(page);
    await expect
      .poll(async () => (await cosmic(page)).tick, { timeout: 10_000 })
      .toBeGreaterThan(0);

    // The first card is up and only the rider is on the water.
    const card = page.locator("[data-cc-tutorial]");
    await expect(card).toHaveAttribute("data-cc-tutorial", "0");
    await expect(page.locator(".cc-tutorial-title")).toHaveText("Pilot the waterbike");
    const opening = await cosmic(page);
    expect(opening.entities.map((entity) => entity.kind)).toEqual(["player"]);
    expect(opening.coresLeft).toBe(0);

    // Ride right: the opening stage closes and the cores surface, still with no cast.
    await holdKeys(page, ["right"]);
    await expect(card).toHaveAttribute("data-cc-tutorial", "1", { timeout: 20_000 });
    await releaseAll(page);
    const revealed = await cosmic(page);
    expect(revealed.coresLeft).toBeGreaterThan(0);
    expect(revealed.entities.map((entity) => entity.kind)).toEqual(["player"]);
  });

  test("keeps the full roster and no card when the tutorial is not asked for", async ({ page }) => {
    await openGame(page);
    await playThroughHome(page);
    await expect
      .poll(async () => (await cosmic(page)).tick, { timeout: 10_000 })
      .toBeGreaterThan(0);

    await expect(page.locator("[data-cc-tutorial]")).toHaveCount(0);
    const snapshot = await cosmic(page);
    const kinds = new Set(snapshot.entities.map((entity) => entity.kind));
    for (const kind of ["player", "orca", "shark", "snail", "tarantula", "human"]) {
      expect(kinds.has(kind)).toBe(true);
    }
    expect(snapshot.coresLeft).toBeGreaterThan(0);
  });
});
