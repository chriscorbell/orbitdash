import type { ServiceIntegration } from "@shared/types";
import { getDb } from "../db";
import { getAdapter } from "./adapters";
import { decryptSecret, encryptSecret } from "./secrets";
import type { AdapterConfig, IntegrationAdapter } from "./types";

const PREFIX = "integration.";

interface StoredIntegration {
  type: string;
  values: Record<string, string | boolean>;
  secrets: Record<string, string>; // sealed with secrets.ts
  updatedAt: number;
}

export class IntegrationInputError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStored(raw: string): StoredIntegration | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
    return {
      type: parsed.type,
      values: isRecord(parsed.values) ? (parsed.values as StoredIntegration["values"]) : {},
      secrets: isRecord(parsed.secrets) ? (parsed.secrets as StoredIntegration["secrets"]) : {},
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function readStored(serviceId: string): StoredIntegration | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(PREFIX + serviceId) as { value: string } | undefined;
  return row ? parseStored(row.value) : null;
}

/** Every service that has an integration, by service id. */
export function listIntegrations(): Map<string, StoredIntegration> {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings WHERE key LIKE ?")
    .all(`${PREFIX}%`) as Array<{ key: string; value: string }>;
  const result = new Map<string, StoredIntegration>();
  for (const row of rows) {
    const stored = parseStored(row.value);
    if (stored && getAdapter(stored.type)) result.set(row.key.slice(PREFIX.length), stored);
  }
  return result;
}

/** What the browser may see: the type, plain values, and which secrets have been set. */
export function getIntegration(serviceId: string): ServiceIntegration | null {
  const stored = readStored(serviceId);
  if (!stored || !getAdapter(stored.type)) return null;
  return { type: stored.type, values: stored.values, secretsSet: Object.keys(stored.secrets) };
}

/**
 * Validates and stores a service's integration. A secret left out (or empty) keeps the stored
 * one when the type is unchanged, so the form never has to show it again.
 */
export function prepareIntegration(
  serviceId: string | null,
  type: string,
  input: Record<string, string | boolean | null | undefined>
): { adapter: IntegrationAdapter; stored: StoredIntegration } {
  const adapter = getAdapter(type);
  if (!adapter) throw new IntegrationInputError("Unknown integration");
  const previous = serviceId ? readStored(serviceId) : null;
  const keep = previous?.type === type ? previous : null;

  const values: StoredIntegration["values"] = {};
  const secrets: StoredIntegration["secrets"] = {};
  for (const field of adapter.fields) {
    const value = input[field.key];
    if (field.kind === "toggle") {
      if (value === true) values[field.key] = true;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (field.kind === "secret") {
      if (text) secrets[field.key] = encryptSecret(text);
      else if (value !== null && keep?.secrets[field.key])
        secrets[field.key] = keep.secrets[field.key];
      if (field.required && !secrets[field.key]) {
        throw new IntegrationInputError(`${field.label} is required`);
      }
      continue;
    }
    if (field.kind === "url" && text && !/^https?:\/\/[^\s]+$/i.test(text)) {
      throw new IntegrationInputError(`${field.label} must be an http(s) URL`);
    }
    if (text) values[field.key] = text.slice(0, 500);
    else if (field.required) throw new IntegrationInputError(`${field.label} is required`);
  }
  return { adapter, stored: { type, values, secrets, updatedAt: Date.now() } };
}

export function saveIntegration(serviceId: string, stored: StoredIntegration): ServiceIntegration {
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(PREFIX + serviceId, JSON.stringify(stored));
  return getIntegration(serviceId)!;
}

export function deleteIntegration(serviceId: string): boolean {
  return (
    getDb()
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(PREFIX + serviceId).changes > 0
  );
}

/** Drops integrations of services that are gone for good (purged from the trash). */
export function deleteIntegrationsOf(serviceIds: readonly string[]): void {
  const remove = getDb().prepare("DELETE FROM settings WHERE key = ?");
  for (const id of serviceIds) remove.run(PREFIX + id);
}

/** The adapter's settings with secrets decrypted; the URL falls back to the service's link. */
export function toAdapterConfig(stored: StoredIntegration, serviceUrl: string): AdapterConfig {
  const values: AdapterConfig["values"] = { ...stored.values };
  for (const [key, sealed] of Object.entries(stored.secrets)) {
    const secret = decryptSecret(sealed);
    if (secret !== null) values[key] = secret;
  }
  const url = typeof values.url === "string" && values.url ? values.url : serviceUrl;
  return { url, values };
}
