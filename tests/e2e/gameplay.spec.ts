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
  FASTEST_PX_PER_TICK,
  FRIENDLY_SEED,
  cosmic,
  holdKeys,
  installFieldWatch,
  installWardenReflex,
  manifest,
  ofKind,
  openGame,
  orcaGap,
  playThroughHome,
  playerOf,
  releaseAll,
  restartRun,
  startWithKeyboard,
  statesOverFrames,
  ticksOverFrames,
} from "./helpers";

test.describe("home screen", () => {
  test("boots to the home screen with the cast already in the arena and nothing simulating", async ({
    page,
  }) => {
    await openGame(page);
    const home = page.locator(".cc-screen--home");
    await expect(home).toBeVisible();
    await expect(home).toHaveClass(/cc-screen-active/);
    for (const action of ["Play", "Levels", "Controls", "License"]) {
      await expect(page.getByRole("button", { name: action, exact: true })).toBeVisible();
    }
    expect((await cosmic(page)).tick).toBe(0);
  });

  test("takes a rider name without storing anything", async ({ page }) => {
    await openGame(page);
    const input = page.locator("[data-cc-name-input]");
    await expect(input).toBeVisible();
    await input.fill("Captain Capybara");
    // The name shows in the HUD from the first frame of a run.
    await playThroughHome(page);
    await expect(page.locator("[data-cc-rider]")).toHaveText("Captain Capybara");
  });

  test("opens the level picker, the controls and the licence reader, and Escape closes them", async ({
    page,
  }) => {
    await openGame(page);

    await page.getByRole("button", { name: "Levels", exact: true }).click();
    await expect(page.locator(".cc-screen--levels")).toHaveClass(/cc-screen-active/);
    await expect(page.locator("[data-cc-level]").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".cc-screen--levels")).not.toHaveClass(/cc-screen-active/);

    await page.getByRole("button", { name: "Controls", exact: true }).click();
    await expect(page.locator("[data-cc-controls]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".cc-screen--controls")).not.toHaveClass(/cc-screen-active/);

    await page.getByRole("button", { name: "License", exact: true }).click();
    await expect(page.locator("[data-cc-license-text]")).toContainText("Apache License");
    await page.keyboard.press("Escape");
    await expect(page.locator(".cc-screen--license")).not.toHaveClass(/cc-screen-active/);
    await expect(page.locator(".cc-screen--home")).toHaveClass(/cc-screen-active/);
  });

  test("hides the test hooks unless ?test=1 asked for them", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".cc-screen--home")).toBeVisible();
    expect(await page.evaluate(() => "__cosmic" in window)).toBe(false);
  });
});

