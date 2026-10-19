// The staged onboarding run. Pure simulation: no DOM, no clocks, no randomness.
//
// A tutorial world opens with only the Capybara on the water. Each stage withholds
// one part of the cast or the arena and hands it over once the player has met the
// stage's goal, so the first run introduces one idea at a time. The tutorial state is
// deliberately left out of `hashWorld`, so a tutorial run never perturbs the regression
// goldens, and a world created without the flag is completely unchanged.

import { distance } from "./spawn";
import type { Core, Entity, EntityKind, GameEvent, TutorialState, World } from "./types";

/** One onboarding card. Pure copy; the stage number indexes into the table. */
export interface TutorialCard {
  title: string;
  body: string;
}

/**
 * The six stages, in order. The index is the stage number.
 *
 * 0 ride open water, nothing else to react to
 * 1 cores      the pickups appear; collect one to move on
 * 2 shark      the cannon appears with the Cosmic Avenger to aim at
 * 3 orca       the Warden appears; dodge or parry a lunge
 * 4 snail      the time field appears; step inside it
 * 5 everyone   the Celestial Overlord and the Pets arrive; play it out
 */
export const TUTORIAL_COPY: readonly TutorialCard[] = [
  {
    title: "Pilot the waterbike",
    body: "Steer with WASD or the arrow keys, or the D-pad on a phone. Space hops over reefs. Get a feel for the water.",
  },
  {
    title: "Gather the cosmic cores",
    body: "Glowing cores have surfaced. Drive over one to collect it. Gathering them is what this breach is about.",
  },
  {
    title: "Fire the water cannon",
    body: "The Shark, the Cosmic Avenger, runs one fixed diagonal. Press J or Shift, click, or tap the water to spray it and knock it off balance.",
  },
  {
    title: "Answer the Warden",
    body: "The Orca enforces the rule and lunges when it closes. Press K to dodge with a burst, or L to parry at the last instant.",
  },
  {
    title: "Borrow some time",
    body: "The Snail keeps the tempo. Its field slows everything inside it. Drive into the field to slow the wardens around you.",
  },
  {
    title: "Correct the cosmos",
    body: "The Celestial Overlord watches from above and the Pets drift below. Finish the objectives and the water goes quiet.",
  },
];

/** Pixels the rider must cover to close the opening "move" stage. */
const MOVE_DISTANCE = 240;

/** Per-stage fallback in ticks, so a stuck player is never stuck forever. */
const STAGE_FALLBACK_TICKS: readonly number[] = [600, 1200, 1800, 1800, 1200, 480];

/**
 * What is handed over on entering each stage, indexed by the stage being entered.
 * Stage 0 is the rider alone; the cores arrive with stage 1 and the cast trickles in
 * one kind at a time after that.
 */
const REVEAL: readonly { readonly kinds: readonly EntityKind[]; readonly cores: boolean }[] = [
  { kinds: [], cores: false },
  { kinds: [], cores: true },
  { kinds: ["shark"], cores: false },
  { kinds: ["orca"], cores: false },
  { kinds: ["snail"], cores: false },
  { kinds: ["tarantula", "human"], cores: false },
];

/**
 * Move every non-player entity and every core into the tutorial's backlog and open at
 * stage 0. The entities keep the positions the seeded spawner already gave them, so a
 * revealed character lands exactly where it would have in a normal run.
 */
export function beginTutorial(
  entities: readonly Entity[],
  cores: readonly Core[],
  playerX: number,
  playerY: number,
): TutorialState {
  return {
    stage: 0,
    finished: false,
    travelled: 0,
    lastX: playerX,
    lastY: playerY,
    stageTicks: 0,
    pendingEntities: entities.filter((entity) => entity.kind !== "player"),
    pendingCores: [...cores],
  };
}

/** True when this step's fresh events (or distance) close the current stage's goal. */
function meetsGoal(tutorial: TutorialState, player: Entity, fresh: readonly GameEvent[]): boolean {
  switch (tutorial.stage) {
    case 0:
      return tutorial.travelled >= MOVE_DISTANCE;
    case 1:
      return fresh.some((event) => event.type === "collect");
    case 2:
      return fresh.some((event) => event.type === "stagger" && event.kind === "shark");
    case 3:
      return fresh.some((event) => event.type === "dodge" || event.type === "parry");
    case 4:
      return fresh.some((event) => event.type === "timeFieldEnter" && event.id === player.id);
    default:
      // The last stage has no goal beyond staying afloat; its timer signs it off.
      return false;
  }
}

/** Hand over whatever this stage unlocks: its cores and/or its characters. */
function revealStage(world: World, tutorial: TutorialState): void {
  const plan = REVEAL[tutorial.stage];
  if (plan === undefined) return;

  if (plan.cores && tutorial.pendingCores.length > 0) {
    world.cores.push(...tutorial.pendingCores);
    tutorial.pendingCores = [];
  }
  if (plan.kinds.length === 0) return;

  const stillPending: Entity[] = [];
  for (const entity of tutorial.pendingEntities) {
    if (plan.kinds.includes(entity.kind)) {
      world.entities.push(entity);
      world.events.push({
        type: "spawn",
        id: entity.id,
        kind: entity.kind,
        x: entity.x,
        y: entity.y,
      });
    } else {
      stillPending.push(entity);
    }
  }
  tutorial.pendingEntities = stillPending;
}

/**
 * Advance the tutorial one step. Called near the end of `step`, after the world has
 * produced this tick's events, so an event driven goal sees them immediately. `fromIndex`
 * is the mark taken before the step's events were pushed.
 */
export function stepTutorial(world: World, player: Entity, fromIndex: number): void {
  const tutorial = world.tutorial;
  if (tutorial === undefined || tutorial.finished) return;

  // Accumulate how far the rider has come this stage, for the opening move goal.
  tutorial.travelled += distance(player.x, player.y, tutorial.lastX, tutorial.lastY);
  tutorial.lastX = player.x;
  tutorial.lastY = player.y;
  tutorial.stageTicks += 1;

  const fresh = world.events.slice(fromIndex);
  const goalMet = meetsGoal(tutorial, player, fresh);
  const timedOut = tutorial.stageTicks >= (STAGE_FALLBACK_TICKS[tutorial.stage] ?? 600);
  if (!goalMet && !timedOut) return;

  // The last stage has nothing left to reveal; it only signs off.
  if (tutorial.stage >= TUTORIAL_COPY.length - 1) {
    tutorial.finished = true;
    return;
  }

  tutorial.stage += 1;
  tutorial.travelled = 0;
  tutorial.stageTicks = 0;
  revealStage(world, tutorial);
}
