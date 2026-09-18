import { assert, describe, it } from "@effect/vitest";

import {
  resolveDefaultDesktopUpdateChannel,
  shouldApplyAvailableUpdate,
} from "./updateChannels.ts";

describe("updateChannels", () => {
  it("maps nightly versions to the nightly channel", () => {
    assert.equal(resolveDefaultDesktopUpdateChannel("0.0.99"), "latest");
    assert.equal(resolveDefaultDesktopUpdateChannel("0.0.99-nightly.20260909.1"), "nightly");
  });

  it("accepts latest-shaped local-feed versions even on the nightly track", () => {
    assert.isTrue(
      shouldApplyAvailableUpdate({
        version: "0.0.100",
        selectedChannel: "nightly",
        localFeedEnabled: true,
      }),
    );
    assert.isFalse(
      shouldApplyAvailableUpdate({
        version: "0.0.100",
        selectedChannel: "nightly",
        localFeedEnabled: false,
      }),
    );
  });
});
