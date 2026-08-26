import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  consumeLastLocationRestore,
  parseStoredLastLocationPath,
  resetLastLocationRestoreForTests,
  sanitizeLastLocationPath,
  shouldSkipIndexDraftLanding,
} from "./lastLocation";

afterEach(() => {
  resetLastLocationRestoreForTests();
});

describe("sanitizeLastLocationPath", () => {
  it("keeps thread, settings, and usage paths", () => {
    expect(sanitizeLastLocationPath("/desktop-core/thread-1")).toBe("/desktop-core/thread-1");
    expect(sanitizeLastLocationPath("/settings/providers")).toBe("/settings/providers");
    expect(sanitizeLastLocationPath("/usage", "?range=7d")).toBe("/usage?range=7d");
  });

  it("drops the index route and pairing/connect screens", () => {
    expect(sanitizeLastLocationPath("/")).toBeNull();
    expect(sanitizeLastLocationPath("/pair")).toBeNull();
    expect(sanitizeLastLocationPath("/connect/callback")).toBeNull();
  });

  it("drops unsafe path shapes", () => {
    expect(sanitizeLastLocationPath("//evil")).toBeNull();
    expect(sanitizeLastLocationPath("/foo/../bar")).toBeNull();
    expect(sanitizeLastLocationPath("settings")).toBeNull();
  });
});

describe("consumeLastLocationRestore", () => {
  it("returns a stored path once per session", () => {
    expect(consumeLastLocationRestore("/usage")).toBe("/usage");
    expect(shouldSkipIndexDraftLanding()).toBe(true);
    expect(consumeLastLocationRestore("/settings")).toBeNull();
  });

  it("parses a stored pathname with search", () => {
    expect(parseStoredLastLocationPath("/pull-requests?state=open")).toBe(
      "/pull-requests?state=open",
    );
  });
});
