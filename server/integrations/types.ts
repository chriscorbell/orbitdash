import type { IntegrationField, IntegrationStat } from "@shared/types";

/** The settings an adapter gets: the URL (the service's own unless set) and its fields. */
export interface AdapterConfig {
  url: string;
  values: Record<string, string | boolean>;
}

export interface AdapterContext {
  /** Requests through here get a deadline, TLS handling and safe error messages. */
  http: AdapterHttp;
}

export interface AdapterHttp {
  json: (path: string, init?: RequestInit & { form?: Record<string, string> }) => Promise<unknown>;
  /** For APIs that answer with a session cookie or token in a header. */
  raw: (path: string, init?: RequestInit & { form?: Record<string, string> }) => Promise<Response>;
}

/**
 * The integration contract: what an app needs (fields) and how to turn its API into up to four
 * figures for the service card. Adapters only read; they never change anything in the app.
 */
export interface IntegrationAdapter {
  id: string;
  name: string;
  icon: string;
  fields: IntegrationField[];
  /** How long a reading stays fresh. */
  pollIntervalMs: number;
  read: (config: AdapterConfig, context: AdapterContext) => Promise<IntegrationStat[]>;
}

export class IntegrationError extends Error {}

export const URL_FIELD: IntegrationField = {
  key: "url",
  label: "API address",
  kind: "url",
  required: false,
  placeholder: "Same as the service link",
  help: "Only needed when the API isn't at the service's own link.",
};

export const IGNORE_TLS_FIELD: IntegrationField = {
  key: "ignoreTls",
  label: "Allow self-signed certificates",
  kind: "toggle",
  required: false,
};
