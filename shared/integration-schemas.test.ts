import { describe, expect, it } from "vitest";
import {
  integrationReadingSchema,
  integrationReadingsSchema,
  integrationSaveSchema,
  integrationTestSchema,
  integrationTypesSchema,
  serviceIntegrationSchema,
} from "./integration-schemas";

describe("integration request schemas", () => {
  it("accept values and default what's left out", () => {
    expect(integrationSaveSchema.parse({ type: " pihole " })).toEqual({
      type: "pihole",
      values: {},
    });
    expect(
      integrationSaveSchema.parse({
        type: "adguard",
        values: { username: "me", password: null, ignoreTls: true },
      })
    ).toEqual({ type: "adguard", values: { username: "me", password: null, ignoreTls: true } });
    expect(
      integrationTestSchema.parse({ type: "plex", url: " http://plex.lan ", values: {} })
    ).toEqual({
      type: "plex",
      url: "http://plex.lan",
      values: {},
      serviceId: null,
    });
    for (const invalid of [
      { type: "" },
      { type: "x", values: { a: 3 } },
      { type: "x", extra: true },
    ]) {
      expect(integrationSaveSchema.safeParse(invalid).success).toBe(false);
    }
    expect(integrationTestSchema.safeParse({ type: "x", values: {} }).success).toBe(false);
  });
});

describe("integration response schemas", () => {
  it("parse types, a service's integration and readings", () => {
    const types = {
      types: [
        {
          id: "pihole",
          name: "Pi-hole",
          icon: "pi-hole",
          fields: [
            {
              key: "url",
              label: "API address",
              kind: "url",
              required: false,
              placeholder: "x",
              help: "y",
            },
            { key: "password", label: "Password", kind: "secret", required: true },
          ],
        },
      ],
    };
    expect(integrationTypesSchema.parse(types)).toEqual(types);
    expect(serviceIntegrationSchema.parse({ integration: null })).toEqual({ integration: null });
    const integration = {
      integration: {
        type: "pihole",
        values: { url: "http://x", ignoreTls: true },
        secretsSet: ["password"],
      },
    };
    expect(serviceIntegrationSchema.parse(integration)).toEqual(integration);
    const reading = {
      type: "pihole",
      stats: [{ label: "Queries", value: "1", tone: "good" }],
      error: null,
      updatedAt: 1,
    };
    expect(integrationReadingSchema.parse(reading)).toEqual(reading);
    expect(integrationReadingsSchema.parse({ readings: { a: reading } })).toEqual({
      readings: { a: reading },
    });
    expect(
      integrationReadingSchema.safeParse({ ...reading, stats: [{ label: "x", value: 1 }] }).success
    ).toBe(false);
  });
});