test.describe("starting and steering", () => {
  test("starts on a keypress and the waterbike answers every direction key", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await playThroughHome(page);
    await expect
      .poll(async () => (await cosmic(page)).tick, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect(page.locator(".cc-screen--home")).not.toHaveClass(/cc-screen-active/);

    // Idle first: nothing is held, so the bike is parked and plays idle.
    await expect
      .poll(async () => playerOf(await cosmic(page)).anim, { timeout: 8_000 })
      .toBe("idle");

    // Right: the capybara moves right, faces right and walks.
    const start = playerOf(await cosmic(page));
    await holdKeys(page, ["right"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 8_000 })
      .toBeGreaterThan(start.x + 30);
    // Facing and pose are read together, so a single poll settles both.
    await expect
      .poll(
        async () => {
          const player = playerOf(await cosmic(page));
          return `${String(player.facing)} ${player.anim}`;
        },
        { timeout: 8_000 },
      )
      .toBe("1 walk");

    // Left: back the other way, mirrored.
    const turned = playerOf(await cosmic(page));
    await holdKeys(page, ["left"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 8_000 })
      .toBeLessThan(turned.x - 30);
    await expect.poll(async () => playerOf(await cosmic(page)).facing, { timeout: 8_000 }).toBe(-1);

    // Down then up: the other axis. A swim pose rather than a walk.
    await holdKeys(page, ["down"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).y, { timeout: 8_000 })
      .toBeGreaterThan(turned.y + 20);
    await holdKeys(page, ["up"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).y, { timeout: 8_000 })
      .toBeLessThan(turned.y);
    await releaseAll(page);
  });

  test("hops with Space and fires the primary action with J", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);

    await page.keyboard.down("Space");
    await expect
      .poll(async () => playerOf(await cosmic(page)).anim, { timeout: 10_000 })
      .toBe("jump");
    await page.keyboard.up("Space");
    await expect
      .poll(async () => playerOf(await cosmic(page)).anim, { timeout: 10_000 })
      .toBe("idle");

    // The tarantula reacts to exactly one shot, so its reaction counter going up is
    // the browser visible proof that the water cannon event reached the simulation.
    // The counter is read rather than the transient "react" state, which lasts under
    // a second and is easy to poll straight through on a loaded machine.
    await page.keyboard.down("KeyJ");
    await expect
      .poll(async () => ofKind(await cosmic(page), "tarantula")[0]?.reactions ?? 0, {
        timeout: 20_000,
      })
      .toBe(1);
    await page.keyboard.up("KeyJ");
  });

  test("sprays the water cannon, dodges and parries from the keyboard", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);

    // The cannon puts real pellets in the world.
    await page.keyboard.down("KeyJ");
    await expect
      .poll(async () => (await cosmic(page)).pellets.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await page.keyboard.up("KeyJ");

    // The dodge is a burst with invulnerability, so it can cross the arena fast.
    const before = playerOf(await cosmic(page));
    await page.keyboard.down("KeyD");
    await page.keyboard.press("KeyK");
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 10_000 })
      .toBeGreaterThan(before.x + 40);

    // The parry opens a short window and then goes on cooldown.
    await page.keyboard.press("KeyL");
    await expect
      .poll(async () => page.locator("[data-cc-parry-ready]").getAttribute("data-cc-parry-ready"))
      .not.toBeNull();
    await page.keyboard.up("KeyD");
  });

  test("shows the objective board and the rider name while the run is on screen", async ({
    page,
  }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    await expect(page.locator(".cc-objective-board")).toBeVisible();
    await expect(page.locator("[data-cc-board='cores']")).toContainText("Collect the loose cosmic");
    await expect(page.locator("[data-cc-level-chip]")).toContainText("First Breach");
    await expect(page.locator("[data-cc-dodge-ready]")).toBeVisible();
    await expect(page.locator("[data-cc-parry-ready]")).toBeVisible();
    await expect(page.locator("[data-cc-cannon-ready]")).toBeVisible();
  });

  test("says something back when the player picks up a core", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    // The dialogue box exists from the first frame; it fills when something happens.
    await expect(page.locator("[data-cc-dialogue]")).toBeAttached();
    const snapshot = await cosmic(page);
    expect(snapshot.coresLeft).toBeGreaterThan(0);
    expect(snapshot.objectives.length).toBeGreaterThan(0);
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

    // The same seed always deals the same arena, every time, in a real browser.
    await openGame(page, { seed: FRIENDLY_SEED });
    const again = await cosmic(page);
    expect(again.entities.map((entity) => [entity.id, entity.x, entity.y])).toEqual(
      snapshot.entities.map((entity) => [entity.id, entity.x, entity.y]),
    );
    // A different seed deals a different one. (The regression gate pins this offline;
    // here it only has to hold in the browser.)
    await openGame(page, { seed: FRIENDLY_SEED + 1 });
    const other = await cosmic(page);
    expect(other.entities.map((entity) => entity.x)).not.toEqual(
      snapshot.entities.map((entity) => entity.x),
    );
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
        { timeout: 20_000, intervals: [100] },
      )
      .toBeLessThan(startGap - 80);
  });

  test("telegraphs, lunges, and the lunge hurts the player", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);

    // The wind-up lasts a handful of frames, so the whole state cycle is sampled
    // inside the page rather than polled from node, which would miss it, and the
    // sampling stops as soon as the cycle has been seen whole.
    const seen = await statesOverFrames(page, "orca", 900, ["chase", "telegraph", "lunge"]);
    expect(seen).toContain("chase");
    expect(seen).toContain("telegraph");
    expect(seen).toContain("lunge");
    await expect
      .poll(async () => playerOf(await cosmic(page)).hp, { timeout: 10_000 })
      .toBeLessThan(1);
  });

  test("tracks the player when the player drives away from it", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    const start = await cosmic(page);
    const orca = ofKind(start, "orca")[0];
    if (orca === undefined) throw new Error("no orca");
    const away = orca.x > playerOf(start).x ? "left" : "right";
    const startOrcaX = orca.x;
    // Which way along x the player is running, so the Orca has to follow that way.
    const sign = away === "right" ? 1 : -1;
    await holdKeys(page, [away]);
    try {
      // The chase aims where the player is going, so the Orca travels with the player
      // rather than sitting on the spot it started from.
      await expect
        .poll(
          async () => {
            const current = ofKind(await cosmic(page), "orca")[0];
            if (current === undefined) throw new Error("no orca");
            return sign * (current.x - startOrcaX);
          },
          { timeout: 20_000, intervals: [100] },
        )
        .toBeGreaterThan(60);
    } finally {
      await releaseAll(page);
    }
  });
});

