// Narrative data: the background story, and the lines the cast says when
// something happens to them. Pure strings plus one tiny, deterministic picker.
//
// Nothing here is random: a line is chosen by how many times that trigger has
// fired in the run, so the same run says the same things in the same order.

/** The premise, told once, on the home screen. */
export const BACKGROUND_STORY: readonly string[] = [
  "Long ago the Capybara found a rule at the bottom of the universe and broke it, on purpose, for a reason it has never explained.",
  "The cosmos did not argue. It assigned the job of correcting things to six very different beings, gave them a coastline to work on, and went back to spinning.",
  "The Orca enforces. The Shark collects the damage. The Tarantula oversees from above and never helps. The Snail keeps the tempo of time for everyone, including you. A handful of oblivious human pets drift past and take no part in any of it.",
  "You are the Capybara. You have a waterbike, a water cannon, and a stubborn amount of nerve. The rest of it is objectives.",
];

export const SPEAKERS = {
  capybara: "Capybara",
  orca: "Orca",
  shark: "Shark",
  tarantula: "Tarantula",
  snail: "Snail",
  cosmos: "The Cosmos",
} as const;

export type SpeakerKey = keyof typeof SPEAKERS;

export type Trigger =
  | "levelStart"
  | "collect"
  | "staggerOrca"
  | "staggerShark"
  | "dodge"
  | "parry"
  | "hurt"
  | "timeField"
  | "objectiveDone"
  | "victory"
  | "defeat";

export interface DialogueLine {
  readonly speaker: SpeakerKey;
  readonly text: string;
}

/** `{rider}` is replaced with the name the player typed on the home screen. */
export type ScriptedLine = string | DialogueLine;

const CAPY: DialogueLine = { speaker: "capybara", text: "Not today." };

/**
 * Trigger -> lines, indexed by how many times that trigger has already fired.
 * The last line repeats, so a late trigger always has something to say.
 */
export const DIALOGUE: Readonly<Record<Trigger, readonly ScriptedLine[]>> = {
  levelStart: [
    "Right. Rule broken, plan forming, waterbike warm. Let's go.",
    "New water, same bad decision. In.",
    "If the cosmos wants a correction, it can queue behind me.",
  ],
  collect: [
    "One more core. Good weight.",
    "Got it. The hull feels heavier already.",
    "Another one. That is a pattern.",
  ],
  staggerOrca: [
    { speaker: "orca", text: "...Rule temporarily suspended." },
    { speaker: "capybara", text: "Temporarily is doing a lot of work there." },
    { speaker: "orca", text: "I will resume enforcement when able." },
  ],
  staggerShark: [
    { speaker: "shark", text: "Rrrgh. Not. Fair." },
    { speaker: "capybara", text: "It has never been fair. It is very fast, though." },
    { speaker: "shark", text: "Again. Later. Faster." },
  ],
  dodge: [
    { speaker: "capybara", text: "Nice water, bad landing." },
    { speaker: "capybara", text: "Slippery. Deliberately." },
  ],
  parry: [
    { speaker: "capybara", text: "You brought that to me?" },
    { speaker: "capybara", text: "Reflected. Politely." },
    { speaker: "orca", text: "That is not in the rule book." },
    { speaker: "capybara", text: "The rule book is very short." },
  ],
  hurt: [
    { speaker: "orca", text: "Stay. For the report." },
    { speaker: "capybara", text: "No." },
    { speaker: "shark", text: "Still. Behind. You." },
  ],
  timeField: [
    { speaker: "snail", text: "Everything slows here. Including the argument." },
    { speaker: "capybara", text: "Thank you. Borrowed seconds." },
    { speaker: "snail", text: "I keep the tempo. You spend it well." },
  ],
  objectiveDone: [
    { speaker: "cosmos", text: "One item closed. Several remain." },
    { speaker: "tarantula", text: "Noted. Continue." },
    { speaker: "cosmos", text: "The file thickens." },
  ],
  victory: [
    { speaker: "cosmos", text: "Correction postponed. Go on." },
    { speaker: "tarantula", text: "Adequate. Do not read into it." },
    { speaker: "capybara", text: "Postponed is the nicest word anyone has used on me." },
  ],
  defeat: [
    { speaker: "orca", text: "Corrected. Ride again." },
    { speaker: "snail", text: "It is not over. It is only on pause." },
    { speaker: "tarantula", text: "Try again. I will be watching." },
  ],
};

/** How long a line stays on screen, in ms. Longer lines get more time. */
export const DIALOGUE_MS_PER_CHAR = 42;
export const DIALOGUE_MIN_MS = 1600;
export const DIALOGUE_MAX_MS = 5200;

/** Display time for one line. Deterministic: a pure function of the text. */
export function dialogueDuration(text: string): number {
  const raw = text.length * DIALOGUE_MS_PER_CHAR + DIALOGUE_MIN_MS;
  return Math.min(DIALOGUE_MAX_MS, raw);
}

/**
 * The line for a trigger on its nth firing. Wraps around, so a trigger with fewer
 * lines than the run produces simply repeats them in order.
 */
export function lineFor(trigger: Trigger, count: number): DialogueLine {
  const pool = DIALOGUE[trigger];
  const first = pool[0];
  if (first === undefined) return CAPY;
  const index = count < 0 ? 0 : count % pool.length;
  const entry = pool[index] ?? first;
  if (typeof entry === "string") return { speaker: "capybara", text: entry };
  return entry;
}

/** Speaker display name, so the UI never repeats the table in two places. */
export function speakerName(speaker: SpeakerKey): string {
  return SPEAKERS[speaker];
}
