import * as Http from "node:http";
import * as NodeFs from "node:fs/promises";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

export const LOCAL_UPDATE_FEED_DIR_NAME = "t3code-local-updates";
export const LOCAL_UPDATE_FEED_HOST = "127.0.0.1";
export const LOCAL_UPDATE_FEED_PORT = 47821;
export const LOCAL_UPDATE_FEED_URL = `http://${LOCAL_UPDATE_FEED_HOST}:${LOCAL_UPDATE_FEED_PORT}`;
export const LOCAL_UPDATE_FEED_MANIFEST_NAME = "latest.yml";

export class LocalUpdateFeedListenError extends Schema.TaggedErrorClass<LocalUpdateFeedListenError>()(
  "LocalUpdateFeedListenError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to start the local desktop update feed server.";
  }
}

export function resolveLocalUpdateFeedDirectory(input: {
  readonly env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
  readonly homedir: string;
  readonly pathJoin: (...parts: string[]) => string;
}): string {
  const override = input.env.T3CODE_LOCAL_UPDATE_FEED_DIR?.trim();
  if (override) {
    return override;
  }

  const localAppData = input.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return input.pathJoin(localAppData, LOCAL_UPDATE_FEED_DIR_NAME);
  }

  return input.pathJoin(input.homedir, `.${LOCAL_UPDATE_FEED_DIR_NAME}`);
}

export function isLoopbackGenericFeedUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return url.includes("127.0.0.1") || url.includes("localhost");
}

export function shouldBindLocalUpdateFeed(input: {
  readonly mockUpdates: boolean;
  readonly appUpdateYml: Option.Option<Readonly<Record<string, string>>>;
  readonly localFeedHasManifest: boolean;
}): boolean {
  if (input.mockUpdates || !input.localFeedHasManifest) {
    return false;
  }
  if (Option.isNone(input.appUpdateYml)) {
    return true;
  }

  const config = input.appUpdateYml.value;
  if (config.provider === "github") {
    return false;
  }
  return config.provider === "generic" && isLoopbackGenericFeedUrl(config.url);
}

export function resolveLocalUpdateFeedFilePath(
  rootDir: string,
  requestUrl: string | undefined,
): string | null {
  const rawPath = (requestUrl ?? "/").split("?", 1)[0] ?? "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }

  const relative = decoded.replace(/^\/+/, "");
  if (relative.length === 0) {
    return null;
  }

  const rootResolved = NodePath.resolve(rootDir);
  const resolved = NodePath.resolve(rootResolved, relative);
  const traversal = NodePath.relative(rootResolved, resolved);
  if (traversal.startsWith("..") || NodePath.isAbsolute(traversal)) {
    return null;
  }
  return resolved;
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
    return "text/yaml; charset=utf-8";
  }
  return "application/octet-stream";
}

export async function handleLocalUpdateFeedRequest(
  rootDir: string,
  request: Http.IncomingMessage,
  response: Http.ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const filePath = resolveLocalUpdateFeedFilePath(rootDir, request.url);
  if (!filePath) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }

  try {
    const stat = await NodeFs.stat(filePath);
    if (!stat.isFile()) {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Content-Length": stat.size,
      "Cache-Control": "no-store",
    });
    if (method === "HEAD") {
      response.end();
      return;
    }

    const body = await NodeFs.readFile(filePath);
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not Found");
  }
}

export const startLocalUpdateFeedServer = (
  rootDir: string,
): Effect.Effect<string, LocalUpdateFeedListenError, Scope.Scope> =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          new Promise<Http.Server>((resolve, reject) => {
            const next = Http.createServer((request, response) => {
              void handleLocalUpdateFeedRequest(rootDir, request, response);
            });
            next.once("error", reject);
            next.listen(0, LOCAL_UPDATE_FEED_HOST, () => resolve(next));
          }),
        catch: (cause) => new LocalUpdateFeedListenError({ cause }),
      }),
      (next) =>
        Effect.tryPromise({
          try: () =>
            new Promise<void>((resolve) => {
              next.close(() => resolve());
            }),
          catch: () => undefined,
        }).pipe(
          Effect.asVoid,
          Effect.orElseSucceed(() => undefined),
        ),
    );

    const address = server.address();
    if (!address || typeof address === "string") {
      return yield* new LocalUpdateFeedListenError({
        cause: new Error("Local update feed server bound without a TCP address."),
      });
    }

    return `http://${LOCAL_UPDATE_FEED_HOST}:${address.port}`;
  });
