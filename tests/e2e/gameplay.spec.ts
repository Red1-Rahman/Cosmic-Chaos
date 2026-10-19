// Start flow, roster, steering, pause and restart in a real browser.
//
// Everything reads window.__cosmic, which src/app/test-hooks.ts installs only for
// ?test=1 and rebuilds on every access, so a poll can never latch onto a stale world.
//
// The suite is deliberately lean: every test loads the whole art manifest into a real
// browser, so neighbouring assertions that share one page load are grouped together
// rather than spread across a dozen navigations.

import { expect, test } from "./fixtures";
import {
  FRIENDLY_SEED,
  cosmic,
  driveToward,
  holdKeys,
  manifest,
  ofKind,
  openGame,
  orcaGap,
  playerOf,
  releaseAll,
  startWithKeyboard,
  stateOf,
  statesOverFrames,
  ticksOverFrames,
} from "./helpers";

test.describe("title screen", () => {
  test("boots to the title screen with the cast already in the arena and nothing simulating", async ({
    page,
  }) => {
    await openGame(page);
    const title = page.locator(".cc-screen--title");
    await expect(title).toBeVisible();
    await expect(title).toHaveClass(/cc-screen-active/);
    await expect(page.getByRole("button", { name: "Start the run" })).toBeVisible();
    expect((await cosmic(page)).tick).toBe(0);
  });

  test("hides the test hooks unless ?test=1 asked for them", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cc-screen--title")).toBeVisible();
    expect(await page.evaluate(() => "__cosmic" in window)).toBe(false);
  });
});

test.describe("starting and steering", () => {
  test("starts on a keypress and the waterbike answers every direction key", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await page.getByRole("button", { name: "Start the run" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.locator(".cc-screen--title")).not.toHaveClass(/cc-screen-active/);

    // Idle first: nothing is held, so the bike is parked and plays idle.
    await expect.poll(async () => playerOf(await cosmic(page)).anim, { timeout: 10_000 }).toBe(
      "idle",
    );

    // Right: the capybara moves right, faces right and walks.
    const start = playerOf(await cosmic(page));
    await holdKeys(page, ["right"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 20_000 })
      .toBeGreaterThan(start.x + 30);
    await expect.poll(async () => playerOf(await cosmic(page)).facing, { timeout: 20_000 }).toBe(1);
    await expect.poll(async () => playerOf(await cosmic(page)).anim, { timeout: 20_000 }).toBe(
      "walk",
    );

    // Left: back the other way, mirrored.
    const turned = playerOf(await cosmic(page));
    await holdKeys(page, ["left"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 20_000 })
      .toBeLessThan(turned.x - 30);
    await expect.poll(async () => playerOf(await cosmic(page)).facing, { timeout: 20_000 }).toBe(-1);

    // Up and down: the other axis, and a swim pose rather than a walk.
    await holdKeys(page, ["down"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).y, { timeout: 20_000 })
      .toBeGreaterThan(turned.y + 20);
    await holdKeys(page, ["up"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).y, { timeout: 20_000 })
      .toBeLessThan(turned.y);
    await releaseAll(page);
  });

  test("hops with Space and fires the primary action with J", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);

    await page.keyboard.down("Space");
    await expect.poll(async () => playerOf(await cosmic(page)).anim, { timeout: 10_000 }).toBe(
      "jump",
    );
    await page.keyboard.up("Space");
    await expect.poll(async () => playerOf(await cosmic(page)).anim, { timeout: 10_000 }).toBe(
      "idle",
    );

    // The tarantula reacts to exactly one laser, so its reaction state is the browser
    // visible proof that the action event reached the simulation.
    await page.keyboard.down("KeyJ");
    await expect.poll(async () => stateOf(page, "tarantula"), { timeout: 20_000 }).toBe("react");
    await page.keyboard.up("KeyJ");
  });

  test("spawns all six characters from the seeded stream, and repeats that opening", async ({
    page,
  }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    const snapshot = await cosmic(page);
    for (const kind of ["player", "orca", "shark", "tarantula", "snail"]) {
      expect(ofKind(snapshot, kind), kind).toHaveLength(1);
    }
    const humans = ofKind(snapshot, "human");
    expect(manifest.characters["human"]).toBeDefined();
    expect(humans.length).toBeGreaterThanOrEqual(3);
    expect(humans.length).toBeLessThanOrEqual(6);
    expect(new Set(snapshot.entities.map((entity) => entity.id)).size).toBe(
      snapshot.entities.length,
    );
    for (const entity of snapshot.entities) {
      expect(entity.anim, entity.id).not.toBe("");
      expect(entity.hp, entity.id).toBeGreaterThan(0);
      expect(entity.hp, entity.id).toBeLessThanOrEqual(1);
    }

    // The same seed always deals the same arena.
    await openGame(page, { seed: FRIENDLY_SEED });
    const again = await cosmic(page);
    expect(again.entities.map((entity) => [entity.id, entity.x, entity.y])).toEqual(
      snapshot.entities.map((entity) => [entity.id, entity.x, entity.y]),
    );

    // A different seed does not.
    await openGame(page, { seed: FRIENDLY_SEED + 1 });
    const other = await cosmic(page);
    expect(other.entities.map((entity) => entity.x)).not.toEqual(
      snapshot.entities.map((entity) => entity.x),
    );
  });
});

