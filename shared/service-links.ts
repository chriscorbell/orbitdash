import type { ServiceLink } from "./types";
import { normalizeServiceUrl } from "./urls";

/** Secondary link rules shared by the service form and the server. */

export const MAX_SERVICE_LINKS = 5;
export const LINK_LABEL_MAX_LENGTH = 40;

export type ServiceLinksResult = { ok: true; value: ServiceLink[] } | { ok: false; error: string };

/**
 * Trims labels and normalizes URLs the way the main link is normalized. Rows left completely blank
 * (an "Add link" that was never filled in) are dropped; a row with only one half is an error.
 */
export function normalizeServiceLinks(links: readonly ServiceLink[]): ServiceLinksResult {
  const value: ServiceLink[] = [];
  for (const link of links) {
    const label = link.label.trim();
    const rawUrl = link.url.trim();
    if (!label && !rawUrl) continue;
    if (!label) {
      return { ok: false, error: "each link needs a label" };
    }
    if (label.length > LINK_LABEL_MAX_LENGTH) {
      return {
        ok: false,
        error: `link labels must be ${LINK_LABEL_MAX_LENGTH} characters or fewer`,
      };
    }
    const url = normalizeServiceUrl(rawUrl);
    if (!url) {
      return { ok: false, error: `${label}: link url must be a valid URL` };
    }
    value.push({ label, url });
  }

  if (value.length > MAX_SERVICE_LINKS) {
    return { ok: false, error: `a service can have up to ${MAX_SERVICE_LINKS} links` };
  }
  return { ok: true, value };
}
