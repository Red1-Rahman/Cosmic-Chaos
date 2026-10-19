// Arena constants mirrored from public/assets/assets.json `arena`.
//
// The sim may not fetch, so the numbers live here and a qa-ci spec test asserts
// this mirror still matches assets.json. Edit both together or the spec fails.
//
// Everything below MOVEMENT is a tuning block the sim owns outright: the water
// cannon, the stagger meter, the dodge burst, the parry window and the obstacle
// rules. Nothing here is mirrored from the manifest.

export const ARENA = {
  background: "canvas-03",
  w: 1408,
  h: 768,
  minX: 74,
  maxX: 1334,
  minY: 468,
  maxY: 684,
  fieldRadius: 132,
  timeScaleInside: 0.45,
  seedDefault: 1337,
  /** Water planes measured from canvas-03. Informational for the sim. */
  horizonY: 456,
  shoreY: 700,
  /** Depth drives entity scale: far (small y) is smaller and hazier. */
  depthScaleMin: 0.82,
  depthScaleMax: 1.12,
} as const;

export const SPAWN_RULES = {
  seedDefault: ARENA.seedDefault,
  playerFraction: { x: [0.3, 0.7], y: [0.6, 0.9] },
  enemyFraction: { x: [0.08, 0.92], y: [0.25, 0.95] },
  ambientFraction: { x: [0.1, 0.9], y: [0.1, 0.9] },
  spawnMinDistance: 220,
  maxAttempts: 24,
  humanCount: { min: 3, max: 6 },
} as const;

export const MOVEMENT = {
  /** The fixed timestep never changes, even inside the time field. */
  fixedDt: 1 / 60,
  /** Player waterbike feel: momentum, drift, a visible wake. */
  accel: 780, // px per second squared
  maxSpeed: 360, // px per second
  /** Exponential drag per second applied to velocity. */
  dragPerSecond: 2.6,
  /** Waterbike hop, in logical px. */
  jumpHeight: 46,
  jumpMs: 420,
  /** Drift angle used by the procedural waterbike hull tilt, in radians. */
  maxTilt: 0.18,
} as const;

/**
 * The water cannon. `action` in InputState is the trigger. A pellet is a real
 * object in the world, not a render-only tracer, so it can be blocked by a reef,
 * miss, and stagger whatever it hits.
 */
export const WEAPON = {
  /** Minimum gap between two shots. */
  fireCooldownMs: 190,
  /** Pellet speed, px per second. */
  pelletSpeed: 1020,
  /** How long a pellet survives before it fizzles out on its own. */
  pelletLifeMs: 620,
  /** Collision radius of a pellet. */
  pelletRadius: 7,
  /** How far in front of the rider the pellet starts, in px. */
  muzzleOffset: 30,
  /** Stagger meter units one pellet adds. */
  pelletStagger: 1,
  /** Hard cap on live pellets, so a held trigger cannot flood the pool. */
  maxPellets: 24,
} as const;

/**
 * The stagger meter. Water is not lethal in this arena, so shooting is about
 * control: three hits topple a warden, and a toppled warden cannot touch you
 * while it recovers.
 */
export const STAGGER = {
  /** Meter units needed to topple an enemy. */
  threshold: 3,
  /** How long a toppled enemy stays out of the fight. */
  recoveryMs: 2800,
  /** Knockback impulse applied on the toppling hit, px per second. */
  knockback: 300,
  /** A toppled enemy cannot be hit again until this clears. */
  rehitCooldownMs: 900,
} as const;

/** The dodge: a short burst of speed with invulnerability while it lasts. */
export const DODGE = {
  cooldownMs: 1100,
  /** Impulse added along the movement heading, px per second. */
  impulse: 700,
  /** How long the burst itself lasts. */
  burstMs: 220,
  /** Invulnerability window, which outlives the burst so it is readable. */
  iframeMs: 420,
  /** Reefs are solid again once this elapses, which is the burst plus a little. */
  obstacleIgnoreMs: 260,
} as const;

/**
 * The parry. A short window in which an incoming enemy attack is turned around:
 * no damage, no knockback, and the attacker is toppled instead.
 */
export const PARRY = {
  cooldownMs: 1500,
  /** How long the window stays open after the press. */
  windowMs: 260,
  /** Reach of the deflect, in px. */
  radius: 82,
  /** Lockout after a successful deflect, on top of the cooldown. */
  successLockMs: 700,
} as const;

/**
 * Static level geometry. Obstacles are circles: cheap, exact and stable.
 *
 * The radii are deliberately small against the play band. A rider plus a reef is
 * the collision width, so a 27 px reef eats 49 px of a 216 px tall band; the first
 * pass at 27/19 made the water feel like a corridor of pillars rather than an arena.
 */
export const OBSTACLES = {
  /** Solid reef rock. Blocks riders, wardens and pellets. */
  reefRadius: 21,
  /** Slim kelp pillar. Same rule, smaller footprint. */
  pillarRadius: 14,
  /** Smallest gap two obstacles may sit apart without overlapping. */
  minGap: 84,
  /** Extra clearance kept between an obstacle and the band edge. */
  edgeMargin: 26,
} as const;

/** Loose cosmic cores: the collect half of every objective. */
export const CORES = {
  /** Pickup radius. */
  radius: 15,
  /** The rider only has to touch the rim, not the centre. */
  pickupReach: 26,
} as const;

/** Every enemy kind the water cannon can stagger. */
export const STAGGERABLE = ["orca", "shark"] as const;

export type StaggerableKind = (typeof STAGGERABLE)[number];
