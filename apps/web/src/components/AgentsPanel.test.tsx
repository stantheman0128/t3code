import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  AgentPanelModel,
  RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { AgentsPanel } from "./AgentsPanel";

function agent(
  overrides: Partial<RuntimeSubagent> & Pick<RuntimeSubagent, "id" | "status" | "title">,
): RuntimeSubagent {
  return {
    kind: "subagent",
    role: "general-purpose",
    model: null,
    effort: null,
    activationCount: 1,
    usage: { totalTokens: 1200, toolUses: 3 },
    progress: null,
    lastToolName: null,
    result: "# Failed lookup\nSomething broke.",
    error: "provider crashed",
    outputFile: null,
    parentAgentId: null,
    agentIndex: null,
    phaseIndex: null,
    phaseTitle: null,
    attempt: null,
    workflowName: null,
    phases: [],
    runHandles: null,
    recentActivity: [],
    firstSeenAt: "2026-08-25T10:00:00.000Z",
    startedAt: "2026-08-25T10:00:00.000Z",
    completedAt: "2026-08-25T10:01:00.000Z",
    updatedAt: "2026-08-25T10:01:00.000Z",
    ...overrides,
  };
}

describe("AgentsPanel", () => {
  it("renders a failed session without referencing removed status state", () => {
    const model: AgentPanelModel = {
      workflows: [],
      directAgents: [
        agent({
          id: "01a03914-e401-7100-b9e5-f9503326a711",
          status: "failed",
          title: "01a03914-e401-7100-b9e5-f9503326a711",
        }),
      ],
      runningCount: 0,
      waitingCount: 0,
      idleCount: 0,
      settledCount: 1,
      totalTokens: 1200,
      hasAgents: true,
      liveCount: 0,
    };

    expect(() => renderToStaticMarkup(<AgentsPanel model={model} />)).not.toThrow();
    const html = renderToStaticMarkup(<AgentsPanel model={model} />);
    expect(html).toContain("Failed");
    expect(html).toContain("Failed lookup");
  });
});