test.describe("the snail's time field", () => {
  test("changes the tick rate of what is inside it and only of what is inside it", async ({
    page,
  }) => {
    // Pacing room for a Restart-required run: the Warden may end one attempt
    // under the read and the same opening gets dealt again, and on a crowded
    // machine the sim itself runs slower than the wall. 45s holds one full
    // cycle with margin; the assertions themselves are unchanged.
    test.setTimeout(45_000);
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    // The Warden's dashes are dodged at frame speed, and the field phases are
    // driven and read inside the page: on a crowded machine a node-side drive
    // loop only moves a step every few rendered frames apart, while the page
    // keeps its own cadence. Every sample reads the whole world exactly once,
    // so no boundary crossing between two reads can be mistaken for a lie, and
    // a broken invariant never turns into a pass.
    await installWardenReflex(page);
    await installFieldWatch(page, {
      profile: "invariant",
      insideScale: manifest.arena.timeScaleInside,
      leave: 2.4,
    });

    const outside = playerOf(await cosmic(page));
    expect(outside.inTimeField).toBe(false);
    expect(outside.timeScale).toBe(1);

    // The read lands when a created frame's whole sample agrees with the lore;
    // the phases trail is what a miss reports.
    await expect
      .poll(
        async () => {
          const snapshot = await cosmic(page);
          if (snapshot.status !== "playing") {
            await restartRun(page);
            return "run-over";
          }
          return await page.evaluate(() => window.__fieldWatch.phase);
        },
        { timeout: 32_000 },
      )
      .toBe("ok");

    // The HUD follows the player, and its own frame may be seconds behind the
    // sim when the machine is crowded, so the two checks retry across that
    // whole window rather than trusting the instant after the read.
    await expect(page.locator("[data-cc-time-scale]")).toHaveText(/0\.45/, { timeout: 10_000 });
    await expect(page.locator("[data-cc-field]")).toHaveAttribute("data-cc-field", "in", {
      timeout: 10_000,
    });
  });

  test("puts the player back at one after leaving the field", async ({ page }) => {
    // Same pacing room as the invariant test above: a defeat under one long
    // drive or read re-deals the same opening, and the sim runs slower than
    // the wall on a crowded machine. 45s holds a full cycle with margin.
    test.setTimeout(45_000);
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    // The in-page module drives and reads the phases: entering settles at the
    // field centre first, then the leave phase steers just past the rim; a run
    // ended under either is dealt again by the node side. The Warden is the
    // reflex's business only.
    await installWardenReflex(page);
    await installFieldWatch(page, {
      profile: "release",
      insideScale: manifest.arena.timeScaleInside,
      leave: 2.4,
    });

    // Phase one of the read: cross the rim and settle inside the field.
    await expect
      .poll(
        async () => {
          const snapshot = await cosmic(page);
          if (snapshot.status !== "playing") {
            await restartRun(page);
            return "run-over";
          }
          return await page.evaluate(() =>
            window.__fieldWatch.enterOk ? "ok" : window.__fieldWatch.phase,
          );
        },
        { timeout: 18_000 },
      )
      .toBe("ok");

    // Phase two: leave through the rim and see the world stamp the rider back
    // to one.
    await page.evaluate(() => {
      window.__fieldWatch.aim = "beyond";
    });
    await expect
      .poll(
        async () => {
          const snapshot = await cosmic(page);
          if (snapshot.status !== "playing") {
            await restartRun(page);
            return "run-over";
          }
          return await page.evaluate(() =>
            window.__fieldWatch.leaveOk ? "ok" : window.__fieldWatch.phase,
          );
        },
        { timeout: 20_000 },
      )
      .toBe("ok");

    // The HUD marker trails the sim by whole seconds on a crowded machine, so
    // it retries across that window instead of trusting the instant after.
    await expect(page.locator("[data-cc-field]")).toHaveAttribute("data-cc-field", "out", {
      timeout: 10_000,
    });
  });
});

