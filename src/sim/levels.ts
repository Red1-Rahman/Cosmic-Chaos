// Level definitions: the shape of a run, what the player has to achieve and the
// static geometry it happens in.
//
// Pure data plus three tiny pure helpers. No imports from any other layer, so the
// sim can read a level without knowing anything about rendering, audio or the DOM.
//
// Every level is winnable by construction: each objective names a target that the
// arena can actually deliver, and the briefing screen states the same numbers the
// simulation checks. Logged in docs/decisions.md.

import { ARENA } from "./game-config";
import type { EntityKind, ObjectiveKind, ObstacleKind } from "./types";

/** One achievable, measurable thing the player has to do. */
export interface LevelObjective {
  readonly id: string;
  readonly kind: ObjectiveKind;
  /** Plain sentence shown in the briefing and the HUD. */
  readonly label: string;
  readonly target: number;
  /** Only meaningful for `stagger`: which warden the count belongs to. */
  readonly targetKind: EntityKind;
}

export interface ObstacleSpec {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly kind: ObstacleKind;
}

/** How many wardens, pets and snails the level fields. */
export interface LevelRoster {
  readonly orca: number;
  readonly shark: number;
  readonly snail: number;
  readonly tarantula: boolean;
  readonly humans: readonly [number, number];
}

export interface LevelDefinition {
  readonly id: number;
  /** The story route and scene family used by this level. */
  readonly mode: "lab" | "candy" | "cosmic";
  readonly backgroundId: "canvas-01" | "canvas-02" | "canvas-03";
  readonly name: string;
  readonly subtitle: string;
  /** One line shown under the level name in the picker. */
  readonly blurb: string;
  /** Added to the base seed so every level deals a different arena. */
  readonly seedOffset: number;
  /** Narrative shown on the briefing screen before the run starts. */
  readonly brief: readonly string[];
  /** Narrative shown on the victory screen once every objective is met. */
  readonly outro: readonly string[];
  readonly objectives: readonly LevelObjective[];
  /** How many cosmic cores are scattered through the water. */
  readonly cores: number;
  readonly obstacles: readonly ObstacleSpec[];
  readonly roster: LevelRoster;
  /** One gameplay hint, so no objective is a guessing game. */
  readonly hint: string;
}

const FULL_ROSTER: LevelRoster = {
  orca: 1,
  shark: 1,
  snail: 1,
  tarantula: true,
  humans: [3, 6],
};

/**
 * Obstacle layouts are authored in arena pixels rather than generated, so the same
 * level always looks the same and every gap is known to be wide enough for the
 * waterbike.
 *
 * They run the full width AND the full depth of the play band, and they are sparse:
 * a reef is here to break a chase line and to hide behind, not to turn the water
 * into a maze. The last level is the densest, and even there no two rocks are
 * within 30 px of touching and every lane through the band stays open.
 */
function reef(x: number, y: number, r = 21): ObstacleSpec {
  return { x, y, r, kind: "reef" };
}

function pillar(x: number, y: number, r = 14): ObstacleSpec {
  return { x, y, r, kind: "pillar" };
}

