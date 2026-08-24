/**
 * Codex `/goal` text the composer inserts, mapped onto app-server RPCs.
 *
 * @module codexGoalSlash
 */

export type CodexGoalSlash =
  | {
      readonly kind: "set";
      readonly objective: string;
      readonly tokenBudget: number | null;
    }
  | { readonly kind: "pause" }
  | { readonly kind: "resume" }
  | { readonly kind: "clear" }
  | { readonly kind: "status" };

const GOAL_PREFIX = /^\/goal(?:\s+([\s\S]*))?$/i;

export function parseCodexGoalSlash(input: string): CodexGoalSlash | null {
  const match = input.trim().match(GOAL_PREFIX);
  if (!match) return null;
  const rest = (match[1] ?? "").trim();
  if (rest.length === 0) return { kind: "status" };
  const lower = rest.toLowerCase();
  if (lower === "status") return { kind: "status" };
  if (lower === "pause") return { kind: "pause" };
  if (lower === "resume") return { kind: "resume" };
  if (lower === "clear") return { kind: "clear" };
  const budgetMatch = rest.match(/^(.*?)\s+--budget\s+(\d+)\s*$/i);
  if (budgetMatch) {
    const objective = budgetMatch[1]?.trim() ?? "";
    if (objective.length === 0) return null;
    return {
      kind: "set",
      objective,
      tokenBudget: Number.parseInt(budgetMatch[2] ?? "0", 10),
    };
  }
  return { kind: "set", objective: rest, tokenBudget: null };
}
