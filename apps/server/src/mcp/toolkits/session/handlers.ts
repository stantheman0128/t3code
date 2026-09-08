import * as Effect from "effect/Effect";

import * as SpawnSessionBroker from "../../SpawnSessionBroker.ts";
import { SessionToolkit } from "./tools.ts";

export const SessionToolkitHandlersLive = SessionToolkit.toLayer({
  session_list_providers: () =>
    Effect.gen(function* () {
      const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
      return yield* broker.list();
    }),
  session_spawn: (input) =>
    Effect.gen(function* () {
      const broker = yield* SpawnSessionBroker.SpawnSessionBroker;
      return yield* broker.spawn(input);
    }),
});
