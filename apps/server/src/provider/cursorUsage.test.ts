import { describe, expect, it } from "vite-plus/test";

import { cursorAccessTokenFromDocument, cursorAuthFileCandidates } from "./cursorUsage.ts";

describe("cursorAccessTokenFromDocument", () => {
  it("reads accessToken from the Cursor app auth file", () => {
    expect(cursorAccessTokenFromDocument({ accessToken: "session-token" })).toBe("session-token");
    expect(cursorAccessTokenFromDocument({ access_token: "session-token" })).toBe("session-token");
    expect(cursorAccessTokenFromDocument({ refreshToken: "only-refresh" })).toBeUndefined();
  });
});

describe("cursorAuthFileCandidates", () => {
  it("includes the Windows Cursor app auth.json when APPDATA is set", () => {
    const files = cursorAuthFileCandidates("C:\\Users\\ada", {
      APPDATA: "C:\\Users\\ada\\AppData\\Roaming",
    });
    expect(
      files.some((file) => file.endsWith("Cursor\\auth.json") || file.endsWith("Cursor/auth.json")),
    ).toBe(true);
    expect(files.some((file) => file.includes(".cursor"))).toBe(true);
  });
});
