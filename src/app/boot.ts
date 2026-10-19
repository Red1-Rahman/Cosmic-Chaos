import { createAudioPort } from "../audio";
import type { AudioPort } from "../audio";
import { Atlas } from "../assets/atlas";
import { loadImages, loadManifest } from "../assets/loader";
import type { DecodedImage } from "../assets/loader";
import type { Manifest } from "../assets/manifest-types";
import { createInput } from "../input/input";
import type { InputSource } from "../input/input";
import { PROP_SPEED_REFERENCE, createRenderer } from "../render/renderer";
import type { Renderer } from "../render/renderer";
import { createViewport, readViewportConfig } from "../render/viewport";
import type { ViewportHandle } from "../render/viewport";
import { dodgeReady01, parryReady01, cannonReady01 } from "../sim/behaviours/player";
import { speakerName } from "../sim/dialogue";
import { FIRST_LEVEL_ID, LEVELS, levelById } from "../sim/levels";
import { TUTORIAL_COPY } from "../sim/tutorial";
import { createWorld, drainEvents, step } from "../sim/world";
import type { Entity, GameEvent, InputState, World } from "../sim/types";
import { createUi } from "../ui";
import { DEFAULT_RIDER_NAME, riderNameOr } from "../ui/dom";
import type { HudModel, LevelView, ObjectiveView, Screen, Ui } from "../ui";
import { createRealClock } from "./clock";
import { readConfig } from "./config";
import { cueForEvent, engineForState } from "./event-audio";
import { createLoop } from "./loop";
import type { LoopHandle } from "./loop";
import { installTestHooks } from "./test-hooks";

/** Screen shown to the player, plus whether the simulation is allowed to advance. */
interface GameState {
  screen: Screen;
  paused: boolean;
  started: boolean;
  muted: boolean;
  levelId: number;
  /** Levels cleared this session. Never written anywhere; it dies with the tab. */
  cleared: Set<number>;
  riderName: string;
  /** Whether the staged onboarding has already run this session. */
  tutorialSeen: boolean;
}

const CANVAS_ID = "stage";

/** Turn the sim's objective book into the plain shape the ui layer renders. */
function objectiveViews(world: World): ObjectiveView[] {
  return world.objectives.map((objective) => ({
    id: objective.id,
    label: objective.label,
    count: objective.count,
    target: objective.target,
    done: objective.done,
  }));
}

/** Turn the level table plus the session's cleared set into picker rows. */
function levelViews(state: GameState): LevelView[] {
  return LEVELS.map((level) => ({
    id: level.id,
    mode: level.mode,
    modeName:
      level.mode === "lab"
        ? "Lab Breach"
        : level.mode === "candy"
          ? "Candy Current"
          : "Cosmic Correction",
    backgroundId: level.backgroundId,
    name: level.name,
    subtitle: level.subtitle,
    blurb: level.blurb,
    hint: level.hint,
    objectives: level.objectives.map((objective) => ({
      id: objective.id,
      label: objective.label,
      count: 0,
      target: objective.target,
      done: false,
    })),
    cleared: state.cleared.has(level.id),
    unlocked: level.id === FIRST_LEVEL_ID || state.cleared.has(level.id - 1),
    current: level.id === state.levelId,
  }));
}

/**
 * Wires the layers together. This module owns the only real-time surface, the fixed-step
 * accumulator, the sim-to-audio mapping, the screen stack and the ordering of a frame.
 *
 * The arena only starts simulating once the player has launched a level from the
 * briefing screen, so nothing can be defeated behind a menu.
 */
