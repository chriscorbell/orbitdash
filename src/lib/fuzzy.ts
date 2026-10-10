/**
 * Scores how well a query matches a piece of text, or null for no match. Higher is better:
 * the whole text, then a prefix, then the start of a word, then anywhere, then the query's
 * letters in order with gaps. Case and accents are ignored.
 */
export function fuzzyScore(
  query: string,
  text: string,
  { scattered = true }: { scattered?: boolean } = {}
): number | null {
  const needle = normalize(query);
  const haystack = normalize(text);
  if (!needle) return 0;
  if (!haystack) return null;

  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 90 - Math.min(10, haystack.length - needle.length) / 2;

  const wordStart = haystack.search(new RegExp(`(^|[\\s\\-_./:])${escapeRegExp(needle)}`));
  if (wordStart >= 0) return 75 - Math.min(15, wordStart) / 3;

  const index = haystack.indexOf(needle);
  if (index >= 0) return 60 - Math.min(20, index) / 2;
  if (!scattered) return null;

  // Letters in order: reward runs and early starts, penalize gaps.
  let position = 0;
  let gaps = 0;
  let first = -1;
  for (const char of needle) {
    const found = haystack.indexOf(char, position);
    if (found < 0) return null;
    if (first < 0) first = found;
    if (found > position) gaps += found - position;
    position = found + 1;
  }
  return Math.max(1, 40 - gaps * 1.5 - Math.min(10, first));
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface WeightedField {
  text: string | null | undefined;
  weight: number;
  /** Allow letters-in-order matches; off for long secondary fields where they are mostly noise. */
  scattered?: boolean;
}

/** The best weighted score across several fields of one item, or null when none match. */
export function scoreFields(query: string, fields: readonly WeightedField[]): number | null {
  let best: number | null = null;
  for (const { text, weight, scattered } of fields) {
    if (!text) continue;
    const score = fuzzyScore(query, text, { scattered });
    if (score !== null && (best === null || score * weight > best)) best = score * weight;
  }
  return best;
}
