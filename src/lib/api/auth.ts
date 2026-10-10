import { jsonBody, requestJson } from "@/lib/api/client";
import { authSessionSchema } from "@/lib/api/schemas";
import type { AuthSession } from "@shared/auth";

export function fetchAuthSession(): Promise<AuthSession> {
  return requestJson("/api/auth/session", {}, "Couldn't check the session", authSessionSchema);
}

/** Throws an ApiError: 401 for a wrong password, 429 (with retryAfterSeconds) when rate limited. */
export function signIn(password: string): Promise<AuthSession> {
  return requestJson(
    "/api/auth/login",
    jsonBody("POST", { password }),
    "Couldn't sign in",
    authSessionSchema
  );
}

export function signOut(): Promise<AuthSession> {
  return requestJson(
    "/api/auth/logout",
    { method: "POST" },
    "Couldn't sign out",
    authSessionSchema
  );
}
