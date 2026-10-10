import { Hono } from "hono";
import { loginRequestSchema } from "@shared/auth-schemas";
import { jsonError } from "../api-response";
import {
  clearSessionCookie,
  getClientIp,
  identifyRequest,
  readSessionToken,
  renewSessionCookie,
  setSessionCookie,
} from "../auth/http";
import {
  attemptLogin,
  describeSession,
  endSession,
  getAuthConfig,
  PASSWORD_USER,
} from "../auth/service";
import { writeLog } from "../observability";
import { readValidatedJson } from "../request-body";

const authRouter = new Hono();

authRouter.use("*", (c, next) => {
  c.header("Cache-Control", "no-store");
  return next();
});

/** GET /api/auth/session: the auth mode and what this browser may do. Always public. */
authRouter.get("/session", (c) => {
  const identity = identifyRequest(c);
  if (identity.session) {
    renewSessionCookie(c, identity);
  } else if (getAuthConfig().mode === "password" && readSessionToken(c)) {
    // The cookie names a session that has ended; drop it.
    clearSessionCookie(c);
  }
  return c.json(describeSession(identity));
});

/** POST /api/auth/login { password }: starts a session in password mode. */
authRouter.post("/login", async (c) => {
  if (getAuthConfig().mode !== "password") {
    return jsonError(c, 404, "password sign-in is not enabled");
  }

  const body = await readValidatedJson(c, loginRequestSchema);
  if (body.response) return body.response;

  const ip = getClientIp(c);
  const now = Date.now();
  const result = await attemptLogin(body.data.password, ip ?? "unknown", now);

  if (!result.ok && result.reason === "rate-limited") {
    const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    writeLog("warn", "auth.login_rate_limited", { ip, retryAfter });
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "too many sign-in attempts", retryAfter }, 429);
  }

  if (!result.ok) {
    writeLog("warn", "auth.login_failed", { ip });
    return jsonError(c, 401, "incorrect password");
  }

  // A new sign-in replaces the session this browser already had.
  endSession(readSessionToken(c));
  setSessionCookie(c, result.token, result.expiresAt, now);
  writeLog("info", "auth.login", { ip });
  return c.json(
    describeSession({
      access: "edit",
      session: { expiresAt: result.expiresAt, refreshed: false, token: result.token },
      user: PASSWORD_USER,
    })
  );
});

/** POST /api/auth/logout: ends this browser's session and says what access remains. */
authRouter.post("/logout", (c) => {
  const token = readSessionToken(c);
  if (token) {
    endSession(token);
    clearSessionCookie(c);
  }
  return c.json(describeSession(identifyRequest(c, { withSession: false })));
});

export default authRouter;
