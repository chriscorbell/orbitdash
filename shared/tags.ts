/**
 * Tag rules shared by the service form and the server. Tags are free-form, but compare and display
 * in one form: trimmed, single-spaced and lowercase, so "Media" and "media " are the same tag.
 */

export const MAX_SERVICE_TAGS = 10;
export const TAG_MAX_LENGTH = 32;

export type TagsResult = { ok: true; value: string[] } | { ok: false; error: string };

export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Normalizes a list of tags. Commas separate tags (the form's chip input splits on them too), and
 * blanks and repeats are dropped; more than MAX_SERVICE_TAGS, or one longer than TAG_MAX_LENGTH,
 * is an error rather than being cut short.
 */
export function normalizeTags(values: readonly string[]): TagsResult {
  const tags = [
    ...new Set(
      values
        .flatMap((value) => value.split(","))
        .map(normalizeTag)
        .filter(Boolean)
    ),
  ];
  if (tags.some((tag) => tag.length > TAG_MAX_LENGTH)) {
    return { ok: false, error: `tags must be ${TAG_MAX_LENGTH} characters or fewer` };
  }
  if (tags.length > MAX_SERVICE_TAGS) {
    return { ok: false, error: `a service can have up to ${MAX_SERVICE_TAGS} tags` };
  }
  return { ok: true, value: tags };
}
