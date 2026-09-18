import type { DesktopUpdateChannel } from "@t3tools/contracts";

const NIGHTLY_VERSION_PATTERN = /-nightly\.\d{8}\.\d+$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return NIGHTLY_VERSION_PATTERN.test(version);
}

export function resolveDefaultDesktopUpdateChannel(appVersion: string): DesktopUpdateChannel {
  return isNightlyDesktopVersion(appVersion) ? "nightly" : "latest";
}

export function shouldApplyAvailableUpdate(input: {
  readonly version: string;
  readonly selectedChannel: DesktopUpdateChannel;
  readonly localFeedEnabled: boolean;
}): boolean {
  if (input.localFeedEnabled) {
    return true;
  }
  return resolveDefaultDesktopUpdateChannel(input.version) === input.selectedChannel;
}
