import type { IntegrationStat } from "@shared/types";
import { formatCount, isRecord, num } from "../format";
import { IGNORE_TLS_FIELD, URL_FIELD, type IntegrationAdapter } from "../types";

function totalRecords(answer: unknown): number {
  return isRecord(answer)
    ? (num(answer.totalRecords) ?? 0)
    : Array.isArray(answer)
      ? answer.length
      : 0;
}

function arrAdapter(id: "sonarr" | "radarr", name: string): IntegrationAdapter {
  return {
    id,
    name,
    icon: id,
    pollIntervalMs: 60_000,
    fields: [
      URL_FIELD,
      {
        key: "apiKey",
        label: "API key",
        kind: "secret",
        required: true,
        help: "Settings, General.",
      },
      IGNORE_TLS_FIELD,
    ],
    async read(config, { http }) {
      const headers = { "X-Api-Key": String(config.values.apiKey ?? "") };
      const start = new Date();
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60_000);
      const [queue, missing, calendar] = await Promise.all([
        http.json("api/v3/queue?pageSize=1", { headers }),
        http.json("api/v3/wanted/missing?pageSize=1", { headers }),
        http.json(`api/v3/calendar?start=${start.toISOString()}&end=${end.toISOString()}`, {
          headers,
        }),
      ]);
      const queued = totalRecords(queue);
      const wanted = totalRecords(missing);
      const stats: IntegrationStat[] = [
        { label: "Queue", value: formatCount(queued), tone: queued > 0 ? "good" : undefined },
        { label: "Missing", value: formatCount(wanted), tone: wanted > 0 ? "warning" : undefined },
        { label: "This week", value: formatCount(totalRecords(calendar)) },
      ];
      return stats;
    },
  };
}

/** Sonarr: downloads in the queue, missing episodes, and episodes airing this week. */
export const sonarr = arrAdapter("sonarr", "Sonarr");
/** Radarr: downloads in the queue, missing movies, and releases this week. */
export const radarr = arrAdapter("radarr", "Radarr");
