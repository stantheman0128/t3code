export type EffortControlStyle = "menu" | "slider";

export const EFFORT_CONTROL_STYLE_STORAGE_KEY = "t3code:effort-control-style";

type StyleStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): StyleStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** Menu is the default so the existing effort list stays until the user switches. */
export function readEffortControlStyle(storage?: StyleStorage | null): EffortControlStyle {
  try {
    const value = (storage === undefined ? browserStorage() : storage)?.getItem(
      EFFORT_CONTROL_STYLE_STORAGE_KEY,
    );
    return value === "slider" ? "slider" : "menu";
  } catch {
    return "menu";
  }
}

export function writeEffortControlStyle(
  style: EffortControlStyle,
  storage?: StyleStorage | null,
): void {
  try {
    (storage === undefined ? browserStorage() : storage)?.setItem(
      EFFORT_CONTROL_STYLE_STORAGE_KEY,
      style,
    );
  } catch {
    // Private mode can reject storage. The in-memory choice still applies.
  }
}

/** Map a pointer x to the nearest discrete effort stop. */
export function effortStopIndexFromClientX(input: {
  clientX: number;
  left: number;
  width: number;
  count: number;
}): number {
  if (input.count <= 1 || input.width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (input.clientX - input.left) / input.width));
  return Math.round(ratio * (input.count - 1));
}

export function effortProgress(index: number, count: number): number {
  if (count <= 1) return 0;
  const clamped = Math.min(count - 1, Math.max(0, index));
  return clamped / (count - 1);
}
