import { describe, expect, it } from "vite-plus/test";

import { grokBearerToken, grokPlanLabelFromUnknown, parseGrokAuthFile } from "./grokAuth.ts";

describe("parseGrokAuthFile", () => {
  it("does not treat a personal grok.com user as Grok Team just because team_id exists", () => {
    expect(
      parseGrokAuthFile({
        "https://auth.x.ai::example": {
          email: "ada@example.com",
          team_id: "team-1",
          principal_type: "User",
          auth_mode: "oidc",
          refresh_token: "do-not-copy",
        },
      }),
    ).toEqual({
      status: "authenticated",
      type: "session",
      label: "grok.com",
      email: "ada@example.com",
    });
  });

  it("labels a non-user principal as Grok Team", () => {
    expect(
      parseGrokAuthFile({
        rec: {
          email: "ada@example.com",
          team_id: "team-1",
          principal_type: "Team",
          auth_mode: "oidc",
        },
      }),
    ).toEqual({
      status: "authenticated",
      type: "session",
      label: "Grok Team",
      email: "ada@example.com",
    });
  });

  it("labels a personal grok.com session when there is no team", () => {
    expect(
      parseGrokAuthFile({
        rec: { email: "ada@example.com", auth_mode: "oidc" },
      }),
    ).toEqual({
      status: "authenticated",
      type: "session",
      label: "grok.com",
      email: "ada@example.com",
    });
  });

  it("ignores records without an email", () => {
    expect(parseGrokAuthFile({ rec: { refresh_token: "x" } })).toBeNull();
    expect(parseGrokAuthFile(null)).toBeNull();
  });

  it("prefers a SuperGrok plan when the auth record includes a tier", () => {
    expect(
      parseGrokAuthFile({
        rec: {
          email: "ada@example.com",
          auth_mode: "oidc",
          subscription_tier_display: "SuperGrok Heavy",
        },
      }),
    ).toMatchObject({ label: "SuperGrok Heavy" });
  });
});

describe("grokPlanLabelFromUnknown", () => {
  it("maps SuperGrok tiers", () => {
    expect(grokPlanLabelFromUnknown("super_grok")).toBe("SuperGrok");
    expect(grokPlanLabelFromUnknown("SuperGrok Plus")).toBe("SuperGrok Plus");
    expect(grokPlanLabelFromUnknown("heavy")).toBe("SuperGrok Heavy");
  });
});

describe("grokBearerToken", () => {
  it("reads the OIDC access key from an auth record", () => {
    expect(
      grokBearerToken({
        rec: { email: "ada@example.com", key: "session-token" },
      }),
    ).toBe("session-token");
    expect(grokBearerToken({ rec: { email: "ada@example.com" } })).toBeUndefined();
  });
});
