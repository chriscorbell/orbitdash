import { describe, expect, it } from "bun:test";
import type { AlertRule, HostSnapshot, MetricAlert } from "@shared/types";
import { createAlertEvaluator, readingsFromSnapshot, type Reading } from "./evaluator";

const cpuRule: AlertRule = { metric: "cpu", enabled: true, threshold: 90, durationSec: 60 };
const diskRule: AlertRule = { metric: "disk", enabled: true, threshold: 85, durationSec: 0 };

function setup(rules: AlertRule[] = [cpuRule, diskRule]) {
  const changes: MetricAlert[] = [];
  let id = 0;
  const evaluator = createAlertEvaluator({
    createId: () => `alert-${++id}`,
    onChange: (alert) => changes.push(alert),
  });
  evaluator.setRules(rules, 0);
  return { evaluator, changes };
}

const cpu = (value: number): Reading => ({ metric: "cpu", subject: null, value });
const disk = (subject: string, value: number): Reading => ({ metric: "disk", subject, value });

describe("createAlertEvaluator", () => {
  it("fires only after the breach lasts the rule's duration, tracking the peak", () => {
    const { evaluator, changes } = setup();
    evaluator.observe([cpu(95)], 1_000);
    evaluator.observe([cpu(97)], 30_000);
    expect(changes).toHaveLength(0);

    evaluator.observe([cpu(93)], 61_000);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      metric: "cpu",
      subject: null,
      threshold: 90,
      startedAt: 1_000,
      firedAt: 61_000,
      peak: 97,
      value: 93,
      resolvedAt: null,
    });
    expect(evaluator.activeAlerts()).toHaveLength(1);
  });

  it("starts the clock over when the value dips before the duration", () => {
    const { evaluator, changes } = setup();
    evaluator.observe([cpu(95)], 0);
    evaluator.observe([cpu(80)], 30_000);
    evaluator.observe([cpu(95)], 40_000);
    evaluator.observe([cpu(95)], 90_000);
    expect(changes).toHaveLength(0);
    evaluator.observe([cpu(95)], 100_000);
    expect(changes[0].startedAt).toBe(40_000);
  });

  it("resolves only once the value falls below the threshold by the margin", () => {
    const { evaluator, changes } = setup([{ ...cpuRule, durationSec: 0 }]);
    evaluator.observe([cpu(95)], 0);
    evaluator.observe([cpu(89)], 1_000);
    expect(evaluator.activeAlerts()[0].value).toBe(89);
    expect(changes).toHaveLength(1);

    evaluator.observe([cpu(86)], 2_000);
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({ resolvedAt: 2_000, value: 86, peak: 95 });
    expect(evaluator.activeAlerts()).toEqual([]);
  });

  it("watches every filesystem separately and resolves one that goes away", () => {
    const { evaluator, changes } = setup();
    evaluator.observe([disk("/", 90), disk("/srv", 50)], 0);
    expect(changes.map((alert) => alert.subject)).toEqual(["/"]);

    evaluator.observe([disk("/srv", 95)], 1_000);
    expect(changes.map((alert) => [alert.subject, alert.resolvedAt])).toEqual([
      ["/", null],
      ["/srv", null],
      ["/", 1_000],
    ]);
  });

  it("ignores disabled rules and starts over when rules change", () => {
    const { evaluator, changes } = setup([{ ...cpuRule, enabled: false }]);
    evaluator.observe([cpu(99)], 0);
    evaluator.observe([cpu(99)], 120_000);
    expect(changes).toHaveLength(0);

    evaluator.setRules([{ ...cpuRule, durationSec: 0 }], 120_000);
    evaluator.observe([cpu(99)], 121_000);
    expect(changes).toHaveLength(1);
    evaluator.setRules([{ ...cpuRule, threshold: 95 }], 122_000);
    expect(changes.at(-1)).toMatchObject({ resolvedAt: 122_000 });
  });
});

describe("readingsFromSnapshot", () => {
  it("reads CPU, memory, temperature and each filesystem, skipping what is missing", () => {
    const snapshot = {
      cpu: { usage: 50, temperatureCelsius: 70 },
      memory: { totalBytes: 200, usedBytes: 50 },
      filesystems: [
        { mountpoint: "/", totalBytes: 100, usedBytes: 40 },
        { mountpoint: "/empty", totalBytes: 0, usedBytes: 0 },
      ],
    } as unknown as HostSnapshot;
    expect(readingsFromSnapshot(snapshot)).toEqual([
      { metric: "cpu", subject: null, value: 50 },
      { metric: "memory", subject: null, value: 25 },
      { metric: "temperature", subject: null, value: 70 },
      { metric: "disk", subject: "/", value: 40 },
    ]);

    const bare = {
      cpu: { usage: null, temperatureCelsius: null },
      memory: null,
      filesystems: [],
    } as unknown as HostSnapshot;
    expect(readingsFromSnapshot(bare)).toEqual([]);
  });
});
