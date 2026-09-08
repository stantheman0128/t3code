import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type KeybindingCommand,
  type ModelSelection,
} from "@t3tools/contracts";
import {
  buildSpawnProviderThreadTitle,
  resolveSpawnProviderModelSelection,
  SPAWN_PROVIDER_TARGETS,
  type SpawnProviderCommand,
} from "@t3tools/shared/spawnProviderSession";
import { truncate } from "@t3tools/shared/String";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { waitForStartedServerThread } from "../components/ChatView.logic";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { resolveThreadActionProjectRef } from "../lib/chatThreadActions";
import { newMessageId, newThreadId } from "../lib/utils";
import { environmentServerConfigsAtom, primaryServerProvidersAtom } from "../state/server";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useHandleNewThread } from "./useHandleNewThread";

/** Shared across ChatView, the command palette, and global shortcuts. */
let spawnProviderSessionInFlight = false;

export function spawnProviderCommandFromKeybinding(
  command: KeybindingCommand,
): SpawnProviderCommand | null {
  switch (command) {
    case "chat.spawnCodex":
      return "spawn-codex";
    case "chat.spawnGrok":
      return "spawn-grok";
    case "chat.spawnGrokbot":
      return "spawn-grokbot";
    default:
      return null;
  }
}

export function useSpawnProviderSession() {
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread } =
    useHandleNewThread();
  const environmentServerConfigs = useAtomValue(environmentServerConfigsAtom);
  const primaryServerProviders = useAtomValue(primaryServerProvidersAtom);
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const deleteThread = useAtomCommand(threadEnvironment.delete, { reportFailure: false });
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const navigate = useNavigate();

  const spawnProviderSession = useCallback(
    async (
      command: SpawnProviderCommand,
      options?: { readonly prompt?: string | null },
    ): Promise<boolean> => {
      if (spawnProviderSessionInFlight) {
        return false;
      }
      const target = SPAWN_PROVIDER_TARGETS[command];
      const projectRef = resolveThreadActionProjectRef({
        activeDraftThread,
        activeThread: activeThread ?? undefined,
        defaultProjectRef,
        handleNewThread,
      });
      if (!projectRef) {
        toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: "Choose a project first",
            description: `Spawn opens a ${target.displayName} thread in the current project.`,
          }),
        );
        return false;
      }

      const providers =
        environmentServerConfigs.get(projectRef.environmentId)?.providers ?? primaryServerProviders;
      const modelSelection: ModelSelection | null = resolveSpawnProviderModelSelection(
        providers,
        target.driverKind,
      );
      if (!modelSelection) {
        toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: `${target.displayName} isn't ready`,
            description: `Enable it in Settings → Providers, then try again.`,
          }),
        );
        return false;
      }

      const workspaceOptions = activeThread
        ? {
            branch: activeThread.branch,
            worktreePath: activeThread.worktreePath,
            envMode: (activeThread.worktreePath ? "worktree" : "local") as const,
            startFromOrigin: false,
          }
        : activeDraftThread
          ? {
              branch: activeDraftThread.branch,
              worktreePath: activeDraftThread.worktreePath,
              envMode: activeDraftThread.envMode,
              startFromOrigin: activeDraftThread.startFromOrigin,
            }
          : undefined;

      const prompt = options?.prompt?.trim() ? options.prompt.trim() : null;
      spawnProviderSessionInFlight = true;
      try {
        if (prompt === null) {
          const opened = await handleNewThread(projectRef, {
            ...workspaceOptions,
            modelSelection,
          });
          return opened !== null;
        }

        const nextThreadId = newThreadId();
        const createdAt = new Date().toISOString();
        const nextThreadTitle = truncate(
          buildSpawnProviderThreadTitle({ displayName: target.displayName, prompt }),
        );
        const runtimeMode =
          activeThread?.runtimeMode ?? activeDraftThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE;

        const createResult = await createThread({
          environmentId: projectRef.environmentId,
          input: {
            threadId: nextThreadId,
            projectId: projectRef.projectId,
            title: nextThreadTitle,
            modelSelection,
            runtimeMode,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: workspaceOptions?.branch ?? null,
            worktreePath: workspaceOptions?.worktreePath ?? null,
            createdAt,
          },
        });
        let failure = createResult._tag === "Failure" ? createResult : null;

        if (failure === null) {
          const startResult = await startThreadTurn({
            environmentId: projectRef.environmentId,
            input: {
              threadId: nextThreadId,
              message: {
                messageId: newMessageId(),
                role: "user",
                text: prompt,
                attachments: [],
              },
              modelSelection,
              titleSeed: nextThreadTitle,
              runtimeMode,
              interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
              createdAt,
            },
          });
          failure = startResult._tag === "Failure" ? startResult : null;
        }

        if (failure === null) {
          const startedResult = await settlePromise(() =>
            waitForStartedServerThread(scopeThreadRef(projectRef.environmentId, nextThreadId)),
          );
          failure = startedResult._tag === "Failure" ? startedResult : null;
        }

        if (failure === null) {
          const navigateResult = await settlePromise(() =>
            navigate({
              to: "/$environmentId/$threadId",
              params: {
                environmentId: projectRef.environmentId,
                threadId: nextThreadId,
              },
            }),
          );
          failure = navigateResult._tag === "Failure" ? navigateResult : null;
        }

        if (failure !== null) {
          const cleanupResult = await deleteThread({
            environmentId: projectRef.environmentId,
            input: { threadId: nextThreadId },
          });
          if (cleanupResult._tag === "Failure" && !isAtomCommandInterrupted(cleanupResult)) {
            console.warn(
              "Failed to clean up spawned provider thread after start failure.",
              squashAtomCommandFailure(cleanupResult),
            );
          }
          if (!isAtomCommandInterrupted(failure)) {
            const error = squashAtomCommandFailure(failure);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: `Could not start ${target.displayName} thread`,
                description:
                  error instanceof Error
                    ? error.message
                    : "An error occurred while creating the new thread.",
              }),
            );
          }
          return false;
        }

        return true;
      } finally {
        spawnProviderSessionInFlight = false;
      }
    },
    [
      activeDraftThread,
      activeThread,
      createThread,
      defaultProjectRef,
      deleteThread,
      environmentServerConfigs,
      handleNewThread,
      navigate,
      primaryServerProviders,
      startThreadTurn,
    ],
  );

  return {
    spawnProviderSession,
  };
}