test.describe("the orca", () => {
  test("closes on the player, telegraphs, lunges and hurts", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);

    const startGap = orcaGap(await cosmic(page));
    let smallest = startGap;
    await expect
      .poll(
        async () => {
          smallest = Math.min(smallest, orcaGap(await cosmic(page)));
          return smallest;
        },
        { timeout: 20_000, intervals: [100] },
      )
      .toBeLessThan(startGap - 80);

    // The wind-up is short, so the whole state cycle is sampled inside the page.
    const seen = await statesOverFrames(page, "orca", 3000);
    expect(seen).toContain("chase");
    expect(seen).toContain("telegraph");
    expect(seen).toContain("lunge");
    await expect
      .poll(async () => playerOf(await cosmic(page)).hp, { timeout: 20_000 })
      .toBeLessThan(1);
  });

  test("keeps closing even when the player drives away from it", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    const start = await cosmic(page);
    const orca = ofKind(start, "orca")[0];
    if (orca === undefined) throw new Error("no orca");
    const away = orca.x > playerOf(start).x ? "left" : "right";
    await holdKeys(page, [away]);
    try {
      const startGap = orcaGap(start);
      let smallest = startGap;
      await expect
        .poll(
          async () => {
            smallest = Math.min(smallest, orcaGap(await cosmic(page)));
            return smallest;
          },
          { timeout: 20_000, intervals: [100] },
        )
        .toBeLessThan(startGap - 60);
    } finally {
      await releaseAll(page);
    }
  });
});

