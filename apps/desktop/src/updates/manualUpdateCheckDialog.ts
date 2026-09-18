import type { DesktopUpdateState } from "@t3tools/contracts";

export type ManualUpdateCheckDialog =
  | { readonly kind: "up-to-date"; readonly currentVersion: string }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "available";
      readonly currentVersion: string;
      readonly availableVersion: string;
    }
  | { readonly kind: "downloaded"; readonly version: string }
  | { readonly kind: "none" };

export function resolveManualUpdateCheckDialog(state: DesktopUpdateState): ManualUpdateCheckDialog {
  if (state.status === "available" && state.availableVersion) {
    return {
      kind: "available",
      currentVersion: state.currentVersion,
      availableVersion: state.availableVersion,
    };
  }
  if (state.status === "downloaded") {
    return {
      kind: "downloaded",
      version: state.downloadedVersion ?? state.availableVersion ?? state.currentVersion,
    };
  }
  if (state.status === "up-to-date") {
    return { kind: "up-to-date", currentVersion: state.currentVersion };
  }
  if (state.status === "error") {
    return {
      kind: "error",
      message: state.message ?? "An unknown error occurred. Please try again later.",
    };
  }
  return { kind: "none" };
}
