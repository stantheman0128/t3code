import { describe, expect, it } from "vite-plus/test";

import {
  isLanguageInstructionOnly,
  isLeadingSlashPrompt,
  prependTraditionalChineseInstruction,
  stripLanguageInstruction,
  TRADITIONAL_CHINESE_INSTRUCTION,
  TRADITIONAL_CHINESE_INSTRUCTION_BLOCK,
} from "./traditionalChineseInstruction.ts";

describe("TRADITIONAL_CHINESE_INSTRUCTION", () => {
  it("requires Traditional Chinese even when the user writes Simplified", () => {
    expect(TRADITIONAL_CHINESE_INSTRUCTION).toMatch(/Traditional Chinese/);
    expect(TRADITIONAL_CHINESE_INSTRUCTION).toMatch(/Simplified Chinese/);
    expect(TRADITIONAL_CHINESE_INSTRUCTION).toMatch(/still reply in Traditional Chinese/);
  });
});

describe("prependTraditionalChineseInstruction", () => {
  const makeTextPart = (text: string) => ({ type: "text" as const, text });

  it("prefixes the first ordinary turn and leaves slash commands alone", () => {
    const first = prependTraditionalChineseInstruction({
      parts: [makeTextPart("hello")],
      alreadyInjected: false,
      userText: "hello",
      makeTextPart,
    });
    expect(first.injected).toBe(true);
    expect(first.parts[0]).toEqual(makeTextPart(TRADITIONAL_CHINESE_INSTRUCTION_BLOCK));
    expect(first.parts[1]).toEqual(makeTextPart("hello"));

    const slash = prependTraditionalChineseInstruction({
      parts: [makeTextPart("/compact")],
      alreadyInjected: false,
      userText: "/compact",
      makeTextPart,
    });
    expect(slash.injected).toBe(false);
    expect(slash.parts).toEqual([makeTextPart("/compact")]);
    expect(isLeadingSlashPrompt("/compact")).toBe(true);
  });
});

describe("stripLanguageInstruction", () => {
  it("removes the injected language block from visible user text", () => {
    const leaked = `${TRADITIONAL_CHINESE_INSTRUCTION_BLOCK} 上衣論的更動`;
    expect(stripLanguageInstruction(leaked)).toBe("上衣論的更動");
    expect(isLanguageInstructionOnly(TRADITIONAL_CHINESE_INSTRUCTION_BLOCK)).toBe(true);
    expect(isLanguageInstructionOnly(leaked)).toBe(false);
  });
});
