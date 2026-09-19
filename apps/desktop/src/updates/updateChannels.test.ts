import { assert, describe, it } from "@effect/vitest";

import {
  isNightlyDesktopVersion,
  resolveDefaultDesktopUpdateChannel,
  shouldApplyAvailableUpdate,
} from "./updateChannels.ts";

describe("updateChannels", () => {
  it("maps nightly versions to the nightly channel", () => {
    assert.equal(resolveDefaultDesktopUpdateChannel("0.0.99"), "latest");
    assert.equal(resolveDefaultDesktopUpdateChannel("0.0.99-nightly.20260909.1"), "nightly");
  });

  it("keeps preview builds branded as nightly but on the latest update channel", () => {
    assert.isTrue(isNightlyDesktopVersion("0.0.41-preview.20260911.7"));
    assert.equal(resolveDefaultDesktopUpdateChannel("0.0.41-preview.20260911.7"), "latest");
    assert.equal(resolveDefaultDesktopUpdateChannel("0.0.41-nightly.20260911.7"), "nightly");
  });

  it("only matches the first prerelease identifier", () => {
    assert.isFalse(isNightlyDesktopVersion("1.2.3-foo-preview.20260911.1"));
    assert.isFalse(isNightlyDesktopVersion("1.2.3"));
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
