import { describe, expect, it } from "vite-plus/test";

import { TRADITIONAL_CHINESE_INSTRUCTION } from "./traditionalChineseInstruction.ts";

describe("TRADITIONAL_CHINESE_INSTRUCTION", () => {
  it("requires Traditional Chinese even when the user writes Simplified", () => {
    expect(TRADITIONAL_CHINESE_INSTRUCTION).toMatch(/Traditional Chinese/);
    expect(TRADITIONAL_CHINESE_INSTRUCTION).toMatch(/Simplified Chinese/);
    expect(TRADITIONAL_CHINESE_INSTRUCTION).toMatch(/still reply in Traditional Chinese/);
  });
});
