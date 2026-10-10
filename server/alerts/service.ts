import type { Database } from "bun:sqlite";
import { parseAlertRules } from "@shared/alerts";
import type { AlertRule, AlertsResponse, HostSnapshot, MetricAlert } from "@shared/types";
import { getDb } from "../db";
import { publish } from "../events";
import { createAlertEvaluator, readingsFromSnapshot } from "./evaluator";

const RULES_KEY = "alerts.rules";
const RECENT_LIMIT = 20;
/** Resolved alerts are kept this long for the history list. */
export const ALERT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface AlertRow {
  id: string;
  metric: MetricAlert["metric"];
  subject: string | null;
  threshold: number;
  duration_sec: number;
  value: number;
  peak: number;
  started_at: number;
  fired_at: number;
  resolved_at: number | null;
}

function fromRow(row: AlertRow): MetricAlert {
  return {
    id: row.id,
    metric: row.metric,
    subject: row.subject,
    threshold: row.threshold,
    durationSec: row.duration_sec,
    value: row.value,
    peak: row.peak,
    startedAt: row.started_at,
    firedAt: row.fired_at,
    resolvedAt: row.resolved_at,
  };
}

function save(db: Database, alert: MetricAlert) {
  db.prepare(
    `INSERT INTO metric_alerts
       (id, metric, subject, threshold, duration_sec, value, peak, started_at, fired_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET value = excluded.value, peak = excluded.peak,
       resolved_at = excluded.resolved_at`
  ).run(
    alert.id,
    alert.metric,
    alert.subject,
    alert.threshold,
    alert.durationSec,
    alert.value,
    alert.peak,
    alert.startedAt,
    alert.firedAt,
    alert.resolvedAt
  );
}

function readStoredRules(db: Database): AlertRule[] {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(RULES_KEY) as {
    value: string;
  } | null;
  try {
    return parseAlertRules(row ? JSON.parse(row.value) : undefined);
  } catch {
    return parseAlertRules(undefined);
  }
}

/**
 * Metric alerts for the running server: rules from settings, an evaluator fed by every collector
 * tick, breaches stored in SQLite and pushed on the `alerts` event topic.
 */
export function createMetricAlerts(getDatabase: () => Database = getDb) {
  let started = false;
  const createEvaluator = () =>
    createAlertEvaluator({
      createId: () => crypto.randomUUID(),
      onChange: (alert) => {
        save(getDatabase(), alert);
        publish({ type: "alert", alert });
      },
    });
  let evaluator = createEvaluator();

  function start(now: number) {
    if (started) return;
    started = true;
    // Alerts left firing by a previous run can't be followed any more; close them out.
    getDatabase()
      .prepare("UPDATE metric_alerts SET resolved_at = ? WHERE resolved_at IS NULL")
      .run(now);
    evaluator.setRules(readStoredRules(getDatabase()), now);
  }

  return {
    observe(snapshot: HostSnapshot, now: number = Date.now()) {
      start(now);
      evaluator.observe(readingsFromSnapshot(snapshot), now);
    },

    read(now: number = Date.now()): AlertsResponse {
      start(now);
      const recent = (
        getDatabase()
          .prepare(
            "SELECT * FROM metric_alerts WHERE resolved_at IS NOT NULL ORDER BY resolved_at DESC LIMIT ?"
          )
          .all(RECENT_LIMIT) as AlertRow[]
      ).map(fromRow);
      return { active: evaluator.activeAlerts(), recent, rules: readStoredRules(getDatabase()) };
    },

    /** Replaces the given metrics' rules; others keep theirs. Returns the full set. */
    updateRules(changes: AlertRule[], now: number = Date.now()): AlertRule[] {
      start(now);
      const current = readStoredRules(getDatabase());
      const next = parseAlertRules(
        current.map((rule) => changes.find((change) => change.metric === rule.metric) ?? rule)
      );
      getDatabase()
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(RULES_KEY, JSON.stringify(next));
      evaluator.setRules(next, now);
      return next;
    },

    prune(now: number = Date.now()): number {
      return getDatabase()
        .prepare("DELETE FROM metric_alerts WHERE resolved_at IS NOT NULL AND resolved_at < ?")
        .run(now - ALERT_RETENTION_MS).changes;
    },

    resetForTesting() {
      started = false;
      evaluator = createEvaluator();
    },
  };
}

export const metricAlerts = createMetricAlerts();
