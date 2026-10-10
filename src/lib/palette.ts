import { fuzzyScore, scoreFields } from "@/lib/fuzzy";
import type { Service } from "@shared/types";

export interface PaletteAction {
  id: string;
  label: string;
  /** Extra words people might type for this action. */
  keywords?: string;
  run: () => void;
}

export type PaletteItem =
  | {
      kind: "service";
      id: string;
      service: Service;
      score: number;
      /** Tags the query matched, shown so a match by tag isn't a mystery. */
      tags: string[];
    }
  | { kind: "action"; id: string; action: PaletteAction; score: number }
  | { kind: "web"; id: "web-search"; query: string };

const MAX_SERVICES = 8;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * What the palette lists for a query: matching services first (best first), then matching
 * actions, then a web search. With no query it lists every action, so it doubles as a menu.
 */
export function rankPaletteItems(
  query: string,
  services: readonly Service[],
  actions: readonly PaletteAction[]
): PaletteItem[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return actions.map((action) => ({ kind: "action", id: action.id, action, score: 0 }));
  }

  const serviceItems = services
    .map((service): PaletteItem | null => {
      const score = scoreFields(trimmed, [
        { text: service.name, weight: 1 },
        { text: service.category, weight: 0.6, scattered: false },
        ...service.tags.map((tag) => ({ text: tag, weight: 0.6, scattered: false })),
        { text: service.description, weight: 0.55, scattered: false },
        { text: hostOf(service.url), weight: 0.5, scattered: false },
        {
          text: service.external_url && hostOf(service.external_url),
          weight: 0.5,
          scattered: false,
        },
      ]);
      if (score === null) return null;
      const tags = service.tags.filter(
        (tag) => fuzzyScore(trimmed, tag, { scattered: false }) !== null
      );
      return { kind: "service", id: service.id, service, score, tags };
    })
    .filter((item): item is Extract<PaletteItem, { kind: "service" }> => item !== null)
    .sort(
      (left, right) =>
        right.score - left.score || left.service.name.localeCompare(right.service.name)
    )
    .slice(0, MAX_SERVICES);

  const actionItems = actions
    .map((action): PaletteItem | null => {
      const score = scoreFields(trimmed, [
        { text: action.label, weight: 0.9 },
        { text: action.keywords, weight: 0.6, scattered: false },
      ]);
      return score === null ? null : { kind: "action", id: action.id, action, score };
    })
    .filter((item): item is Extract<PaletteItem, { kind: "action" }> => item !== null)
    .sort((left, right) => right.score - left.score);

  return [...serviceItems, ...actionItems, { kind: "web", id: "web-search", query: trimmed }];
}

export { hostOf };
