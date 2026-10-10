/**
 * Optional authentication, configured only through environment variables on the server:
 * `none` (open, the default), `password` (one shared password and a session cookie), or `proxy`
 * (a trusted reverse proxy names the user in a header).
 */
export const AUTH_MODES = ["none", "password", "proxy"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** `view` lets anyone without a session read the dashboard; changes still need a sign-in. */
export const GUEST_ACCESS = ["none", "view"] as const;
export type GuestAccess = (typeof GUEST_ACCESS)[number];

/** Longest password the server will check, so a huge body can't keep argon2 busy. */
export const MAX_PASSWORD_LENGTH = 1024;

/** What `GET /api/auth/session` returns, and what 401 and 403 replies carry as `auth`. */
export interface AuthSession {
  /** False in mode `none`: nobody signs in, everyone can edit. */
  authenticated: boolean;
  canEdit: boolean;
  guest: GuestAccess;
  mode: AuthMode;
  /** The signed-in user: `admin` in password mode, the proxy's user name in proxy mode. */
  user: string | null;
}

/** Full access for everyone, as with auth turned off. */
export const OPEN_AUTH_SESSION: AuthSession = {
  authenticated: false,
  canEdit: true,
  guest: "none",
  mode: "none",
  user: null,
};

/** What the browser shows: the editable dashboard, the read-only one, or the sign-in screen. */
export type AuthAccess = "edit" | "view" | "sign-in";

export function accessForSession(session: AuthSession): AuthAccess {
  if (session.canEdit) return "edit";
  return session.guest === "view" ? "view" : "sign-in";
}
