import { formatCount, formatPercent, isRecord, num } from "../format";
import { IGNORE_TLS_FIELD, URL_FIELD, type IntegrationAdapter } from "../types";

/** AdGuard Home: queries and blocks, and how long lookups take. */
export const adguard: IntegrationAdapter = {
  id: "adguard",
  name: "AdGuard Home",
  icon: "adguard-home",
  pollIntervalMs: 60_000,
  fields: [
    URL_FIELD,
    { key: "username", label: "Username", kind: "text", required: true },
    { key: "password", label: "Password", kind: "secret", required: true },
    IGNORE_TLS_FIELD,
  ],
  async read(config, { http }) {
    const credentials = Buffer.from(
      `${String(config.values.username ?? "")}:${String(config.values.password ?? "")}`
    ).toString("base64");
    const stats = await http.json("control/stats", {
      headers: { Authorization: `Basic ${credentials}` },
    });
    const record = isRecord(stats) ? stats : {};
    const queries = num(record.num_dns_queries) ?? 0;
    const blocked =
      (num(record.num_blocked_filtering) ?? 0) +
      (num(record.num_replaced_safebrowsing) ?? 0) +
      (num(record.num_replaced_parental) ?? 0);
    const seconds = num(record.avg_processing_time) ?? 0;
    return [
      { label: "Queries", value: formatCount(queries) },
      { label: "Blocked", value: formatCount(blocked) },
      { label: "Blocked share", value: formatPercent(queries ? (blocked / queries) * 100 : 0) },
      { label: "Lookup", value: `${Math.round(seconds * 1000)} ms` },
    ];
  },
};