export const LEVELS: readonly LevelDefinition[] = Object.freeze([
  {
    id: 1,
    mode: "lab",
    backgroundId: "canvas-01",
    name: "First Breach",
    subtitle: "The water remembers",
    blurb: "Open water, one warden, and a handful of loose cores.",
    seedOffset: 0,
    brief: [
      "You are the Capybara. You broke a fundamental rule of the universe and you are not sorry about it.",
      "The correction has started. Everything you can see out there has a job: the Orca enforces, the Shark collects, the Snail keeps the tempo.",
      "Your waterbike is lighter than all of them. Use it.",
    ],
    outro: [
      "The cores settle into the hull one by one, and the water goes quiet.",
      "The Warden files the first report. It is going to be a long one.",
    ],
    objectives: [
      {
        id: "cores",
        kind: "collect",
        label: "Collect the loose cosmic cores",
        target: 4,
        targetKind: "player",
      },
    ],
    cores: 4,
    obstacles: [reef(330, 600), pillar(640, 500), reef(880, 646)],
    roster: FULL_ROSTER,
    hint: "Ride over a core to pick it up. Space hops, J sprays the water cannon.",
  },
  {
    id: 2,
    mode: "lab",
    backgroundId: "canvas-01",
    name: "Warden's Water",
    subtitle: "Return fire",
    blurb: "The Orca hunts. Three clean hits and it goes down.",
    seedOffset: 1013,
    brief: [
      "The Orca has your scent now. It leads every chase, so cutting across its path is the only way to lose it.",
      "The water cannon is not a weapon of last resort. Three hits topple it, and a toppled Warden cannot touch you.",
    ],
    outro: [
      "The Orca rolls, slower, and gives up its heading. You are already gone.",
      "Somewhere above the water, the Celestial Overlord makes a note of the whole performance.",
    ],
    objectives: [
      {
        id: "cores",
        kind: "collect",
        label: "Collect the loose cosmic cores",
        target: 5,
        targetKind: "player",
      },
      {
        id: "orca",
        kind: "stagger",
        label: "Topple the Orca with the water cannon",
        target: 2,
        targetKind: "orca",
      },
    ],
    cores: 5,
    obstacles: [reef(300, 664), reef(520, 492), pillar(700, 600), reef(880, 508)],
    roster: FULL_ROSTER,
    hint: "Spray the Orca three times to topple it. Hold K to dodge a lunge, L to parry one.",
  },
  {
    id: 3,
    mode: "candy",
    backgroundId: "canvas-02",
    name: "Time and Tide",
    subtitle: "Borrowed seconds",
    blurb: "The Snail's field is wide here. Everything slow inside it is yours to hit.",
    seedOffset: 2027,
    brief: [
      "The Steward of Time drifts wider than usual today. Inside its field the wardens move at less than half tempo.",
      "That is not a problem to solve. That is a window to aim into.",
    ],
    outro: [
      "The Snail watches the clock it kept for everyone else, and lets you keep one for yourself.",
      "You take it. You always take it.",
    ],
    objectives: [
      {
        id: "cores",
        kind: "collect",
        label: "Collect the loose cosmic cores",
        target: 5,
        targetKind: "player",
      },
      {
        id: "survive",
        kind: "survive",
        label: "Stay afloat through the correction",
        target: 30,
        targetKind: "player",
      },
    ],
    cores: 5,
    obstacles: [reef(290, 546), pillar(480, 662), reef(660, 496), pillar(820, 604), reef(880, 668)],
    roster: FULL_ROSTER,
    hint: "Shoot inside the Snail's field: the warden slows down and your pellets arrive faster.",
  },
  {
    id: 4,
    mode: "candy",
    backgroundId: "canvas-02",
    name: "Circuit of the Avenger",
    subtitle: "Both of you, at once",
    blurb: "Reefs everywhere and a Shark that only knows one diagonal.",
    seedOffset: 3041,
    brief: [
      "The Cosmic Avenger does not think. It runs its diagonal, over and over, and it is fast every single time.",
      "Put a reef in the way and it will go around. Put a cannon in the way and it will stop.",
    ],
    outro: [
      "The Shark's own momentum buries it in a cloud of stardust it did not want.",
      "Two wardens down, and the ocean still has plenty of opinions.",
    ],
    objectives: [
      {
        id: "cores",
        kind: "collect",
        label: "Collect the loose cosmic cores",
        target: 6,
        targetKind: "player",
      },
      {
        id: "shark",
        kind: "stagger",
        label: "Topple the Shark with the water cannon",
        target: 2,
        targetKind: "shark",
      },
    ],
    cores: 6,
    obstacles: [reef(310, 660), reef(540, 490), pillar(700, 610), reef(880, 500), pillar(660, 668)],
    roster: FULL_ROSTER,
    hint: "The Shark dashes along a fixed diagonal. Line up ahead of it and spray.",
  },
  {
    id: 5,
    mode: "cosmic",
    backgroundId: "canvas-03",
    name: "Overlord's Audience",
    subtitle: "The whole court, at once",
    blurb: "Everything the cosmos has, and a finish line.",
    seedOffset: 4057,
    brief: [
      "The Celestial Overlord has not moved once. It will not move now.",
      "This is the last correction it has left to make, and it is making all of it at the same time.",
    ],
    outro: [
      "Every warden it sent after you is floating somewhere harmless, and every core is in the hull.",
      "The Overlord looks down through the nebula. It files the report. It does not send another.",
      "You ride home along a coastline that is only slightly less broken than before.",
    ],
    objectives: [
      {
        id: "cores",
        kind: "collect",
        label: "Collect the loose cosmic cores",
        target: 8,
        targetKind: "player",
      },
      {
        id: "orca",
        kind: "stagger",
        label: "Topple the Orca",
        target: 2,
        targetKind: "orca",
      },
      {
        id: "shark",
        kind: "stagger",
        label: "Topple the Shark",
        target: 2,
        targetKind: "shark",
      },
      {
        id: "survive",
        kind: "survive",
        label: "Stay afloat to the end of the correction",
        target: 40,
        targetKind: "player",
      },
    ],
    cores: 8,
    obstacles: [
      reef(280, 600),
      reef(470, 672),
      pillar(640, 494),
      reef(560, 540),
      reef(800, 610),
      pillar(880, 520),
    ],
    roster: FULL_ROSTER,
    hint: "Dodge through reefs, parry lunges, and keep the cannon firing while you ride.",
  },
]);

/** The first level. Every fresh session starts here. */
export const FIRST_LEVEL_ID = LEVELS[0]?.id ?? 1;

/** Every level id, in order. */
export function levelIds(): readonly number[] {
  return LEVELS.map((level) => level.id);
}

/** The level with this id, or the first one when the id is unknown. */
export function levelById(id: number): LevelDefinition {
  const found = LEVELS.find((level) => level.id === id);
  const first = LEVELS[0];
  if (found !== undefined) return found;
  if (first !== undefined) return first;
  throw new Error("levels: LEVELS is empty.");
}

/**
 * Level n is the base seed shifted by a fixed offset per level. Derived from the
 * seed alone, so `?seed=` still reproduces a run exactly.
 */
export function levelSeed(baseSeed: number, levelId: number): number {
  const level = levelById(levelId);
  return Math.trunc(baseSeed) + level.seedOffset;
}

/**
 * A level is playable once the one before it has been cleared. Nothing is stored:
 * the set lives in the app for the length of the session and dies with the tab.
 */
export function isUnlocked(levelId: number, cleared: ReadonlySet<number>): boolean {
  const level = levelById(levelId);
  if (level.id === FIRST_LEVEL_ID) return true;
  const previous = LEVELS.find((entry) => entry.id === level.id - 1);
  return previous === undefined ? true : cleared.has(previous.id);
}

/** The band every level's geometry has to stay inside. */
export const LEVEL_BAND = {
  minX: ARENA.minX,
  maxX: ARENA.maxX,
  minY: ARENA.minY,
  maxY: ARENA.maxY,
} as const;