export async function boot(): Promise<void> {
  const config = readConfig(window.location.search);
  const canvas = document.getElementById(CANVAS_ID);
  if (!(canvas instanceof HTMLCanvasElement)) {
    showFatal(document, `Missing #${CANVAS_ID} canvas element.`);
    return;
  }

  let manifest: Manifest;
  let images: Map<string, DecodedImage>;
  try {
    manifest = await loadManifest();
    images = await loadImages(manifest);
  } catch {
    showFatal(document, "Could not load the art manifest. Run npm run dev and reload.");
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (ctx === null) {
    showFatal(document, "This browser refused a 2D canvas context.");
    return;
  }

  const viewportConfig = readViewportConfig(manifest);
  const viewport: ViewportHandle = createViewport(canvas, viewportConfig.presets, window);
  const atlas = Atlas.create(manifest, images);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer: Renderer = createRenderer(manifest, atlas, {
    backgrounds: images,
    reducedMotion,
    seed: config.seed,
  });

  const audio: AudioPort = createAudioPort();
  audio.setMuted(config.startMuted);
  const input: InputSource = createInput(window);

  let world: World = createWorld(config.seed);
  const state: GameState = {
    screen: "home",
    paused: false,
    started: false,
    muted: config.startMuted,
    levelId: FIRST_LEVEL_ID,
    cleared: new Set<number>(),
    riderName: DEFAULT_RIDER_NAME,
    tutorialSeen: false,
  };

  // The staged onboarding runs for a normal player, once, on the first level. `?tutorial=1`
  // forces it on every launch (for demos and e2e); `?tutorial=0` and `?test=1` keep it off.
  const wantsTutorial = config.tutorial ?? !config.test;

  let inputState: InputState = input.poll();
  let previousJump = false;

  function setScreen(screen: Screen): void {
    state.screen = screen;
    ui.show(screen);
  }

  // One place that launches a level, so the tutorial rule is identical for a fresh start,
  // a restart and the next-level button. The home backdrop world is never built here, so
  // the title screen always shows the full cast.
  function startLevel(levelId: number): void {
    state.levelId = levelById(levelId).id;
    const firstRun = !state.tutorialSeen && state.levelId === FIRST_LEVEL_ID;
    const useTutorial = config.tutorial === true || (wantsTutorial && firstRun);
    world = createWorld(config.seed, state.levelId, { tutorial: useTutorial });
    if (useTutorial) state.tutorialSeen = true;
    state.started = true;
    state.paused = false;
    setScreen("playing");
  }

  const ui: Ui = createUi(
    {
      onStart(levelId): void {
        audio.unlock();
        audio.play("ui");
        state.levelId = levelById(levelId).id;
        // Restart reuses the same seed and level, so a retry is the same run.
        world = createWorld(config.seed, state.levelId);
        state.started = true;
        state.paused = false;
        setScreen("playing");
      },
      onBrief(levelId): void {
        audio.unlock();
        audio.play("ui");
        // The briefing names the story, the objectives and the hint before anything
        // starts moving, so nothing on screen is a surprise.
        state.levelId = levelById(levelId).id;
        setScreen("briefing");
      },
      onRestart(): void {
        audio.unlock();
        audio.play("ui");
        world = createWorld(config.seed, state.levelId);
        state.started = true;
        state.paused = false;
        setScreen("playing");
      },
      onHome(): void {
        audio.play("ui");
        state.started = false;
        state.paused = false;
        setScreen("home");
      },
      onOpenLevels(): void {
        audio.play("ui");
        setScreen("levels");
      },
      onOpenControls(): void {
        audio.play("ui");
        setScreen("controls");
      },
      onOpenLicense(): void {
        audio.play("ui");
        setScreen("license");
      },
      onCloseOverlay(): void {
        audio.play("ui");
        setScreen(state.started ? "paused" : "home");
      },
      onTogglePause(): void {
        if (!state.started) return;
        state.paused = !state.paused;
        setScreen(state.paused ? "paused" : "playing");
        audio.play("ui");
      },
      onToggleMute(): void {
        state.muted = !state.muted;
        audio.setMuted(state.muted);
      },
      onSetRiderName(name): void {
        state.riderName = riderNameOr(name);
      },
      onNextLevel(): void {
        const next = levelById(state.levelId + 1);
        if (next.id <= state.levelId) return;
        audio.play("ui");
        state.levelId = next.id;
        world = createWorld(config.seed, state.levelId);
        state.started = true;
        state.paused = false;
        setScreen("playing");
      },
    },
    { debug: config.debug },
  );

  ui.mount(document.body);
  ui.show("home");

  const playerOf = (): Entity | undefined => world.entities.find((e) => e.id === world.playerId);

  const consumeEvents = (): void => {
    for (const event of drainEvents(world)) {
      handleEvent(event);
    }
  };

  const handleEvent = (event: GameEvent): void => {
    renderer.pushEvent(event);
    const cue = cueForEvent(event);
    if (cue !== undefined) audio.play(cue);
    if (event.type === "defeat" && state.screen === "playing") setScreen("defeat");
    if (event.type === "victory" && state.screen === "playing") {
      state.cleared.add(world.levelId);
      setScreen("victory");
    }
  };

  const buildModel = (layout: { scale: number }): HudModel => {
    const player = playerOf();
    const counts: Record<string, number> = {};
    const entityTimeScales: Record<string, number> = {};
    for (const entity of world.entities) {
      counts[entity.kind] = (counts[entity.kind] ?? 0) + 1;
      entityTimeScales[entity.id] = entity.timeScale;
    }
    const inTimeField = player !== undefined && player.timeScale !== 1;
    const level = levelById(world.levelId);
    return {
      hp: player?.hp ?? 0,
      timeScale: world.fieldTimeScale,
      inTimeField,
      seed: world.seed,
      tick: world.tick,
      presetId: viewport.layout().preset.id,
      muted: state.muted,
      paused: state.paused,
      status: world.status,
      counts,
      frame: {
        x: viewport.layout().offset.x,
        y: viewport.layout().offset.y,
        w: layout.scale > 0 ? viewport.layout().css.w : 0,
        h: viewport.layout().css.h,
      },
      entityTimeScales,
      canvasScale: layout.scale,
      riderName: state.riderName,
      levelId: level.id,
      levelName: level.name,
      elapsedSec: world.tick / 60,
      objectives: objectiveViews(world),
      dodgeReady: player === undefined ? 0 : dodgeReady01(player),
      parryReady: player === undefined ? 0 : parryReady01(player),
      cannonReady: player === undefined ? 0 : cannonReady01(player),
      dialogue:
        world.dialogue === null
          ? null
          : { speaker: speakerName(world.dialogue.speaker), line: world.dialogue.line },
      levels: levelViews(state),
    };
  };

  const loop: LoopHandle = createLoop({
    clock: createRealClock(),
    onFrameStart(): void {
      inputState = input.poll();
      // Gamepad confirm has no key to bind to, so on menus the focused button is the hook.
      if (state.screen !== "playing" && inputState.jump && !previousJump) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.tagName === "BUTTON") active.click();
      }
      previousJump = inputState.jump;
    },
    onFixedStep(dt): void {
      if (!state.started || state.paused) return;
      step(world, inputState, dt);
    },
    onFrame(alpha): void {
      consumeEvents();

      const layout = viewport.layout();
      // The canvas is positioned over the page, so the letterbox bars are the page itself.
      document.body.style.background = layout.barColor;
      renderer.resize(layout);
      renderer.render(ctx, world, layout, alpha);

      const player = playerOf();
      const engine = engineForState(
        player?.props.speed ?? 0,
        world.fieldTimeScale,
        PROP_SPEED_REFERENCE,
      );
      audio.setEngine(engine.speed01, engine.timeScale);
      ui.update(buildModel(layout));
    },
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => {
      window.cancelAnimationFrame(handle);
    },
  });

  // The AudioContext is only created inside a real gesture, which is what keeps the
  // autoplay warning out of the console.
  const unlock = (): void => {
    audio.unlock();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  const removeHooks = config.test ? installTestHooks(window, () => world) : undefined;

  loop.start();

  window.addEventListener("pagehide", () => {
    loop.dispose();
    renderer.dispose();
    input.dispose();
    audio.dispose();
    ui.destroy();
    viewport.dispose();
    removeHooks?.();
  });
}

/** Visible failure, because the console must stay clean. */
function showFatal(doc: Document, message: string): void {
  const box = doc.createElement("div");
  box.setAttribute("role", "alert");
  box.style.cssText =
    "position:fixed;inset:0;display:grid;place-items:center;padding:2rem;" +
    "font:16px/1.5 system-ui,sans-serif;color:#e8ecff;background:#05060f;text-align:center";
  box.textContent = message;
  doc.body.append(box);
}
