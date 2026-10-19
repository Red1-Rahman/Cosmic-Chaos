/** Boot configuration read from the query string. Stateless: a reload resets everything. */
export interface AppConfig {
  readonly seed: number;
  readonly debug: boolean;
  readonly test: boolean;
  readonly startMuted: boolean;
  /** Explicit tutorial override. Undefined means "on, except under ?test=1". */
  readonly tutorial: boolean | undefined;
}

export const DEFAULT_SEED = 1337;

const readSeed = (raw: string | null): number => {
  if (raw === null || raw.trim() === "") return DEFAULT_SEED;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SEED;
  return Math.trunc(parsed);
};

/**
 * `?seed=` overrides the seed so a run can be replayed, `?test=1` installs the read-only
 * test hooks, `?debug=1` shows the overlay and `?muted=1` starts silent for headless runs.
 * `?tutorial=1` forces the staged onboarding on and `?tutorial=0` forces it off; with no
 * flag it runs for a normal player but never under the test hooks.
 */
export function readConfig(search: string): AppConfig {
  const params = new URLSearchParams(search);
  const test = params.get("test") === "1";
  const tutorialParam = params.get("tutorial");
  return {
    seed: readSeed(params.get("seed")),
    debug: params.get("debug") === "1",
    test,
    startMuted: params.get("muted") === "1" || test,
    tutorial: tutorialParam === null ? undefined : tutorialParam === "1",
  };
}
