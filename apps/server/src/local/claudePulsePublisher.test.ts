import { describe, expect, it } from "vite-plus/test";

import {
  mapAwarenessPhaseToPulseEvent,
  parseClaudePulsePortFile,
  pulsePublishIdentity,
  resolveClaudePulsePortFilePath,
} from "./claudePulsePublisher.ts";

describe("claudePulsePublisher mapping", () => {
  it("maps running work to a working hook", () => {
    expect(mapAwarenessPhaseToPulseEvent("running")).toEqual({
      hook_event_name: "UserPromptSubmit",
    });
  });

  it("maps approval waits to a permission notification", () => {
    expect(mapAwarenessPhaseToPulseEvent("waiting_for_approval")).toEqual({
      hook_event_name: "Notification",
      notification_type: "permission_prompt",
    });
  });

  it("maps a finished turn to Stop", () => {
    expect(mapAwarenessPhaseToPulseEvent("completed")).toEqual({
      hook_event_name: "Stop",
    });
  });

  it("maps a missing phase to SessionEnd", () => {
    expect(mapAwarenessPhaseToPulseEvent(null)).toEqual({
      hook_event_name: "SessionEnd",
    });
  });

  it("treats the same hook as unchanged identity", () => {
    expect(
      pulsePublishIdentity({
        source: "t3",
        session_id: "t1",
        hook_event_name: "Stop",
        cwd: "C:\\repo",
      }),
    ).toBe("Stop:");
  });

  it("reads the Pulse port file from LocalAppData", () => {
    expect(resolveClaudePulsePortFilePath("C:\\Users\\stans\\AppData\\Local")).toBe(
      "C:\\Users\\stans\\AppData\\Local\\ClaudePulse\\port.txt",
    );
    expect(parseClaudePulsePortFile("19281\n")).toBe(19281);
    expect(parseClaudePulsePortFile("80")).toBeNull();
  });
});
