import { describe, expect, it } from "vite-plus/test";

import {
  EFFORT_CONTROL_STYLE_STORAGE_KEY,
  effortProgress,
  effortStopIndexFromClientX,
  readEffortControlStyle,
  writeEffortControlStyle,
} from "./effortControlStyle";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(EFFORT_CONTROL_STYLE_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("effort control style", () => {
  it("keeps the menu until the stored choice is slider", () => {
    expect(readEffortControlStyle(memoryStorage())).toBe("menu");
    expect(readEffortControlStyle(memoryStorage("menu"))).toBe("menu");
    expect(readEffortControlStyle(memoryStorage("slider"))).toBe("slider");
    expect(readEffortControlStyle(memoryStorage("nope"))).toBe("menu");
  });

  it("writes the choice back to storage", () => {
    const storage = memoryStorage();
    writeEffortControlStyle("slider", storage);
    expect(readEffortControlStyle(storage)).toBe("slider");
  });
});

describe("effort slider stops", () => {
  it("snaps the pointer to the nearest stop", () => {
    expect(effortStopIndexFromClientX({ clientX: 0, left: 0, width: 100, count: 5 })).toBe(0);
    expect(effortStopIndexFromClientX({ clientX: 50, left: 0, width: 100, count: 5 })).toBe(2);
    expect(effortStopIndexFromClientX({ clientX: 100, left: 0, width: 100, count: 5 })).toBe(4);
    expect(effortStopIndexFromClientX({ clientX: -20, left: 0, width: 100, count: 5 })).toBe(0);
    expect(effortStopIndexFromClientX({ clientX: 10, left: 0, width: 0, count: 5 })).toBe(0);
  });

  it("maps the selected stop onto a 0 to 1 fill", () => {
    expect(effortProgress(0, 5)).toBe(0);
    expect(effortProgress(4, 5)).toBe(1);
    expect(effortProgress(2, 5)).toBe(0.5);
    expect(effortProgress(3, 1)).toBe(0);
  });
});
