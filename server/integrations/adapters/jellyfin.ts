import type { IntegrationStat } from "@shared/types";
import { formatCount, isRecord, num } from "../format";
import { IGNORE_TLS_FIELD, URL_FIELD, type IntegrationAdapter } from "../types";

/** Jellyfin (and Emby): people watching now, and library sizes. */
export const jellyfin: IntegrationAdapter = {
  id: "jellyfin",
  name: "Jellyfin",
  icon: "jellyfin",
  pollIntervalMs: 30_000,
  fields: [
    URL_FIELD,
    {
      key: "apiKey",
      label: "API key",
      kind: "secret",
      required: true,
      help: "Dashboard, API Keys, then +.",
    },
    IGNORE_TLS_FIELD,
  ],
  async read(config, { http }) {
    const headers = { Authorization: `MediaBrowser Token="${String(config.values.apiKey ?? "")}"` };
    const [sessions, counts] = await Promise.all([
      http.json("Sessions?activeWithinSeconds=600", { headers }),
      http.json("Items/Counts", { headers }),
    ]);
    const playing = Array.isArray(sessions)
      ? sessions.filter((session) => isRecord(session) && isRecord(session.NowPlayingItem)).length
      : 0;
    const count = (key: string) => (isRecord(counts) ? num(counts[key]) : null);
    const stats: IntegrationStat[] = [
      { label: "Playing", value: String(playing), tone: playing > 0 ? "good" : undefined },
    ];
    for (const [key, label] of [
      ["MovieCount", "Movies"],
      ["SeriesCount", "Series"],
      ["SongCount", "Songs"],
    ] as const) {
      const value = count(key);
      if (value) stats.push({ label, value: formatCount(value) });
    }
    return stats.slice(0, 4);
  },
};
