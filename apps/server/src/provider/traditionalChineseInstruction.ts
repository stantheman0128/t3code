/**
 * Standing language rule for every T3 agent. Reply language stays Traditional
 * Chinese unless the user explicitly asks for Simplified.
 *
 * @module traditionalChineseInstruction
 */
export const TRADITIONAL_CHINESE_INSTRUCTION =
  "When writing Chinese, always use Traditional Chinese (Taiwan, zh-TW) unless the user explicitly asks for Simplified Chinese. If the user writes Simplified Chinese, still reply in Traditional Chinese. Do not mix the two.";

export const TRADITIONAL_CHINESE_INSTRUCTION_BLOCK = `<language>${TRADITIONAL_CHINESE_INSTRUCTION}</language>`;

const LANGUAGE_INSTRUCTION_BLOCK_RE = /<language>[\s\S]*?<\/language>\s*/g;

/** Strip injected language tags so they never show as chat text. */
export function stripLanguageInstruction(text: string): string {
  return text.replace(LANGUAGE_INSTRUCTION_BLOCK_RE, "").replace(/^\s+/, "");
}

export function isLanguageInstructionOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && stripLanguageInstruction(trimmed).length === 0;
}

export function isLeadingSlashPrompt(text: string | undefined): boolean {
  return Boolean(text?.trim().startsWith("/"));
}

export function prependTraditionalChineseInstruction<T>(input: {
  readonly parts: ReadonlyArray<T>;
  readonly alreadyInjected: boolean;
  readonly userText?: string;
  readonly makeTextPart: (text: string) => T;
}): { readonly parts: T[]; readonly injected: boolean } {
  if (input.alreadyInjected || isLeadingSlashPrompt(input.userText)) {
    return { parts: [...input.parts], injected: input.alreadyInjected };
  }
  return {
    parts: [input.makeTextPart(TRADITIONAL_CHINESE_INSTRUCTION_BLOCK), ...input.parts],
    injected: true,
  };
}
