import { expect, test } from "vite-plus/test";

import { resolveWhatsNewToShow, type WhatsNewEntry } from "./whatsNew.ts";

const entries: readonly WhatsNewEntry[] = [
  {
    version: "0.0.100",
    title: "Hundred",
    highlights: ["Spawn peer threads"],
  },
];

test("shows notes when the running version is newer than the last seen version", () => {
  expect(
    resolveWhatsNewToShow({
      currentVersion: "0.0.100",
      lastSeenVersion: "0.0.98",
      entries,
    }),
  ).toEqual(entries[0]);
});

test("shows notes on the first launch of a catalogued version", () => {
  expect(
    resolveWhatsNewToShow({
      currentVersion: "0.0.100",
      lastSeenVersion: null,
      entries,
    }),
  ).toEqual(entries[0]);
});

test("does not show again after the current version is acknowledged", () => {
  expect(
    resolveWhatsNewToShow({
      currentVersion: "0.0.100",
      lastSeenVersion: "0.0.100",
      entries,
    }),
  ).toBeNull();
});

test("skips placeholder and unknown versions", () => {
  expect(
    resolveWhatsNewToShow({
      currentVersion: "0.0.0",
      lastSeenVersion: null,
      entries,
    }),
  ).toBeNull();
  expect(
    resolveWhatsNewToShow({
      currentVersion: "0.0.101",
      lastSeenVersion: "0.0.100",
      entries,
    }),
  ).toBeNull();
});
