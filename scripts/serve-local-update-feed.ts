#!/usr/bin/env node

import * as Http from "node:http";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { handleLocalUpdateFeedRequest } from "../apps/desktop/src/updates/localUpdateFeed.ts";
import {
  LOCAL_UPDATE_FEED_HOST,
  LOCAL_UPDATE_FEED_PORT,
  resolveLocalUpdateFeedDirectory,
} from "./lib/local-update-feed.ts";

async function main(): Promise<void> {
  const feedDir = resolveLocalUpdateFeedDirectory({
    env: process.env,
    homedir: NodeOs.homedir(),
    pathJoin: NodePath.join,
  });
  const preferredPort = Number.parseInt(process.env.T3CODE_LOCAL_UPDATE_FEED_PORT ?? "", 10);
  const port =
    Number.isInteger(preferredPort) && preferredPort > 0 ? preferredPort : LOCAL_UPDATE_FEED_PORT;

  const server = Http.createServer((request, response) => {
    void handleLocalUpdateFeedRequest(feedDir, request, response);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (cause: Error) => {
      server.off("listening", onListening);
      reject(cause);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, LOCAL_UPDATE_FEED_HOST);
  }).catch((cause: unknown) => {
    const code =
      typeof cause === "object" && cause !== null && "code" in cause
        ? String(cause.code)
        : undefined;
    if (code === "EADDRINUSE") {
      throw new Error(
        `Local update feed port ${port} is already in use. Stop the other listener, or set T3CODE_LOCAL_UPDATE_FEED_PORT.`,
      );
    }
    throw cause;
  });

  const address = server.address();
  const boundPort = address && typeof address !== "string" ? address.port : port;
  process.stdout.write(`Serving ${feedDir} at http://${LOCAL_UPDATE_FEED_HOST}:${boundPort}\n`);
}

void main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
