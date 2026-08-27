import { describe, expect, it } from "vite-plus/test";

import {
  grokAutoCompactEvents,
  grokBackgroundInterruptRequest,
  grokBackgroundTaskEvents,
  grokHookEvents,
  grokMonitorEventEvents,
  grokQueueChangedEvents,
  grokScheduledTaskEvents,
  grokSessionRecapEvents,
  parseXAiAutoCompact,
  parseXAiBackgroundTask,
  parseXAiHookExecution,
  parseXAiMonitorEvent,
  parseXAiQueueChanged,
  parseXAiScheduledTask,
  parseXAiSessionRecap,
  parseXAiTurnCompletedUsage,
} from "./GrokAcpSessionExtras.ts";

describe("GrokAcpSessionExtras", () => {
  it("maps hook_execution runs onto hook.started then hook.completed", () => {
    const parsed = parseXAiHookExecution({
      update: {
        sessionUpdate: "hook_execution",
        event_name: "user_prompt_submit",
        runs: [
          {
            name: "global/settings:user_prompt_submit[0].hooks[0]",
            status: { status: "success", elapsed_ms: 177 },
          },
        ],
      },
    });
    expect(parsed?.hookEvent).toBe("user_prompt_submit");
    expect(grokHookEvents(parsed!)).toEqual([
      {
        type: "hook.started",
        payload: {
          hookId: "global/settings:user_prompt_submit[0].hooks[0]",
          hookName: "global/settings:user_prompt_submit[0].hooks[0]",
          hookEvent: "user_prompt_submit",
        },
      },
      {
        type: "hook.completed",
        payload: {
          hookId: "global/settings:user_prompt_submit[0].hooks[0]",
          outcome: "success",
        },
      },
    ]);
  });

  it("maps auto_compact_started onto the context window with compactsAutomatically", () => {
    const parsed = parseXAiAutoCompact({
      update: {
        sessionUpdate: "auto_compact_started",
        tokens_used: 402_072,
        context_window: 500_000,
        percentage: 80,
        reason: "Context window 80% full",
      },
    });
    const events = grokAutoCompactEvents(parsed!, undefined, false);
    expect(events).toContainEqual({
      type: "thread.token-usage.updated",
      payload: {
        usage: {
          usedTokens: 402_072,
          lastUsedTokens: 402_072,
          maxTokens: 500_000,
          compactsAutomatically: true,
        },
      },
    });
    expect(events[0]).toMatchObject({
      type: "session.state.changed",
      payload: { state: "waiting", reason: "Context window 80% full" },
    });
  });

  it("maps auto_compact_completed onto compacted thread state", () => {
    const parsed = parseXAiAutoCompact({
      update: {
        sessionUpdate: "auto_compact_completed",
        tokens_before: 402_072,
        tokens_after: 42_380,
        elapsed_ms: 118_411,
      },
    });
    const events = grokAutoCompactEvents(
      parsed!,
      {
        usedTokens: 402_072,
        maxTokens: 500_000,
        lastUsedTokens: 402_072,
        compactsAutomatically: true,
      },
      false,
    );
    expect(events).toEqual([
      {
        type: "thread.token-usage.updated",
        payload: {
          usage: {
            usedTokens: 42_380,
            lastUsedTokens: 402_072,
            totalProcessedTokens: 402_072,
            maxTokens: 500_000,
            compactsAutomatically: true,
          },
        },
      },
      {
        type: "session.state.changed",
        payload: { state: "ready", reason: "compaction completed", detail: parsed },
      },
      {
        type: "thread.state.changed",
        payload: { state: "compacted", detail: parsed },
      },
    ]);
  });

  it("keeps compaction-complete running only while a turn is live", () => {
    const parsed = parseXAiAutoCompact({
      update: {
        sessionUpdate: "auto_compact_completed",
        tokens_before: 402_072,
        tokens_after: 42_380,
      },
    });
    const events = grokAutoCompactEvents(parsed!, undefined, true);
    expect(events).toContainEqual({
      type: "session.state.changed",
      payload: { state: "running", reason: "compaction completed", detail: parsed },
    });
  });

  it("publishes session_recap onto thread.metadata, never as a title", () => {
    const parsed = parseXAiSessionRecap({
      update: {
        sessionUpdate: "session_recap",
        summary: "Mapped Grok extras onto T3 runtime events.",
        auto: true,
      },
    });
    expect(grokSessionRecapEvents(parsed!)).toEqual([
      {
        type: "thread.metadata.updated",
        payload: {
          metadata: {
            recap: "Mapped Grok extras onto T3 runtime events.",
            recapAuto: true,
          },
        },
      },
    ]);
  });

  it("reads complete PromptUsage costUsdTicks and skips incomplete bills", () => {
    const complete = parseXAiTurnCompletedUsage({
      update: {
        sessionUpdate: "turn_completed",
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          costUsdTicks: 1_626_488_800,
        },
      },
    });
    expect(complete?.usage.usedTokens).toBe(120);
    expect(complete?.costUsd).toBeCloseTo(0.16264888);

    const incomplete = parseXAiTurnCompletedUsage({
      update: {
        sessionUpdate: "turn_completed",
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          costUsdTicks: 100,
          incomplete: true,
        },
      },
    });
    expect(incomplete?.usage.usedTokens).toBe(120);
    expect(incomplete?.costUsd).toBeUndefined();
  });

  it("keeps context occupancy when turn_completed PromptUsage is a billed sum", () => {
    const billed = parseXAiTurnCompletedUsage(
      {
        update: {
          sessionUpdate: "turn_completed",
          usage: {
            inputTokens: 9_100_000,
            outputTokens: 100_000,
            totalTokens: 9_200_000,
            modelCalls: 50,
            costUsdTicks: 1_000,
          },
        },
      },
      500_000,
      { usedTokens: 169_509, maxTokens: 500_000, lastUsedTokens: 169_509 },
    );
    expect(billed?.usage.usedTokens).toBe(169_509);
    expect(billed?.usage.totalProcessedTokens).toBe(9_200_000);
    expect(billed?.usage.maxTokens).toBe(500_000);
  });

  it("maps backgrounded shells onto local_bash tasks", () => {
    const started = parseXAiBackgroundTask({
      update: {
        sessionUpdate: "task_backgrounded",
        task_id: "call-bg-1",
        command: "sleep 10",
        output_file: "/tmp/out.log",
        description: "Wait in the background",
      },
    });
    expect(grokBackgroundTaskEvents(started!)[0]).toMatchObject({
      type: "task.started",
      payload: { taskId: "call-bg-1", taskType: "local_bash", outputFile: "/tmp/out.log" },
    });

    const finished = parseXAiBackgroundTask({
      update: {
        sessionUpdate: "task_completed",
        task_snapshot: {
          task_id: "call-bg-1",
          command: "sleep 10",
          exit_code: 0,
          output: "done",
        },
      },
    });
    expect(grokBackgroundTaskEvents(finished!)[0]).toMatchObject({
      type: "task.completed",
      payload: { status: "completed", summary: "done" },
    });
  });

  it("maps monitor_description background tasks onto monitor, not local_bash", () => {
    const started = parseXAiBackgroundTask({
      update: {
        sessionUpdate: "task_backgrounded",
        task_id: "mon-1",
        command: "gh pr checks --watch",
        monitor_description: "gh pr checks --watch",
        description: "Watch PR checks",
      },
    });
    expect(grokBackgroundTaskEvents(started!)[0]).toMatchObject({
      type: "task.started",
      payload: {
        taskId: "mon-1",
        taskType: "monitor",
        title: "Watch PR checks",
        timelineBypass: true,
      },
    });
  });

  it("maps scheduled_task_created onto an idle loop task, not a live monitor", () => {
    const parsed = parseXAiScheduledTask({
      update: {
        sessionUpdate: "scheduled_task_created",
        task_id: "01a039ba3569",
        prompt: "Daily T3 fork sync.\nRepo: t3code-grok-parity",
        human_schedule: "every 1 day",
        next_fire_at: "2026-08-26T16:21:39.817390300+00:00",
      },
    });
    expect(parsed).toMatchObject({
      kind: "created",
      taskId: "01a039ba3569",
      humanSchedule: "every 1 day",
    });
    const events = grokScheduledTaskEvents(parsed!);
    expect(events[0]).toMatchObject({
      type: "task.started",
      payload: {
        taskId: "01a039ba3569",
        taskType: "loop",
        title: "Daily T3 fork sync.",
        timelineBypass: true,
      },
    });
    expect(events[1]).toMatchObject({
      type: "task.updated",
      payload: { taskId: "01a039ba3569", taskType: "loop", status: "idle" },
    });
  });

  it("maps scheduled_task_fired and scheduled_task_deleted onto the same loop id", () => {
    const fired = parseXAiScheduledTask({
      update: { sessionUpdate: "scheduled_task_fired", task_id: "loop-1", prompt: "check CI" },
    });
    expect(grokScheduledTaskEvents(fired!)[0]).toMatchObject({
      type: "task.progress",
      payload: { taskId: "loop-1", taskType: "loop", status: "idle", timelineBypass: true },
    });

    const deleted = parseXAiScheduledTask({
      update: { sessionUpdate: "scheduled_task_deleted", task_id: "loop-1" },
    });
    expect(grokScheduledTaskEvents(deleted!)[0]).toMatchObject({
      type: "task.completed",
      payload: { taskId: "loop-1", taskType: "loop", status: "cancelled" },
    });
  });

  it("maps monitor_event onto task.progress for the monitor id", () => {
    const parsed = parseXAiMonitorEvent({
      update: {
        sessionUpdate: "monitor_event",
        task_id: "mon-1",
        event_text: "checks: pass",
      },
    });
    expect(grokMonitorEventEvents(parsed!)).toEqual([
      {
        type: "task.progress",
        payload: {
          taskId: "mon-1",
          taskType: "monitor",
          summary: "checks: pass",
          timelineBypass: true,
        },
      },
    ]);
  });

  it("reads monitor output from text when event_text is absent", () => {
    const parsed = parseXAiMonitorEvent({
      update: {
        sessionUpdate: "monitor_event",
        task_id: "mon-2",
        text: "PR #1202 opened",
      },
    });
    expect(parsed).toEqual({ taskId: "mon-2", eventText: "PR #1202 opened" });
  });

  it("routes Stop to scheduler/delete for loops and task/kill for monitors", () => {
    expect(grokBackgroundInterruptRequest("sess-1", "loop-1", new Set(["loop-1"]))).toEqual({
      method: "_x.ai/scheduler/delete",
      payload: { sessionId: "sess-1", id: "loop-1" },
    });
    expect(grokBackgroundInterruptRequest("sess-1", "mon-1", new Set(["loop-1"]))).toEqual({
      method: "_x.ai/task/kill",
      payload: { sessionId: "sess-1", taskId: "mon-1" },
    });
  });

  it("projects queue length onto session state without inventing a third surface", () => {
    const parsed = parseXAiQueueChanged({
      sessionId: "sess-1",
      entries: [{ prompt: "follow up" }],
    });
    expect(grokQueueChangedEvents(parsed!, true)).toEqual([
      {
        type: "session.state.changed",
        payload: {
          state: "waiting",
          reason: "queue:1",
          detail: { queueLength: 1 },
        },
      },
      {
        type: "thread.metadata.updated",
        payload: { metadata: { grokQueueLength: 1 } },
      },
    ]);
  });
});
