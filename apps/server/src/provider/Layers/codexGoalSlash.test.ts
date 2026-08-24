import { describe, expect, it } from "vite-plus/test";

import { parseCodexGoalSlash } from "./codexGoalSlash.ts";

describe("parseCodexGoalSlash", () => {
  it("treats a bare /goal as status", () => {
    expect(parseCodexGoalSlash("/goal")).toEqual({ kind: "status" });
    expect(parseCodexGoalSlash("/goal status")).toEqual({ kind: "status" });
  });

  it("parses pause resume and clear", () => {
    expect(parseCodexGoalSlash("/goal pause")).toEqual({ kind: "pause" });
    expect(parseCodexGoalSlash("/goal resume")).toEqual({ kind: "resume" });
    expect(parseCodexGoalSlash("/goal clear")).toEqual({ kind: "clear" });
  });

  it("parses an objective and optional token budget", () => {
    expect(parseCodexGoalSlash("/goal Keep tests green")).toEqual({
      kind: "set",
      objective: "Keep tests green",
      tokenBudget: null,
    });
    expect(parseCodexGoalSlash("/goal Keep tests green --budget 500000")).toEqual({
      kind: "set",
      objective: "Keep tests green",
      tokenBudget: 500000,
    });
  });

  it("ignores ordinary prompts", () => {
    expect(parseCodexGoalSlash("fix the tests")).toBeNull();
    expect(parseCodexGoalSlash("/plan ship it")).toBeNull();
  });
});
