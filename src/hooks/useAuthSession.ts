import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchAuthSession } from "@/lib/api/auth";
import { setAuthChallengeHandler } from "@/lib/api/client";
import { authSessionSchema } from "@/lib/api/schemas";
import { eventStream } from "@/lib/live/event-stream";
import { queryKeys } from "@/lib/query-client";
import type { AuthSession } from "@shared/auth";

const CACHE_KEY = "orbitdash.authCache";
// Long enough to cost nothing, short enough to keep a 30-day sliding session alive.
const SESSION_KEEP_ALIVE_MS = 6 * 60 * 60 * 1000;

function readCachedSession(): AuthSession | undefined {
  try {
    const parsed = authSessionSchema.safeParse(JSON.parse(localStorage.getItem(CACHE_KEY) ?? ""));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedSession(session: AuthSession) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage access issues.
  }
}

/** After signing in or out: the new auth state, and everything else fetched again as that user. */
export function applyAuthSession(queryClient: QueryClient, session: AuthSession) {
  queryClient.setQueryData(queryKeys.auth, session);
  void queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.auth[0] });
}

/**
 * The auth state from `GET /api/auth/session`. The last known state (kept in this browser)
 * renders at once and offline, and is checked again right away. A 401 or 403 from any request,
 * or a dropped event stream, updates it, so an ended session leads back to sign-in.
 */
export function useAuthSession() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.auth,
    queryFn: fetchAuthSession,
    initialData: readCachedSession,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // A page left open for weeks (a wall display) still renews its session cookie.
    refetchInterval: ({ state }) =>
      state.data?.mode === "password" && state.data.authenticated ? SESSION_KEEP_ALIVE_MS : false,
  });

  const session = query.data;
  useEffect(() => {
    if (session) writeCachedSession(session);
  }, [session]);

  useEffect(() => {
    setAuthChallengeHandler((auth) => {
      const parsed = authSessionSchema.safeParse(auth);
      if (parsed.success) queryClient.setQueryData(queryKeys.auth, parsed.data);
    });
    const stopListening = eventStream.onConnection((event) => {
      if (event !== "error") return;
      queryClient
        .fetchQuery({ queryKey: queryKeys.auth, queryFn: fetchAuthSession, staleTime: 10_000 })
        .catch(() => {});
    });
    return () => {
      setAuthChallengeHandler(null);
      stopListening();
    };
  }, [queryClient]);

  return query;
}
