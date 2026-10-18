// Start flow, roster, steering, pause and restart in a real browser.
//
// Everything reads window.__cosmic, which src/app/test-hooks.ts installs only for
// ?test=1 and rebuilds on every access, so a poll can never latch onto a stale world.

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
  ticksOverFrames,
} from "./helpers";

test.describe("title screen", () => {
  test("boots to the title screen with the cast already in the arena", async ({ page }) => {
    await openGame(page);
    const title = page.locator(".cc-screen--title");
    await expect(title).toBeVisible();
    await expect(title).toHaveClass(/cc-screen-active/);
    await expect(page.getByRole("button", { name: "Start the run" })).toBeVisible();
    // Nothing simulates behind the menu.
    expect((await cosmic(page)).tick).toBe(0);
  });

  test("hides the test hooks unless ?test=1 asked for them", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cc-screen--title")).toBeVisible();
    expect(await page.evaluate(() => "__cosmic" in window)).toBe(false);
  });

  test("starts on a keypress and never leaves the arena unpaused behind a menu", async ({
    page,
  }) => {
    await openGame(page);
    await page.getByRole("button", { name: "Start the run" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.locator(".cc-screen--title")).not.toHaveClass(/cc-screen-active/);
  });
});

test.describe("the roster", () => {
  test("spawns all six characters from the seeded stream", async ({ page }) => {
    await openGame(page);
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
  });

  test("spawns the same roster twice for the same seed", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    const first = await cosmic(page);
    await openGame(page, { seed: FRIENDLY_SEED });
    const second = await cosmic(page);
    expect(second.entities.map((entity) => [entity.id, entity.x, entity.y])).toEqual(
      first.entities.map((entity) => [entity.id, entity.x, entity.y]),
    );
  });

  test("spawns a different roster for a different seed", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    const first = await cosmic(page);
    await openGame(page, { seed: FRIENDLY_SEED + 1 });
    const second = await cosmic(page);
    expect(second.entities.map((entity) => entity.x)).not.toEqual(
      first.entities.map((entity) => entity.x),
    );
  });

  test("gives every entity a live animation and a hull", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(30);
    for (const entity of (await cosmic(page)).entities) {
      expect(entity.anim, entity.id).not.toBe("");
      expect(entity.hp, entity.id).toBeGreaterThan(0);
      expect(entity.hp, entity.id).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("keyboard steering", () => {
  test("moves the capybara right when D is held", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    const before = playerOf(await cosmic(page));
    await holdKeys(page, ["right"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 15_000 })
      .toBeGreaterThan(before.x + 30);
    await releaseAll(page);
  });

  test("moves the capybara left, up and down with the other keys", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    for (const [key, axis] of [
      ["left", "x"],
      ["right", "x"],
      ["up", "y"],
      ["down", "y"],
    ] as const) {
      const before = playerOf(await cosmic(page));
      await holdKeys(page, [key]);
      const grew = axis === "x" ? before.x : before.y;
      const expectGrown = key === "right" || key === "down";
      await expect
        .poll(async () => {
          const player = playerOf(await cosmic(page));
          return expectGrown ? player[axis] : -player[axis];
        }, { timeout: 15_000 })
        .toBeGreaterThan(expectGrown ? grew : -grew);
      await releaseAll(page);
    }
  });

  test("mirrors the sprite when steering back the other way", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    await holdKeys(page, ["right"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).facing, { timeout: 15_000 })
      .toBe(1);
    await holdKeys(page, ["left"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).facing, { timeout: 15_000 })
      .toBe(-1);
    await releaseAll(page);
  });

  test("hops with Space and swims with the direction keys", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    await expect
      .poll(async () => playerOf(await cosmic(page)).anim, { timeout: 15_000 })
      .toBe("idle");
    await holdKeys(page, ["right"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).anim, { timeout: 15_000 })
      .toBe("walk");
    await releaseAll(page);
    await page.keyboard.down("Space");
    await expect
      .poll(async () => playerOf(await cosmic(page)).anim, { timeout: 15_000 })
      .toBe("jump");
    await page.keyboard.up("Space");
  });

  test("fires the primary action with J", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    await page.keyboard.down("KeyJ");
    // The tarantula reacts to exactly one laser, so its reaction state is the browser
    // visible proof that the action event reached the simulation.
    await expect.poll(async () => stateOf(page, "tarantula"), { timeout: 15_000 }).toBe("react");
    await page.keyboard.up("KeyJ");
  });
});

