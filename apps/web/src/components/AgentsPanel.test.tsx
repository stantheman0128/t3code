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
      background: [],
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

  it("lists idle scheduled loops with Stop, not as Direct spawns", () => {
    const model: AgentPanelModel = {
      workflows: [],
      background: [
        agent({
          id: "01a039ba3569",
          kind: "scheduled",
          status: "idle",
          title: "Daily T3 fork sync.",
          progress: "every 1 day",
          error: null,
          result: null,
          usage: null,
        }),
      ],
      directAgents: [],
      runningCount: 0,
      waitingCount: 0,
      idleCount: 1,
      settledCount: 0,
      totalTokens: 0,
      hasAgents: true,
      liveCount: 0,
    };

    const html = renderToStaticMarkup(
      <AgentsPanel model={model} canStopAgent onStopAgent={() => undefined} />,
    );
    expect(html).toContain("Scheduled / Monitoring");
    expect(html).toContain("Daily T3 fork sync.");
    expect(html).toContain("every 1 day");
    expect(html).toContain("Stop");
    expect(html).not.toContain("Direct spawns");
  });

  it("expanded live agents with tool uses do not say no output yet", () => {
    const model: AgentPanelModel = {
      workflows: [],
      background: [],
      directAgents: [
        agent({
          id: "exec-1",
          status: "running",
          title: "Investigate T3 UI bugs",
          error: null,
          result: null,
          usage: { totalTokens: 71400, toolUses: 48 },
          recentActivity: [],
        }),
      ],
      runningCount: 1,
      waitingCount: 0,
      idleCount: 0,
      settledCount: 0,
      totalTokens: 71400,
      hasAgents: true,
      liveCount: 1,
    };

    const html = renderToStaticMarkup(<AgentsPanel model={model} />);
    expect(html).toContain("48 tools");
    expect(html).not.toContain("No output yet");
  });

  it("lists lastToolName when Grok has not streamed a procedure yet", () => {
    const model: AgentPanelModel = {
      workflows: [],
      background: [],
      directAgents: [
        agent({
          id: "exec-2",
          status: "running",
          title: "Investigate T3 UI bugs",
          error: null,
          result: null,
          lastToolName: "read_file",
          usage: { totalTokens: 1200, toolUses: 4 },
          recentActivity: [],
        }),
      ],
      runningCount: 1,
      waitingCount: 0,
      idleCount: 0,
      settledCount: 0,
      totalTokens: 1200,
      hasAgents: true,
      liveCount: 1,
    };

    const html = renderToStaticMarkup(<AgentsPanel model={model} />);
    expect(html).toContain("read_file");
    expect(html).not.toContain("No output yet");
  });

  it("keeps a settled agent's procedure open so the steps stay visible", () => {
    const model: AgentPanelModel = {
      workflows: [],
      background: [],
      directAgents: [
        agent({
          id: "exec-done",
          status: "completed",
          title: "Investigate T3 UI bugs",
          error: null,
          result: "Found the overlap.",
          lastToolName: "Read file",
          usage: { totalTokens: 900, toolUses: 3 },
          recentActivity: [
            { at: "2026-01-01T00:00:00.000Z", summary: "▸ Read file" },
            { at: "2026-01-01T00:00:02.000Z", summary: "▸ Grep" },
          ],
        }),
      ],
      runningCount: 0,
      waitingCount: 0,
      idleCount: 0,
      settledCount: 1,
      totalTokens: 900,
      hasAgents: true,
      liveCount: 0,
    };

    const html = renderToStaticMarkup(<AgentsPanel model={model} />);
    expect(html).toContain("Read file");
    expect(html).toContain("Grep");
  });

  it("opens a live agent on the procedure list instead of hiding it behind a collapsed panel", () => {
    const model: AgentPanelModel = {
      workflows: [],
      background: [],
      directAgents: [
        agent({
          id: "exec-3",
          status: "running",
          title: "Investigate T3 UI bugs",
          error: null,
          result: null,
          lastToolName: "grep",
          usage: { totalTokens: 800, toolUses: 2 },
          recentActivity: [
            { at: "2026-08-26T10:00:00.000Z", summary: "▸ read_file" },
            { at: "2026-08-26T10:00:05.000Z", summary: "▸ grep" },
          ],
        }),
      ],
      runningCount: 1,
      waitingCount: 0,
      idleCount: 0,
      settledCount: 0,
      totalTokens: 800,
      hasAgents: true,
      liveCount: 1,
    };

    const html = renderToStaticMarkup(<AgentsPanel model={model} />);
    expect(html).toContain("read_file");
    expect(html).toContain("grep");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("shows the live grep pattern instead of only the tool name", () => {
    const model: AgentPanelModel = {
      workflows: [],
      background: [],
      directAgents: [
        agent({
          id: "exec-grep",
          status: "running",
          title: "Slow live Agents probe",
          error: null,
          result: null,
          lastToolName: "grep",
          usage: { totalTokens: 20300, toolUses: 20 },
          recentActivity: [
            {
              at: "2026-08-28T06:00:00.000Z",
              summary: "Searched files · find.toggle · apps/web/src",
            },
          ],
        }),
      ],
      runningCount: 1,
      waitingCount: 0,
      idleCount: 0,
      settledCount: 0,
      totalTokens: 20300,
      hasAgents: true,
      liveCount: 1,
    };

    const html = renderToStaticMarkup(<AgentsPanel model={model} />);
    expect(html).toContain("find.toggle");
    expect(html).toContain("apps/web/src");
    expect(html).toContain("Slow live Agents probe");
  });

  it("shows a live monitor's events instead of only a truncated session path", () => {
    const model: AgentPanelModel = {
      workflows: [],
      background: [
        agent({
          id: "mon-live",
          kind: "monitor",
          status: "running",
          title: "Watch only T3-parity PRs",
          error: null,
          result: null,
          usage: null,
          outputFile:
            "C:\\Users\\stans\\.grok\\sessions\\C%3A%5CUsers%5Cstans\\Projects\\t3code-grok-parity\\updates.jsonl",
          recentActivity: [
            { at: "2026-08-28T05:00:00.000Z", summary: "PR #1202 opened" },
            { at: "2026-08-28T05:00:08.000Z", summary: "checks: pass" },
          ],
        }),
      ],
      directAgents: [],
      runningCount: 1,
      waitingCount: 0,
      idleCount: 0,
      settledCount: 0,
      totalTokens: 0,
      hasAgents: true,
      liveCount: 1,
    };

    const html = renderToStaticMarkup(<AgentsPanel model={model} />);
    expect(html).toContain("PR #1202 opened");
    expect(html).toContain("checks: pass");
    expect(html).toContain("Log:");
    expect(html).toContain("t3code-grok-parity/updates.jsonl");
  });

  it("tells a live monitor with no events yet that the log is waiting", () => {
    const model: AgentPanelModel = {
      workflows: [],
      background: [
        agent({
          id: "mon-empty",
          kind: "monitor",
          status: "running",
          title: "Watch PRs",
          error: null,
          result: null,
          usage: null,
          recentActivity: [],
        }),
      ],
      directAgents: [],
      runningCount: 1,
      waitingCount: 0,
      idleCount: 0,
      settledCount: 0,
      totalTokens: 0,
      hasAgents: true,
      liveCount: 1,
    };

    const html = renderToStaticMarkup(<AgentsPanel model={model} />);
    expect(html).toContain("Watching. New events show up here as they fire.");
  });
});
