import { compareSemverVersions } from "@t3tools/shared/semver";

export interface WhatsNewEntry {
  readonly version: string;
  readonly title: string;
  readonly highlights: readonly string[];
}

export const WHATS_NEW_STORAGE_KEY = "t3code:whats-new:last-seen-version";

/** Add an entry for each desktop version that should open What's New after install. */
export const WHATS_NEW_ENTRIES: readonly WhatsNewEntry[] = [
  {
    version: "0.0.117",
    title: "What's new in 0.0.117",
    highlights: [
      "The composer sits on a soft shadow in light and dark.",
      "Settings, Version, Release notes keeps the update log for earlier versions.",
    ],
  },
  {
    version: "0.0.116",
    title: "What's new in 0.0.116",
    highlights: [
      "Grok 4.7 Fast is in the picker. The lightning toggle selects grok-4.7-build-fast when the CLI has it.",
      "Slash commands added: /imagine, /imagine-video, /flush, /auto, and /dashboard.",
    ],
  },
  {
    version: "0.0.115",
    title: "What's new in 0.0.115",
    highlights: [
      "Thinking text sweeps while the model is thinking, and Thought rows show a chevron.",
      "Grok slash commands now include /tasks, /queue, /memory, and /dream.",
    ],
  },
  {
    version: "0.0.114",
    title: "What's new in 0.0.114",
    highlights: [
      "Grok Fast is a lightning toggle on the composer, next to Effort. Context window stays 500k; that is not a Cursor-style 256k picker.",
    ],
  },
  {
    version: "0.0.113",
    title: "What's new in 0.0.113",
    highlights: [
      "Grok 4.7 is in the Grok and Grok Bot pickers. New Grok CLI threads default to 4.7.",
      "Thinking is expandable again, and the Thinking label sweeps while it runs.",
    ],
  },
  {
    version: "0.0.112",
    title: "What's new in 0.0.112",
    highlights: [
      "Context window ring sits in the middle of its hover circle again, and is a bit larger.",
    ],
  },
  {
    version: "0.0.111",
    title: "What's new in 0.0.111",
    highlights: [
      "Grok auto-compact also collapses to one Context compacted line. Recap dumps like Received N updates no longer fill the thread.",
    ],
  },
  {
    version: "0.0.110",
    title: "What's new in 0.0.110",
    highlights: [
      "Working actually spins: sidebar dashed circle and the chat Working for row. Goal stays a still dot.",
    ],
  },
  {
    version: "0.0.109",
    title: "What's new in 0.0.109",
    highlights: [
      "Live work rows show a small spinner again. Goal stays a still dot.",
      "Grok /compact no longer dumps old commands into the thread. You get one Context compacted line, like Claude.",
    ],
  },
  {
    version: "0.0.108",
    title: "What's new in 0.0.108",
    highlights: [
      "Local unsigned Windows builds stamp the T3 icon and product name onto the EXE. No signing certificate required.",
    ],
  },
  {
    version: "0.0.107",
    title: "What's new in 0.0.107",
    highlights: [
      "Queued follow-ups stay on one line until you open them. The Goal strip has more inset, icon actions, Stop, and a still status dot while running.",
      "Opening a monitor in Agents no longer shows a blank pane. Grok's health check no longer treats a slow `grok models` exit as a failed login.",
    ],
  },
  {
    version: "0.0.106",
    title: "What's new in 0.0.106",
    highlights: [
      "Official T3 from 9/10 through 9/19 is on this fork.",
      "Appearance has Provider chrome. Turn it on, then switch Claude, Codex, or Cursor: the chat column follows that product's type, composer, motion ladder, and one status actor. Sidebar stays T3.",
    ],
  },
  {
    version: "0.0.105",
    title: "What's new in 0.0.105",
    highlights: [
      "The Goal strip sits above the composer with Pause, Resume, and Edit.",
      "Picking /goal from the slash menu puts a chip on the first editor line, same height as the text.",
    ],
  },
  {
    version: "0.0.104",
    title: "What's new in 0.0.104",
    highlights: [
      "After /goal, the composer shows the current objective again. Click the strip to expand it.",
    ],
  },
  {
    version: "0.0.103",
    title: "What's new in 0.0.103",
    highlights: [
      "Grok /goal is back in the slash menu after the provider health check. 0.0.102 left only /compact.",
    ],
  },
  {
    version: "0.0.102",
    title: "What's new in 0.0.102",
    highlights: [
      "Antigravity health checks reuse a recent result instead of launching a full unpack every 30 seconds.",
      "Each Antigravity process unpacks into a T3-owned temp folder and deletes that folder when it stops, even if Windows has to force-kill it.",
      "This stops Temp from growing by about a gigabyte on every health check.",
    ],
  },
  {
    version: "0.0.101",
    title: "What's new in 0.0.101",
    highlights: [
      "If a provider login expires, the chat shows Sign in and Reconnect. Thread history stays; the failed prompt is not sent again.",
      "Sign in with Google opens the browser as soon as the link is ready.",
      "A failed Antigravity install waits before downloading again, instead of grabbing another copy immediately.",
    ],
  },
  {
    version: "0.0.100",
    title: "What's new in 0.0.100",
    highlights: [
      "Ask the current agent to spawn Codex, Claude, Gemini, Grok, or another ready provider as a new visible thread in the same project.",
      "Check for Updates now names the available version so you can download or install it from the dialog.",
      "After each app update, T3 Code opens this summary of what changed.",
    ],
  },
  {
    version: "0.0.99",
    title: "What's new in 0.0.99",
    highlights: [
      "Ask the current agent to spawn Codex, Claude, Gemini, Grok, or another ready provider as a new visible thread in the same project.",
      "Slash commands and the command palette still work for Codex, Grok, and Grok Bot.",
      "Native subagents stay on the current thread; spawn opens a peer T3 thread.",
    ],
  },
];

export function resolveWhatsNewToShow(input: {
  readonly currentVersion: string;
  readonly lastSeenVersion: string | null;
  readonly entries?: readonly WhatsNewEntry[];
}): WhatsNewEntry | null {
  const currentVersion = input.currentVersion.trim();
  if (currentVersion.length === 0 || currentVersion === "0.0.0") {
    return null;
  }
  if (input.lastSeenVersion === currentVersion) {
    return null;
  }
  if (
    input.lastSeenVersion !== null &&
    compareSemverVersions(currentVersion, input.lastSeenVersion) <= 0
  ) {
    return null;
  }
  const entries = input.entries ?? WHATS_NEW_ENTRIES;
  return entries.find((entry) => entry.version === currentVersion) ?? null;
}
