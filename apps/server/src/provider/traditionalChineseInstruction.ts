/**
 * Standing language rule for every T3 agent. Reply language stays Traditional
 * Chinese unless the user explicitly asks for Simplified.
 *
 * @module traditionalChineseInstruction
 */
export const TRADITIONAL_CHINESE_INSTRUCTION =
  "When writing Chinese, always use Traditional Chinese (Taiwan, zh-TW) unless the user explicitly asks for Simplified Chinese. If the user writes Simplified Chinese, still reply in Traditional Chinese. Do not mix the two.";
