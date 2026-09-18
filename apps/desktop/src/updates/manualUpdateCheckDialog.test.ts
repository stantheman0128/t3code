import { assert, describe, it } from "@effect/vitest";

import type { DesktopUpdateState } from "@t3tools/contracts";

import { resolveManualUpdateCheckDialog } from "./manualUpdateCheckDialog.ts";

function state(overrides: Partial<DesktopUpdateState>): DesktopUpdateState {
  return {
    enabled: true,
    status: "idle",
    channel: "latest",
    currentVersion: "0.0.98",
    hostArch: "x64",
    appArch: "x64",
    runningUnderArm64Translation: false,
    availableVersion: null,
    downloadedVersion: null,
    releaseNotes: [],
    omittedReleaseCount: 0,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
    ...overrides,
  };
}

describe("resolveManualUpdateCheckDialog", () => {
  it("names an available update instead of staying silent", () => {
    assert.deepStrictEqual(
      resolveManualUpdateCheckDialog(state({ status: "available", availableVersion: "0.0.99" })),
      {
        kind: "available",
        currentVersion: "0.0.98",
        availableVersion: "0.0.99",
      },
    );
  });

  it("offers install when a build is already downloaded", () => {
    assert.deepStrictEqual(
      resolveManualUpdateCheckDialog(state({ status: "downloaded", downloadedVersion: "0.0.99" })),
      { kind: "downloaded", version: "0.0.99" },
    );
  });

  it("keeps the up-to-date and error dialogs", () => {
    assert.deepStrictEqual(resolveManualUpdateCheckDialog(state({ status: "up-to-date" })), {
      kind: "up-to-date",
      currentVersion: "0.0.98",
    });
    assert.deepStrictEqual(
      resolveManualUpdateCheckDialog(state({ status: "error", message: "refused" })),
      { kind: "error", message: "refused" },
    );
    assert.deepStrictEqual(resolveManualUpdateCheckDialog(state({ status: "checking" })), {
      kind: "none",
    });
  });
});