test.describe("the snail's time field", () => {
  test("changes the tick rate of what is inside it and only of what is inside it", async ({
    page,
  }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);

    const outside = playerOf(await cosmic(page));
    expect(outside.inTimeField).toBe(false);
    expect(outside.timeScale).toBe(1);

    await driveToward(
      page,
      async () => {
        const snapshot = await cosmic(page);
        return { x: snapshot.fieldX, y: snapshot.fieldY };
      },
      (player) => player.inTimeField,
      { timeout: 25_000 },
    );
    await expect
      .poll(async () => playerOf(await cosmic(page)).inTimeField, { timeout: 25_000 })
      .toBe(true);

    const inside = playerOf(await cosmic(page));
    expect(inside.timeScale).toBeLessThan(1);
    expect(inside.timeScale).toBeCloseTo(manifest.arena.timeScaleInside, 5);
    // The world readout the HUD shows follows the player.
    expect((await cosmic(page)).timeScale).toBeCloseTo(manifest.arena.timeScaleInside, 5);
    await expect(page.locator("[data-cc-time-scale]")).toHaveText(/0\.45/);
    await expect(page.locator("[data-cc-field]")).toHaveAttribute("data-cc-field", "in");

    const snapshot = await cosmic(page);
    const stillOutside = snapshot.entities.filter((entity) => !entity.inTimeField);
    expect(stillOutside.length).toBeGreaterThan(0);
    for (const entity of stillOutside) {
      expect(entity.timeScale, entity.id).toBe(1);
    }
    for (const entity of snapshot.entities.filter((entity) => entity.inTimeField)) {
      expect(entity.timeScale, entity.id).toBeCloseTo(manifest.arena.timeScaleInside, 5);
    }
  });

  test("puts the player back at one after leaving the field", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    await driveToward(
      page,
      async () => {
        const snapshot = await cosmic(page);
        return { x: snapshot.fieldX, y: snapshot.fieldY };
      },
      (player) => player.inTimeField,
      { timeout: 25_000 },
    );
    await expect
      .poll(async () => playerOf(await cosmic(page)).inTimeField, { timeout: 25_000 })
      .toBe(true);

    // Drive to the far side of the arena, well outside the field radius.
    await driveToward(
      page,
      async () => {
        const snapshot = await cosmic(page);
        return { x: snapshot.fieldX + snapshot.fieldRadius * 4, y: snapshot.fieldY };
      },
      (player) => !player.inTimeField,
      { timeout: 25_000 },
    );
    await expect
      .poll(async () => playerOf(await cosmic(page)).timeScale, { timeout: 25_000 })
      .toBe(1);
    await expect(page.locator("[data-cc-field]")).toHaveAttribute("data-cc-field", "out");
  });
});

test.describe("pause and restart", () => {
  test("freezes the simulation while paused and resumes on demand", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 20_000 }).toBeGreaterThan(20);

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator(".cc-screen--pause")).toHaveClass(/cc-screen-active/);
    // A paused world reports the same tick on every single frame.
    await expect.poll(async () => ticksOverFrames(page), { timeout: 5_000 }).toHaveLength(1);
    const frozen = (await cosmic(page)).tick;
    expect(frozen).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.locator(".cc-screen--pause")).not.toHaveClass(/cc-screen-active/);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 20_000 }).toBeGreaterThan(
      frozen,
    );
  });

  test("restarts on the same seed and deals the same opening again", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    const opening = await cosmic(page);
    expect(opening.tick).toBe(0);
    await expect(page.locator("[data-cc-seed]")).toHaveText(`seed ${String(FRIENDLY_SEED)}`);

    await startWithKeyboard(page);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 20_000 }).toBeGreaterThan(20);

    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Restart" }).click();
    await expect(page.locator(".cc-screen--pause")).not.toHaveClass(/cc-screen-active/);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 20_000 }).toBeGreaterThan(0);

    const restarted = await cosmic(page);
    expect(restarted.seed).toBe(opening.seed);
    expect(restarted.fieldRadius).toBe(opening.fieldRadius);
    expect(restarted.entities.map((entity) => entity.id)).toEqual(
      opening.entities.map((entity) => entity.id),
    );
    for (const entity of restarted.entities) {
      const before = opening.entities.find((other) => other.id === entity.id);
      expect(before, entity.id).toBeDefined();
      if (before === undefined) continue;
      // Hull and time scale are reset exactly; position is the opening position to
      // within the handful of pixels one or two frames of drift can move.
      expect(entity.hp, entity.id).toBe(before.hp);
      expect(entity.timeScale, entity.id).toBe(1);
      expect(Math.abs(entity.x - before.x), entity.id).toBeLessThan(40);
      expect(Math.abs(entity.y - before.y), entity.id).toBeLessThan(40);
    }
    await expect(page.locator("[data-cc-seed]")).toHaveText(`seed ${String(FRIENDLY_SEED)}`);
  });
});