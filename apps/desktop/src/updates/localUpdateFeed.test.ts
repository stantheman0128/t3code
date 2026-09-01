import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  LOCAL_UPDATE_FEED_DIR_NAME,
  resolveLocalUpdateFeedDirectory,
  resolveLocalUpdateFeedFilePath,
  shouldBindLocalUpdateFeed,
  startLocalUpdateFeedServer,
} from "./localUpdateFeed.ts";

describe("localUpdateFeed", () => {
  it("resolves the feed directory from env, then LOCALAPPDATA", () => {
    assert.equal(
      resolveLocalUpdateFeedDirectory({
        env: { T3CODE_LOCAL_UPDATE_FEED_DIR: "/tmp/feed" },
        homedir: "/home/stan",
        pathJoin: NodePath.join,
      }),
      "/tmp/feed",
    );
    assert.equal(
      resolveLocalUpdateFeedDirectory({
        env: { LOCALAPPDATA: "C:\\Users\\stan\\AppData\\Local" },
        homedir: "C:\\Users\\stan",
        pathJoin: (...parts) => parts.join("\\"),
      }),
      `C:\\Users\\stan\\AppData\\Local\\${LOCAL_UPDATE_FEED_DIR_NAME}`,
    );
  });

  it("binds a local feed for loopback generic packs, not official GitHub", () => {
    assert.isTrue(
      shouldBindLocalUpdateFeed({
        mockUpdates: false,
        appUpdateYml: Option.none(),
        localFeedHasManifest: true,
      }),
    );
    assert.isTrue(
      shouldBindLocalUpdateFeed({
        mockUpdates: false,
        appUpdateYml: Option.some({
          provider: "generic",
          url: "http://127.0.0.1:47821",
        }),
        localFeedHasManifest: true,
      }),
    );
    assert.isFalse(
      shouldBindLocalUpdateFeed({
        mockUpdates: false,
        appUpdateYml: Option.some({
          provider: "github",
          owner: "pingdotgg",
          repo: "t3code",
        }),
        localFeedHasManifest: true,
      }),
    );
    assert.isFalse(
      shouldBindLocalUpdateFeed({
        mockUpdates: true,
        appUpdateYml: Option.none(),
        localFeedHasManifest: true,
      }),
    );
    assert.isFalse(
      shouldBindLocalUpdateFeed({
        mockUpdates: false,
        appUpdateYml: Option.none(),
        localFeedHasManifest: false,
      }),
    );
  });

  it("rejects path traversal in feed URLs", () => {
    const root = NodePath.resolve("/tmp/t3code-local-updates");
    assert.equal(
      resolveLocalUpdateFeedFilePath(root, "/latest.yml"),
      NodePath.join(root, "latest.yml"),
    );
    assert.equal(resolveLocalUpdateFeedFilePath(root, "/%2e%2e/secret.txt"), null);
    assert.equal(resolveLocalUpdateFeedFilePath(root, "/../secret.txt"), null);
  });

  it.effect("serves latest.yml from the local feed directory", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* Effect.tryPromise(() =>
          NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "t3-local-feed-")),
        );
        yield* Effect.tryPromise(() =>
          NodeFs.writeFile(NodePath.join(root, "latest.yml"), "version: 0.0.87\n"),
        );

        const url = yield* startLocalUpdateFeedServer(root);
        const body = yield* Effect.tryPromise(async () => {
          const response = await fetch(`${url}/latest.yml`);
          assert.equal(response.status, 200);
          return await response.text();
        });
        assert.equal(body, "version: 0.0.87\n");

        const missing = yield* Effect.tryPromise(async () => {
          const response = await fetch(`${url}/%2e%2e/secret.txt`);
          return response.status;
        });
        assert.equal(missing, 404);
      }),
    ),
  );
});
