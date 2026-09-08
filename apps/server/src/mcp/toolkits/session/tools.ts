import {
  SpawnSessionError,
  SpawnSessionInput,
  SpawnSessionListResult,
  SpawnSessionResult,
} from "@t3tools/contracts";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as SpawnSessionBroker from "../../SpawnSessionBroker.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  SpawnSessionBroker.SpawnSessionBroker,
];

const SessionListProvidersTool = Tool.make("session_list_providers", {
  description:
    "List T3 Code providers that can be started as a new thread from this session. Use this before session_spawn when the user did not name a provider, or when spawn failed because a provider was not ready. Gemini and Google models appear as Antigravity. Grok Bot is separate from Grok.",
  success: SpawnSessionListResult,
  failure: SpawnSessionError,
  dependencies,
})
  .annotate(Tool.Title, "List spawnable T3 providers")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const SessionSpawnTool = Tool.make("session_spawn", {
  description:
    'Open a new T3 Code thread on another provider in this project. Call this when the user asks you to spawn, start, or hand off a session to Codex, Claude, Cursor, Grok, Grok Bot, OpenCode, Antigravity, Gemini, or any other configured T3 provider. Do not tell them to type a slash command. Native subagents of the current provider stay on this thread; this tool starts a visible peer thread. Gemini/Google use provider "antigravity". Grok Bot is not Grok. Omit prompt to open an empty thread; include prompt to start the first turn.',
  parameters: SpawnSessionInput,
  success: SpawnSessionResult,
  failure: SpawnSessionError,
  dependencies,
})
  .annotate(Tool.Title, "Spawn T3 provider session")
  .annotate(Tool.Destructive, false);

export const SessionToolkit = Toolkit.make(SessionListProvidersTool, SessionSpawnTool);