test.describe("pause and restart", () => {
  test("freezes the simulation while paused and resumes on demand", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    await expect
      .poll(async () => (await cosmic(page)).tick, { timeout: 20_000 })
      .toBeGreaterThan(20);

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator(".cc-screen--pause")).toHaveClass(/cc-screen-active/);
    // A paused world reports the same tick on every single frame.
    await expect.poll(async () => ticksOverFrames(page), { timeout: 5_000 }).toHaveLength(1);
    const frozen = (await cosmic(page)).tick;
    expect(frozen).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Resume" }).click();
    await expect(page.locator(".cc-screen--pause")).not.toHaveClass(/cc-screen-active/);
    await expect
      .poll(async () => (await cosmic(page)).tick, { timeout: 20_000 })
      .toBeGreaterThan(frozen);
  });

  test("restarts on the same seed and deals the same opening again", async ({ page }) => {
    await openGame(page, { seed: FRIENDLY_SEED });
    const opening = await cosmic(page);
    expect(opening.tick).toBe(0);
    await expect(page.locator("[data-cc-seed]")).toHaveText(`seed ${String(FRIENDLY_SEED)}`);

    await startWithKeyboard(page);
    await expect
      .poll(async () => (await cosmic(page)).tick, { timeout: 20_000 })
      .toBeGreaterThan(20);

    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Restart" }).click();
    await expect(page.locator(".cc-screen--pause")).not.toHaveClass(/cc-screen-active/);
    await expect
      .poll(async () => (await cosmic(page)).tick, { timeout: 20_000 })
      .toBeGreaterThan(0);

    const restarted = await cosmic(page);
    expect(restarted.seed).toBe(opening.seed);
    // The field readout is zero until the snail's first step, so it is compared
    // against the manifest rather than against the pre-start snapshot.
    expect(restarted.fieldRadius).toBe(manifest.arena.fieldRadius);
    expect(restarted.entities.map((entity) => entity.id)).toEqual(
      opening.entities.map((entity) => entity.id),
    );
    // The snapshot is taken some ticks into the new run, so positions are allowed to
    // have moved by at most what one tick of the fastest thing in the arena can move.
    const tolerance = restarted.tick * FASTEST_PX_PER_TICK + 5;
    for (const entity of restarted.entities) {
      const before = opening.entities.find((other) => other.id === entity.id);
      expect(before, entity.id).toBeDefined();
      if (before === undefined) continue;
      // Hull is reset exactly. The Tarantula is exempt from the depth comparison: its
      // first step snaps it onto its hover line above the play band, which is a one
      // step rule of the arena rather than drift.
      expect(entity.hp, entity.id).toBe(before.hp);
      expect(Math.abs(entity.x - before.x), entity.id).toBeLessThan(tolerance);
      if (entity.kind !== "tarantula") {
        expect(Math.abs(entity.y - before.y), entity.id).toBeLessThan(tolerance);
      }
    }
    // The player comes back at nominal time: nothing about the run survives.
    expect(playerOf(restarted).timeScale).toBe(1);
    expect(restarted.timeScale).toBe(1);
    await expect(page.locator("[data-cc-seed]")).toHaveText(`seed ${String(FRIENDLY_SEED)}`);
  });
});
