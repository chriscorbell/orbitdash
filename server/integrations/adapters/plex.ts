import type { IntegrationStat } from "@shared/types";
import { formatCount, isRecord, num } from "../format";
import { IGNORE_TLS_FIELD, URL_FIELD, type IntegrationAdapter } from "../types";

const container = (value: unknown) =>
  isRecord(value) && isRecord(value.MediaContainer) ? value.MediaContainer : {};

/** Plex: people watching now, and how big the movie and show libraries are. */
export const plex: IntegrationAdapter = {
  id: "plex",
  name: "Plex",
  icon: "plex",
  pollIntervalMs: 30_000,
  fields: [
    URL_FIELD,
    {
      key: "token",
      label: "Plex token",
      kind: "secret",
      required: true,
      help: "The X-Plex-Token value from any item's XML view.",
    },
    IGNORE_TLS_FIELD,
  ],
  async read(config, { http }) {
    const headers = { "X-Plex-Token": String(config.values.token ?? "") };
    const [sessions, sections] = await Promise.all([
      http.json("status/sessions", { headers }),
      http.json("library/sections", { headers }),
    ]);
    const playing = num(container(sessions).size) ?? 0;
    const directories = container(sections).Directory;
    const libraries = Array.isArray(directories) ? directories.filter(isRecord) : [];

    // Item counts per library type, from each section's size without listing its items.
    const totals = new Map<string, number>();
    await Promise.all(
      libraries
        .filter((library) => library.type === "movie" || library.type === "show")
        .map(async (library) => {
          const answer = await http.json(
            `library/sections/${encodeURIComponent(String(library.key))}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0`,
            { headers }
          );
          const size = num(container(answer).totalSize) ?? num(container(answer).size) ?? 0;
          const type = String(library.type);
          totals.set(type, (totals.get(type) ?? 0) + size);
        })
    );

    const stats: IntegrationStat[] = [
      { label: "Playing", value: String(playing), tone: playing > 0 ? "good" : undefined },
    ];
    if (totals.get("movie"))
      stats.push({ label: "Movies", value: formatCount(totals.get("movie")!) });
    if (totals.get("show")) stats.push({ label: "Shows", value: formatCount(totals.get("show")!) });
    stats.push({ label: "Libraries", value: String(libraries.length) });
    return stats.slice(0, 4);
  },
};
