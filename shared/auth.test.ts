import { describe, expect, it } from "vitest";
import { accessForSession, MAX_PASSWORD_LENGTH, OPEN_AUTH_SESSION, type AuthSession } from "./auth";
import { authSessionSchema, loginRequestSchema } from "./auth-schemas";

const session = (overrides: Partial<AuthSession>): AuthSession => ({
  ...OPEN_AUTH_SESSION,
  ...overrides,
});

describe("accessForSession", () => {
  it("edits whenever the session can", () => {
    expect(accessForSession(OPEN_AUTH_SESSION)).toBe("edit");
    expect(
      accessForSession(session({ mode: "password", authenticated: true, user: "admin" }))
    ).toBe("edit");
  });

  it("shows the read-only dashboard to guests, and sign-in to everyone else", () => {
    expect(accessForSession(session({ mode: "password", canEdit: false, guest: "view" }))).toBe(
      "view"
    );
    expect(accessForSession(session({ mode: "proxy", canEdit: false }))).toBe("sign-in");
  });
});

describe("auth schemas", () => {
  it("parse a session reply", () => {
    expect(authSessionSchema.parse(OPEN_AUTH_SESSION)).toEqual(OPEN_AUTH_SESSION);
    expect(authSessionSchema.safeParse({ ...OPEN_AUTH_SESSION, mode: "basic" }).success).toBe(
      false
    );
    expect(authSessionSchema.safeParse({ ...OPEN_AUTH_SESSION, user: undefined }).success).toBe(
      false
    );
  });

  it("accept any password string up to the limit, including an empty one", () => {
    expect(loginRequestSchema.parse({ password: "" })).toEqual({ password: "" });
    expect(
      loginRequestSchema.parse({ password: "x".repeat(MAX_PASSWORD_LENGTH) }).password
    ).toHaveLength(MAX_PASSWORD_LENGTH);
  });

  it("reject missing, non-string and oversized passwords", () => {
    expect(loginRequestSchema.safeParse({}).error?.issues[0].message).toBe(
      "password must be a string"
    );
    expect(loginRequestSchema.safeParse({ password: 1 }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({ password: "x".repeat(MAX_PASSWORD_LENGTH + 1) }).error
        ?.issues[0].message
    ).toBe("password must be at most 1024 characters");
  });
});
