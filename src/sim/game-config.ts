// Arena constants mirrored from public/assets/assets.json `arena`.
//
// The sim may not fetch, so the numbers live here and a qa-ci spec test asserts
// this mirror still matches assets.json. Edit both together or the spec fails.

export const ARENA = {
  background: "canvas-03",
  w: 1408,
  h: 768,
  minX: 74,
  maxX: 1334,
  minY: 486,
  maxY: 648,
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
