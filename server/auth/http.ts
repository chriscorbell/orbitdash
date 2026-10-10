import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { resolveClientIp } from "./ip";
import {
  describeSession,
  getAuthConfig,
  isSessionActive,
  resolveIdentity,
  type RequestIdentity,
} from "./service";

export const SESSION_COOKIE = "orbitdash_session";

/** API paths anyone can reach: health, and the routes that sign in and out. */
const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/auth/session",
  "/api/auth/login",
  "/api/auth/logout",
]);
const GUEST_METHODS = new Set(["GET", "HEAD"]);

interface RequestIpProvider {
  requestIP?: (request: Request) => { address: string } | null;
}

/**
 * The socket peer's address, from the Bun server that `server/index.ts` passes to `app.fetch` as
 * env. Headers like X-Forwarded-For never decide who the peer is.
 */
export function getPeerIp(c: Context): string | null {
  const server = c.env as RequestIpProvider | undefined;
  if (typeof server?.requestIP !== "function") return null;
  try {
    return server.requestIP(c.req.raw)?.address ?? null;
  } catch {
    return null;
  }
}

/** The client's address, looking through X-Forwarded-For only when a trusted proxy sent it. */
export function getClientIp(c: Context): string | null {
  return resolveClientIp(
    getPeerIp(c),
    c.req.header("x-forwarded-for"),
    getAuthConfig().trustedProxies
  );
}

/** HTTPS directly, or X-Forwarded-Proto: https from a trusted proxy. */
export function isSecureRequest(c: Context): boolean {
  if (new URL(c.req.url).protocol === "https:") return true;
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  return forwardedProto === "https" && getAuthConfig().trustedProxies.matches(getPeerIp(c));
}

export function setSessionCookie(c: Context, token: string, expiresAt: number, now: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: Math.max(0, Math.floor((expiresAt - now) / 1000)),
    path: "/",
    sameSite: "Lax",
    secure: isSecureRequest(c),
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: isSecureRequest(c),
  });
}

export function readSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

const identities = new WeakMap<Request, RequestIdentity>();

/** Resolves (once per request) who the request acts as. */
export function identifyRequest(c: Context, { withSession = true } = {}): RequestIdentity {
  const cached = withSession ? identities.get(c.req.raw) : undefined;
  if (cached) return cached;

  const identity = resolveIdentity({
    now: Date.now(),
    peerIp: getPeerIp(c),
    proxyUser: c.req.header(getAuthConfig().proxyHeader),
    sessionToken: withSession ? readSessionToken(c) : undefined,
  });
  if (withSession) identities.set(c.req.raw, identity);
  return identity;
}

/** Sends the cookie again when this request slid the session's expiry. */
export function renewSessionCookie(c: Context, identity: RequestIdentity) {
  if (identity.session?.refreshed) {
    setSessionCookie(c, identity.session.token, identity.session.expiresAt, Date.now());
  }
}

/**
 * For long-lived responses (the event stream): a check that turns false once the request's
 * session is signed out or expires, or null when the request has no session to lose.
 */
export function getSessionRecheck(c: Context): (() => boolean) | null {
  const token = identities.get(c.req.raw)?.session?.token;
  return token ? () => isSessionActive(token, Date.now()) : null;
}

type GuestRule = "allowed" | "changes" | "backups";

function guestRule(method: string, path: string): GuestRule {
  // Backups hold everything, so even reading them needs a full sign-in.
  if (path === "/api/backup" || path.startsWith("/api/backup/")) return "backups";
  return GUEST_METHODS.has(method) ? "allowed" : "changes";
}

const GUEST_ERRORS: Record<Exclude<GuestRule, "allowed">, string> = {
  backups: "sign in to use backups",
  changes: "sign in to make changes",
};

/**
 * Guards every /api route except health and auth. Without access the reply is 401 (or 403 for a
 * guest asking for more than reading), with the auth state so the browser knows what to show.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (getAuthConfig().mode === "none" || PUBLIC_API_PATHS.has(c.req.path)) {
    return next();
  }

  const identity = identifyRequest(c);
  if (identity.access === "edit") {
    await next();
    renewSessionCookie(c, identity);
    return;
  }

  const rule = guestRule(c.req.method, c.req.path);
  if (identity.access === "view" && rule === "allowed") {
    return next();
  }

  c.header("Cache-Control", "no-store");
  const auth = describeSession(identity);
  if (identity.access === "view") {
    return c.json({ error: GUEST_ERRORS[rule as Exclude<GuestRule, "allowed">], auth }, 403);
  }
  return c.json({ error: "sign in required", auth }, 401);
};
