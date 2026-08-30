/**
 * Open the official CLI login in a visible console. T3 never writes tokens.
 *
 * @module providerLogin
 */
// @effect-diagnostics nodeBuiltinImport:off - login must open a detached visible console; Effect ChildProcess is scoped and hidden.
import { spawn } from "node:child_process";
import {
  ServerProviderLoginError,
  type ProviderInstanceId,
  type ServerProviderLoginResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { ProviderRegistry } from "./Services/ProviderRegistry.ts";

import { providerLoginSpec, type ProviderLoginSpec } from "@t3tools/shared/providerLogin";
export { providerLoginSpec, type ProviderLoginSpec };

export interface VisibleProviderLoginLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly options: {
    readonly detached: true;
    readonly stdio: "ignore";
    readonly windowsHide?: false;
  };
}

export function visibleProviderLoginLaunch(input: {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly platform?: NodeJS.Platform;
  readonly comSpec?: string;
}): VisibleProviderLoginLaunch {
  const platform = input.platform ?? process.platform;
  if (platform === "win32") {
    const quote = (value: string) => (/\s/.test(value) ? `"${value}"` : value);
    const commandLine = [
      "start",
      '"T3 provider login"',
      quote(input.executable),
      ...input.args,
    ].join(" ");
    return {
      command: input.comSpec ?? process.env.ComSpec ?? "cmd.exe",
      args: ["/c", commandLine],
      options: { detached: true, stdio: "ignore", windowsHide: false },
    };
  }
  if (platform === "darwin") {
    const script = [input.executable, ...input.args].map((part) => JSON.stringify(part)).join(" ");
    return {
      command: "osascript",
      args: ["-e", `tell application "Terminal" to do script ${JSON.stringify(script)}`],
      options: { detached: true, stdio: "ignore" },
    };
  }
  return {
    command: "x-terminal-emulator",
    args: ["-e", input.executable, ...input.args],
    options: { detached: true, stdio: "ignore" },
  };
}

export function launchVisibleProviderLogin(input: {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly platform?: NodeJS.Platform;
}): void {
  const launch = visibleProviderLoginLaunch(input);
  spawn(launch.command, [...launch.args], launch.options).unref();
}

export const runProviderLogin = (
  instanceId: ProviderInstanceId,
): Effect.Effect<ServerProviderLoginResult, ServerProviderLoginError, ProviderRegistry> =>
  Effect.gen(function* () {
    const registry = yield* ProviderRegistry;
    const providers = yield* registry.getProviders;
    const snapshot = providers.find((provider) => provider.instanceId === instanceId);
    if (!snapshot) {
      return yield* new ServerProviderLoginError({
        instanceId,
        reason: "That provider instance is not configured.",
      });
    }
    const spec = providerLoginSpec(snapshot.driver);
    if (!spec) {
      return yield* new ServerProviderLoginError({
        instanceId,
        reason: "This provider does not have a CLI login command.",
      });
    }
    launchVisibleProviderLogin({
      executable: spec.executable,
      args: spec.args,
    });
    return { command: spec.command };
  });
