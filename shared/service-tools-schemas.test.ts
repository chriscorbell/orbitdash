import { describe, expect, it } from "vitest";
import {
  serviceInspectionSchema,
  serviceInspectRequestSchema,
  serviceTestRequestSchema,
  serviceTestResultSchema,
} from "./service-tools-schemas";

describe("service tool schemas", () => {
  it("reads inspect and test requests with defaults", () => {
    expect(serviceInspectRequestSchema.parse({ url: " nas.lan " })).toEqual({ url: "nas.lan" });
    expect(serviceInspectRequestSchema.safeParse({ url: "" }).success).toBe(false);
    expect(serviceInspectRequestSchema.safeParse({ url: "x", extra: 1 }).success).toBe(false);

    expect(serviceTestRequestSchema.parse({ url: "nas.lan" })).toEqual({
      url: "nas.lan",
      check_method: "http",
      check_target: null,
      check_ignore_tls: false,
    });
    expect(
      serviceTestRequestSchema.parse({
        url: "x",
        check_method: "tcp",
        check_target: " nas.lan:22 ",
        check_ignore_tls: true,
      })
    ).toEqual({
      url: "x",
      check_method: "tcp",
      check_target: "nas.lan:22",
      check_ignore_tls: true,
    });
    expect(serviceTestRequestSchema.safeParse({ url: "x", check_method: "icmp" }).success).toBe(
      false
    );
  });

  it("parses inspections and test results", () => {
    const inspection = {
      url: "http://nas.lan/",
      reachable: true,
      error: null,
      name: "Synology",
      iconUrl: null,
      selfSigned: false,
    };
    expect(serviceInspectionSchema.parse(inspection)).toEqual(inspection);
    const result = {
      target: "nas.lan:22",
      state: "up",
      latencyMs: 3,
      statusCode: null,
      error: null,
    };
    expect(serviceTestResultSchema.parse(result)).toEqual(result);
    expect(serviceTestResultSchema.safeParse({ ...result, state: "unknown" }).success).toBe(false);
  });
});
