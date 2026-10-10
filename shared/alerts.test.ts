import { describe, expect, it } from "vitest";
import { alertRuleSchema, alertRulesUpdateSchema, alertsResponseSchema } from "./alert-schemas";
import {
  alertMetricLabel,
  DEFAULT_ALERT_RULES,
  describeAlert,
  formatAlertDuration,
  formatAlertValue,
  isValidAlertRule,
  parseAlertRules,
} from "./alerts";

describe("alert rules", () => {
  it("validates thresholds per metric and the allowed durations", () => {
    expect(
      isValidAlertRule({ metric: "cpu", enabled: true, threshold: 90, durationSec: 300 })
    ).toBe(true);
    expect(
      isValidAlertRule({ metric: "temperature", enabled: true, threshold: 20, durationSec: 60 })
    ).toBe(false);
    expect(isValidAlertRule({ metric: "cpu", enabled: true, threshold: 90, durationSec: 7 })).toBe(
      false
    );
    expect(isValidAlertRule({ metric: "gpu", enabled: true, threshold: 90, durationSec: 60 })).toBe(
      false
    );
    expect(
      isValidAlertRule({ metric: "cpu", enabled: "yes", threshold: 90, durationSec: 60 })
    ).toBe(false);
    expect(
      isValidAlertRule({ metric: "cpu", enabled: true, threshold: Infinity, durationSec: 60 })
    ).toBe(false);
    expect(isValidAlertRule(null)).toBe(false);
  });

  it("reads stored rules leniently into one per metric, dropping extra fields", () => {
    expect(parseAlertRules(undefined)).toEqual(DEFAULT_ALERT_RULES);
    const rules = parseAlertRules([
      { metric: "disk", enabled: false, threshold: 95, durationSec: 0, extra: 1 },
      { metric: "cpu", enabled: true, threshold: 500, durationSec: 60 },
    ]);
    expect(rules[2]).toEqual({ metric: "disk", enabled: false, threshold: 95, durationSec: 0 });
    expect(rules[0]).toEqual(DEFAULT_ALERT_RULES[0]);
  });
});

describe("alert wording", () => {
  it("describes alerts and formats values and durations", () => {
    expect(describeAlert({ metric: "cpu", subject: null, threshold: 90, durationSec: 300 })).toBe(
      "CPU above 90% for 5 min"
    );
    expect(describeAlert({ metric: "disk", subject: "/srv", threshold: 85, durationSec: 0 })).toBe(
      "Disk (/srv) above 85%"
    );
    expect(formatAlertValue("temperature", 84.6)).toBe("85°C");
    expect(formatAlertDuration(3600)).toBe("1 hour");
    expect(alertMetricLabel("memory")).toBe("Memory");
  });
});

describe("alert schemas", () => {
  it("accepts valid updates and rejects bad thresholds, durations and duplicates", () => {
    const rule = { metric: "cpu", enabled: true, threshold: 90, durationSec: 60 };
    expect(alertRulesUpdateSchema.parse({ rules: [rule] })).toEqual({ rules: [rule] });
    expect(alertRuleSchema.safeParse({ ...rule, threshold: 0 }).success).toBe(false);
    expect(alertRuleSchema.safeParse({ ...rule, durationSec: 5 }).success).toBe(false);
    expect(alertRulesUpdateSchema.safeParse({ rules: [rule, rule] }).success).toBe(false);
  });

  it("parses alert responses", () => {
    const alert = {
      id: "a",
      metric: "disk",
      subject: "/",
      threshold: 85,
      durationSec: 60,
      value: 90,
      peak: 92,
      startedAt: 1,
      firedAt: 2,
      resolvedAt: null,
    };
    expect(
      alertsResponseSchema.parse({ active: [alert], recent: [], rules: DEFAULT_ALERT_RULES }).active
    ).toHaveLength(1);
  });
});
