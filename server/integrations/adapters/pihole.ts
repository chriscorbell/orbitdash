import type { IntegrationStat } from "@shared/types";
import { formatCount, formatPercent, isRecord, num } from "../format";
import {
  IGNORE_TLS_FIELD,
  IntegrationError,
  URL_FIELD,
  type AdapterHttp,
  type IntegrationAdapter,
} from "../types";

function stats(
  total: number,
  blocked: number,
  percent: number,
  clients: number | null
): IntegrationStat[] {
  const result: IntegrationStat[] = [
    { label: "Queries", value: formatCount(total) },
    { label: "Blocked", value: formatCount(blocked) },
    { label: "Blocked share", value: formatPercent(percent) },
  ];
  if (clients !== null) result.push({ label: "Clients", value: formatCount(clients) });
  return result;
}

/** Pi-hole 6: sign in with the password (or an app password) for a session, then read the summary. */
async function readV6(http: AdapterHttp, password: string): Promise<IntegrationStat[]> {
  const auth = await http.json("api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const session = isRecord(auth) && isRecord(auth.session) ? auth.session : {};
  if (session.valid === false) throw new IntegrationError("It refused the credentials");
  const sid = typeof session.sid === "string" ? session.sid : null;
  const summary = await http.json("api/stats/summary", {
    headers: sid ? { "X-FTL-SID": sid } : {},
  });
  // Free the session slot right away; Pi-hole only allows a few at a time.
  if (sid)
    await http.raw("api/auth", { method: "DELETE", headers: { "X-FTL-SID": sid } }).catch(() => {});
  const queries = isRecord(summary) && isRecord(summary.queries) ? summary.queries : {};
  const clients = isRecord(summary) && isRecord(summary.clients) ? summary.clients : {};
  return stats(
    num(queries.total) ?? 0,
    num(queries.blocked) ?? 0,
    num(queries.percent_blocked) ?? 0,
    num(clients.active)
  );
}

/** Pi-hole 5: the old PHP API with an API token. */
async function readV5(http: AdapterHttp, token: string): Promise<IntegrationStat[]> {
  const summary = await http.json(`admin/api.php?summaryRaw&auth=${encodeURIComponent(token)}`);
  if (!isRecord(summary) || num(summary.dns_queries_today) === null) {
    throw new IntegrationError("It refused the credentials");
  }
  return stats(
    num(summary.dns_queries_today) ?? 0,
    num(summary.ads_blocked_today) ?? 0,
    num(summary.ads_percentage_today) ?? 0,
    num(summary.unique_clients)
  );
}

/** Pi-hole: queries and blocks today, and active clients. Works with v6 and v5. */
export const pihole: IntegrationAdapter = {
  id: "pihole",
  name: "Pi-hole",
  icon: "pi-hole",
  pollIntervalMs: 60_000,
  fields: [
    URL_FIELD,
    {
      key: "password",
      label: "Password or API token",
      kind: "secret",
      required: true,
      help: "Pi-hole 6: the web password or an app password. Pi-hole 5: the API token.",
    },
    IGNORE_TLS_FIELD,
  ],
  async read(config, { http }) {
    const secret = String(config.values.password ?? "");
    try {
      return await readV6(http, secret);
    } catch (error) {
      if (error instanceof IntegrationError && /HTTP 404|wasn't JSON/.test(error.message)) {
        return readV5(http, secret);
      }
      throw error;
    }
  },
};
