import { describe, expect, it } from "vite-plus/test";

import {
  applyGrokSubagentUpdate,
  applyGrokWorkflowUpdate,
  emptyGrokWorkflowTrackState,
  grokChildToolProgressEvent,
  grokSessionIdFromRaw,
  grokWorkflowMemberTaskId,
  parseXAiSubagentUpdate,
  parseXAiWorkflowUpdated,
} from "./GrokAcpWorkflow.ts";

const workflowEnvelope = {
  sessionId: "sess-1",
  update: {
    sessionUpdate: "workflow_updated",
    run_id: "wf_review_1",
    name: "review-changes",
    objective: "Review the latest diff",
    status: "active",
    phases: [
      { title: "Plan", state: "done" },
      { title: "Execute", state: "active" },
    ],
    current_phase: "Execute",
    agents: [
      {
        agent_id: "agent_reviewer",
        label: "Reviewer",
        state: "running",
        tokens_used: 42,
        duration_ms: 800,
      },
    ],
  },
};

describe("GrokAcpWorkflow", () => {
  it("stamps workflow members like Claude: parentAgentId + timelineBypass + stable slot", () => {
    const update = parseXAiWorkflowUpdated(workflowEnvelope);
    expect(update).toBeDefined();
    const first = applyGrokWorkflowUpdate(emptyGrokWorkflowTrackState(), update!);
    const memberStarted = first.events.find(
      (event) => event.type === "task.started" && event.payload.taskType === "subagent",
    );
    expect(memberStarted?.payload).toMatchObject({
      taskId: grokWorkflowMemberTaskId("wf_review_1", "agent_reviewer"),
      parentAgentId: "wf_review_1",
      timelineBypass: true,
    });
    expect(memberStarted?.payload.agentId).toBeUndefined();
    const eventTypes: ReadonlyArray<string> = first.events.map((event) => event.type);
    expect(eventTypes).not.toContain("thread.token-usage.updated");
  });

  it("completes a run that is already terminal on the first notification", () => {
    const update = parseXAiWorkflowUpdated({
      update: {
        sessionUpdate: "workflow_updated",
        run_id: "wf_done",
        name: "review-changes",
        status: "complete",
        result_summary: "Shipped",
        phases: [],
        agents: [],
      },
    });
    const applied = applyGrokWorkflowUpdate(emptyGrokWorkflowTrackState(), update!);
    expect(applied.events.map((event) => event.type)).toEqual(["task.started", "task.completed"]);
    expect(applied.events[1]?.payload).toMatchObject({ status: "completed", summary: "Shipped" });
  });

  it("does not re-emit unchanged member ticks", () => {
    const update = parseXAiWorkflowUpdated(workflowEnvelope)!;
    const first = applyGrokWorkflowUpdate(emptyGrokWorkflowTrackState(), update);
    const second = applyGrokWorkflowUpdate(first.state, update);
    expect(second.events.some((event) => event.payload.taskType === "subagent")).toBe(false);
  });

  it("uses spawn description as the child title instead of the session id", () => {
    const spawned = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_spawned",
        subagent_id: "01a03914-e401-7100-b9e5-f9503326a711",
        subagent_type: "general-purpose",
        description: "Explore ClaudePulse UI",
      },
    });
    const applied = applyGrokSubagentUpdate(emptyGrokWorkflowTrackState(), spawned!);
    expect(applied.events[0]?.payload).toMatchObject({
      title: "Explore ClaudePulse UI",
      role: "general-purpose",
    });
    expect(String(applied.events[0]?.payload.title)).not.toContain("01a03914");
  });

  it("maps SubagentFinished onto a terminal child task", () => {
    const spawned = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_spawned",
        subagent_id: "sa_1",
        parent_session_id: "sess-1",
        child_session_id: "child-1",
        subagent_type: "explore",
      },
    });
    const finished = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_finished",
        subagent_id: "sa_1",
        child_session_id: "child-1",
        status: "completed",
        tokens_used: 90,
      },
    });
    const afterSpawn = applyGrokSubagentUpdate(emptyGrokWorkflowTrackState(), spawned!);
    const afterFinish = applyGrokSubagentUpdate(afterSpawn.state, finished!);
    expect(afterSpawn.events[0]).toMatchObject({
      type: "task.started",
      payload: { timelineBypass: true, role: "explore", parentAgentId: "sess-1" },
    });
    expect(afterFinish.events[0]).toMatchObject({
      type: "task.completed",
      payload: { status: "completed", typedUsage: { totalTokens: 90 } },
    });
  });

  it("keeps member identity on the Grok agent_id when the array is filtered or reordered", () => {
    const update = parseXAiWorkflowUpdated({
      update: {
        sessionUpdate: "workflow_updated",
        run_id: "wf_review_1",
        name: "review-changes",
        status: "active",
        agents: [
          { label: "broken" },
          {
            agent_id: "agent_reviewer",
            label: "Reviewer",
            state: "running",
          },
        ],
      },
    });
    const applied = applyGrokWorkflowUpdate(emptyGrokWorkflowTrackState(), update!);
    const member = applied.events.find(
      (event) => event.type === "task.started" && event.payload.taskType === "subagent",
    );
    expect(member?.payload.taskId).toBe("wf_review_1:wf:agent_reviewer");
  });

  it("puts the latest tools_used name on progress as lastToolName", () => {
    const progress = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_progress",
        subagent_id: "sa_tools",
        tools_used: ["grep", "read_file"],
      },
    });
    const applied = applyGrokSubagentUpdate(emptyGrokWorkflowTrackState(), progress!);
    expect(applied.events.at(-1)?.payload).toMatchObject({
      lastToolName: "read_file",
      summary: "read_file",
    });
  });

  it("carries duration and tool-use counts on subagent progress and finish", () => {
    const progress = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_progress",
        subagent_id: "sa_1",
        tool_call_count: 3,
      },
    });
    const afterProgress = applyGrokSubagentUpdate(emptyGrokWorkflowTrackState(), progress!);
    expect(afterProgress.events.at(-1)?.payload.typedUsage).toEqual({
      totalTokens: 0,
      toolUses: 3,
    });

    const finished = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_finished",
        subagent_id: "sa_1",
        status: "completed",
        tokens_used: 90,
        duration_ms: 1200,
        tool_calls: 4,
        tools_used: ["grep", "read_file"],
      },
    });
    const afterFinish = applyGrokSubagentUpdate(afterProgress.state, finished!);
    expect(afterFinish.events[0]?.payload.typedUsage).toEqual({
      totalTokens: 90,
      durationMs: 1200,
      toolUses: 4,
    });
    expect(afterFinish.events[0]?.payload.lastToolName).toBe("read_file");
  });

  it("does not let a tool-only tick zero earlier subagent tokens", () => {
    const withTokens = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_progress",
        subagent_id: "sa_1",
        tokens_used: 90,
      },
    });
    const toolsOnly = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_progress",
        subagent_id: "sa_1",
        tool_call_count: 3,
      },
    });
    const finishedDurationOnly = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_finished",
        subagent_id: "sa_1",
        status: "completed",
        duration_ms: 1200,
      },
    });
    const afterTokens = applyGrokSubagentUpdate(emptyGrokWorkflowTrackState(), withTokens!);
    const afterTools = applyGrokSubagentUpdate(afterTokens.state, toolsOnly!);
    const afterFinish = applyGrokSubagentUpdate(afterTools.state, finishedDurationOnly!);
    expect(afterTools.events.at(-1)?.payload.typedUsage).toEqual({
      totalTokens: 90,
      toolUses: 3,
    });
    expect(afterFinish.events[0]?.payload.typedUsage).toEqual({
      totalTokens: 90,
      durationMs: 1200,
      toolUses: 3,
    });
  });

  it("maps child-session tool calls onto the live subagent as lastToolName", () => {
    const spawned = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_spawned",
        subagent_id: "sa_1",
        child_session_id: "child-1",
        subagent_type: "explore",
        description: "Investigate T3 UI bugs",
      },
    });
    const afterSpawn = applyGrokSubagentUpdate(emptyGrokWorkflowTrackState(), spawned!);
    expect(afterSpawn.state.subagentByChildSessionId.get("child-1")).toBe("sa_1");

    const fromChildSession = grokChildToolProgressEvent(
      afterSpawn.state,
      grokSessionIdFromRaw({ sessionId: "child-1", update: { sessionUpdate: "tool_call" } }),
      { title: "read_file", kind: "read" },
    );
    expect(fromChildSession).toMatchObject({
      type: "task.progress",
      payload: {
        taskId: "sa_1",
        lastToolName: "read_file",
        summary: "read_file",
        timelineBypass: true,
      },
    });

    const fromParentWhileOneChildLive = grokChildToolProgressEvent(
      afterSpawn.state,
      "sess-parent",
      { command: "rg lastToolName" },
    );
    expect(fromParentWhileOneChildLive?.payload).toMatchObject({
      taskId: "sa_1",
      lastToolName: "rg lastToolName",
    });
  });

  it("does not pin parent-session tools onto a finished child", () => {
    const spawned = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_spawned",
        subagent_id: "sa_1",
        child_session_id: "child-1",
      },
    });
    const finished = parseXAiSubagentUpdate({
      update: {
        sessionUpdate: "subagent_finished",
        subagent_id: "sa_1",
        child_session_id: "child-1",
        status: "completed",
      },
    });
    const afterFinish = applyGrokSubagentUpdate(
      applyGrokSubagentUpdate(emptyGrokWorkflowTrackState(), spawned!).state,
      finished!,
    );
    expect(
      grokChildToolProgressEvent(afterFinish.state, "child-1", { title: "read_file" }),
    ).toBeUndefined();
  });

  it("pins unmapped child tools onto the lone live monitor", () => {
    const event = grokChildToolProgressEvent(
      emptyGrokWorkflowTrackState(),
      "watch-session",
      { title: "read_file" },
      new Set(["mon-1"]),
    );
    expect(event?.payload).toMatchObject({
      taskId: "mon-1",
      lastToolName: "read_file",
      summary: "read_file",
    });
  });
});