test.describe("the orca", () => {
  test("measurably closes the distance to the player", async ({ page }) => {
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
        { timeout: 25_000, intervals: [100] },
      )
      .toBeLessThan(startGap - 80);
  });

  test("reacts to the player moving away", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    const start = await cosmic(page);
    const orca = ofKind(start, "orca")[0];
    if (orca === undefined) throw new Error("no orca");
    // Steer directly away from the orca for the whole measurement.
    const away = orca.x > playerOf(start).x ? "left" : "right";
    await holdKeys(page, [away]);
    const startGap = orcaGap(start);
    let smallest = startGap;
    await expect
      .poll(
        async () => {
          smallest = Math.min(smallest, orcaGap(await cosmic(page)));
          return smallest;
        },
        { timeout: 25_000, intervals: [100] },
      )
      .toBeLessThan(startGap - 60);
    await releaseAll(page);
  });

  test("telegraphs and lunges, and the lunge hurts the player", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    await expect
      .poll(async () => stateOf(page, "orca"), { timeout: 25_000, intervals: [100] })
      .toBe("lunge");
    await expect
      .poll(async () => playerOf(await cosmic(page)).hp, { timeout: 25_000 })
      .toBeLessThan(1);
  });
});

test.describe("the snail's time field", () => {
  test("drops the player's time scale below one and matches the field", async ({ page }) => {
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
      { timeout: 30_000 },
    );

    await expect
      .poll(async () => playerOf(await cosmic(page)).inTimeField, { timeout: 30_000 })
      .toBe(true);
    const inside = playerOf(await cosmic(page));
    expect(inside.timeScale).toBeLessThan(1);
    expect(inside.timeScale).toBeCloseTo(manifest.arena.timeScaleInside, 5);

    // The world readout the HUD shows follows the player.
    expect((await cosmic(page)).timeScale).toBeCloseTo(manifest.arena.timeScaleInside, 5);
    await expect(page.locator("[data-cc-time-scale]")).toHaveText(/0\.45/);
    await expect(page.locator("[data-cc-field]")).toHaveAttribute("data-cc-field", "in");
  });

  test("leaves an entity outside the field at exactly one", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    await driveToward(
      page,
      async () => {
        const snapshot = await cosmic(page);
        return { x: snapshot.fieldX, y: snapshot.fieldY };
      },
      (player) => player.inTimeField,
      { timeout: 30_000 },
    );
    await expect
      .poll(async () => playerOf(await cosmic(page)).inTimeField, { timeout: 30_000 })
      .toBe(true);

    const snapshot = await cosmic(page);
    const outside = snapshot.entities.filter((entity) => !entity.inTimeField);
    expect(outside.length).toBeGreaterThan(0);
    for (const entity of outside) {
      expect(entity.timeScale, entity.id).toBe(1);
    }
    const inside = snapshot.entities.filter((entity) => entity.inTimeField);
    for (const entity of inside) {
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
      { timeout: 30_000 },
    );
    await expect
      .poll(async () => playerOf(await cosmic(page)).inTimeField, { timeout: 30_000 })
      .toBe(true);

    // Drive to the far side of the arena, well outside the field radius.
    await driveToward(
      page,
      async () => {
        const snapshot = await cosmic(page);
        return { x: snapshot.fieldX + snapshot.fieldRadius * 4, y: snapshot.fieldY };
      },
      (player) => !player.inTimeField,
      { timeout: 30_000 },
    );
    await expect
      .poll(async () => playerOf(await cosmic(page)).timeScale, { timeout: 30_000 })
      .toBe(1);
    await expect(page.locator("[data-cc-field]")).toHaveAttribute("data-cc-field", "out");
  });
});

test.describe("pause and restart", () => {
  test("freezes the simulation while paused and resumes on demand", async ({ page }) => {
    await openGame(page);
    await startWithKeyboard(page);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(20);

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator(".cc-screen--pause")).toHaveClass(/cc-screen-active/);
    // A paused world reports the same tick on every single frame.
    await expect.poll(async () => ticksOverFrames(page), { timeout: 5_000 }).toHaveLength(1);
    const frozen = (await cosmic(page)).tick;
    expect(frozen).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.locator(".cc-screen--pause")).not.toHaveClass(/cc-screen-active/);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(
      frozen,
    );
  });

  test("restarts on the same seed and deals the same opening again", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    const opening = await cosmic(page);
    expect(opening.tick).toBe(0);

    await startWithKeyboard(page);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(60);
    await holdKeys(page, ["right"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 15_000 })
      .toBeGreaterThan(opening.entities[0]?.x ?? 0);
    await releaseAll(page);

    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Restart" }).click();
    await expect(page.locator(".cc-screen--pause")).not.toHaveClass(/cc-screen-active/);

    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(0);
    const restarted = await cosmic(page);
    expect(restarted.seed).toBe(opening.seed);
    expect(restarted.fieldRadius).toBe(opening.fieldRadius);
    expect(restarted.entities.map((entity) => [entity.id, entity.x, entity.y, entity.hp])).toEqual(
      opening.entities.map((entity) => [entity.id, entity.x, entity.y, entity.hp]),
    );
  });

  test("keeps the seed shown in the HUD and never invents a new one", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await expect(page.locator("[data-cc-seed]")).toHaveText(`seed ${String(FRIENDLY_SEED)}`);
    await startWithKeyboard(page);
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Restart" }).click();
    await expect(page.locator("[data-cc-seed]")).toHaveText(`seed ${String(FRIENDLY_SEED)}`);
  });
});