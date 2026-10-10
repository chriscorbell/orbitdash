import type { IntegrationType, ServiceIntegration } from "@shared/types";

/** The integration as the form holds it: typed secrets only, never the stored ones. */
export interface IntegrationDraft {
  type: string | null;
  values: Record<string, string | boolean>;
  /** Secrets the server already has for this type. */
  secretsSet: string[];
}

export function draftFrom(integration: ServiceIntegration | null | undefined): IntegrationDraft {
  return integration
    ? {
        type: integration.type,
        values: { ...integration.values },
        secretsSet: integration.secretsSet,
      }
    : { type: null, values: {}, secretsSet: [] };
}

/** Switching type starts from empty fields, since another app's settings don't carry over. */
export function changeType(
  type: string | null,
  original: ServiceIntegration | null | undefined
): IntegrationDraft {
  if (type !== null && original?.type === type) return draftFrom(original);
  return { type, values: {}, secretsSet: [] };
}

/** What's missing before it can be saved, or null. */
export function draftProblem(
  draft: IntegrationDraft,
  type: IntegrationType | undefined
): string | null {
  if (!draft.type) return null;
  if (!type) return "That integration isn't available";
  for (const field of type.fields) {
    if (!field.required || field.kind === "toggle") continue;
    const value = draft.values[field.key];
    const filled = typeof value === "string" && value.trim() !== "";
    if (!filled && !(field.kind === "secret" && draft.secretsSet.includes(field.key))) {
      return `${field.label} is required for the integration`;
    }
  }
  return null;
}

/** The values to send: secrets only when typed, so stored ones stay put. */
export function draftValues(
  draft: IntegrationDraft,
  type: IntegrationType
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const field of type.fields) {
    const value = draft.values[field.key];
    if (field.kind === "toggle") values[field.key] = value === true;
    else if (typeof value === "string" && (field.kind !== "secret" || value.trim() !== "")) {
      values[field.key] = value;
    }
  }
  return values;
}

/** The dashboard-icons picture for an integration's app. */
export function integrationIconUrl(slug: string): string {
  return `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${slug}.svg`;
}
