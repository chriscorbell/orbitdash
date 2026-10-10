import { isQuietAt } from "@shared/notifications";
import type { MetricAlert, NotificationOptions, ServiceStatus } from "@shared/types";
import {
  alertFiringMessage,
  alertResolvedMessage,
  serviceDownMessage,
  serviceRecoveredMessage,
  type MessageContext,
  type NotificationMessage,
  type ServiceSubject,
  type SummaryItem,
} from "./messages";
import type { StoredIncident } from "./store";

/**
 * Decides what to say and when. It follows statuses and alerts as they arrive and never sends
 * anything itself: messages go to `send`, and quiet hours collect them for `sendSummary`.
 *
 * - A service that goes down opens an incident. Its "down" message waits until it has been down
 *   for the configured delay, so a blip that recovers sooner says nothing at all, and an incident
 *   is announced once however many checks fail. Its recovery is only sent if its "down" was.
 * - An alert's firing message goes out at once (rules have their own duration), and its resolution
 *   only if the firing was announced, so alerts closed out by a restart stay quiet.
 * - During quiet hours messages are held. The first tick after they end sends one summary with
 *   everything held: problems still going on and the ones that came and went.
 */

export interface EngineDeps {
  now: () => number;
  readOptions: () => NotificationOptions;
  lookupService: (id: string) => { name: string; url: string } | null;
  saveIncident: (incident: StoredIncident) => void;
  deleteIncident: (serviceId: string) => void;
  send: (message: NotificationMessage) => void;
  sendSummary: (items: SummaryItem[], ctx: MessageContext) => void;
}

interface Incident extends StoredIncident {
  error: string | null;
  /** Its delay passed during quiet hours; it goes out with the summary. */
  held: boolean;
}

const statusKey = (id: string) => `status:${id}`;
const alertKey = (id: string) => `alert:${id}`;

export function createNotificationEngine(deps: EngineDeps, stored: StoredIncident[] = []) {
  const incidents = new Map<string, Incident>(
    stored.map((incident) => [incident.serviceId, { ...incident, error: null, held: false }])
  );
  const announcedAlerts = new Set<string>();
  const held = new Map<string, SummaryItem>();

  const contextOf = (options: NotificationOptions, now: number): MessageContext => ({
    now,
    timeZone: options.timeZone,
  });

  function subject(id: string): ServiceSubject | null {
    const info = deps.lookupService(id);
    return info ? { id, ...info } : null;
  }

  function evaluate(incident: Incident, options: NotificationOptions, now: number, quiet: boolean) {
    if (incident.notifiedAt !== null || incident.held) return;
    if (now - incident.startedAt < options.downDelayMinutes * 60_000) return;
    const service = subject(incident.serviceId);
    if (!service) return;

    if (quiet) {
      incident.held = true;
      held.set(statusKey(service.id), {
        kind: "status",
        service,
        startedAt: incident.startedAt,
        endedAt: null,
        error: incident.error,
      });
      return;
    }
    incident.notifiedAt = now;
    deps.saveIncident(incident);
    deps.send(
      serviceDownMessage(service, incident.startedAt, incident.error, contextOf(options, now))
    );
  }

  function closeIncident(id: string, incident: Incident) {
    incidents.delete(id);
    deps.deleteIncident(id);
    if (incident.held) held.delete(statusKey(id));
  }

  return {
    /** Each status event: a check result, or null once checks stop for the service. */
    status(id: string, status: ServiceStatus | null) {
      const incident = incidents.get(id);
      if (!status || status.state === "unknown") {
        // Checks turned off, the target changed, or the service was deleted: nothing to report.
        if (incident) closeIncident(id, incident);
        return;
      }

      const now = deps.now();
      if (status.state === "down") {
        if (incident) {
          incident.error = status.error;
          const item = held.get(statusKey(id));
          if (incident.held && item?.kind === "status") item.error = status.error;
          return;
        }
        const options = deps.readOptions();
        const fresh: Incident = {
          serviceId: id,
          startedAt: status.changedAt ?? now,
          notifiedAt: null,
          error: status.error,
          held: false,
        };
        incidents.set(id, fresh);
        deps.saveIncident(fresh);
        evaluate(fresh, options, now, isQuietAt(now, options));
        return;
      }

      // Up or slow again.
      if (!incident) return;
      incidents.delete(id);
      deps.deleteIncident(id);
      const service = subject(id);
      if (!service) return;
      const upAt = status.changedAt ?? now;
      const options = deps.readOptions();

      if (incident.held || (incident.notifiedAt !== null && isQuietAt(now, options))) {
        held.set(statusKey(id), {
          kind: "status",
          service,
          startedAt: incident.startedAt,
          endedAt: upAt,
          error: incident.error,
        });
      } else if (incident.notifiedAt !== null) {
        deps.send(
          serviceRecoveredMessage(service, incident.startedAt, upAt, contextOf(options, now))
        );
      }
      // Never announced: it came back within the delay, so it stays a non-event.
    },

    /** Each alert event: firing (resolvedAt null) or resolved. */
    alert(alert: MetricAlert) {
      const now = deps.now();
      const options = deps.readOptions();
      const key = alertKey(alert.id);
      const quiet = isQuietAt(now, options);

      if (alert.resolvedAt === null) {
        announcedAlerts.add(alert.id);
        if (quiet) held.set(key, { kind: "alerts", alert });
        else deps.send(alertFiringMessage(alert, contextOf(options, now)));
        return;
      }
      if (!announcedAlerts.delete(alert.id)) return;
      if (quiet || held.has(key)) held.set(key, { kind: "alerts", alert });
      else deps.send(alertResolvedMessage(alert, contextOf(options, now)));
    },

    /** Run every few seconds: sends the summary once quiet hours end, and delayed "down"s. */
    tick() {
      const now = deps.now();
      const options = deps.readOptions();
      const quiet = isQuietAt(now, options);

      if (!quiet && held.size > 0) {
        for (const incident of incidents.values()) {
          if (!incident.held) continue;
          incident.held = false;
          incident.notifiedAt = now;
          deps.saveIncident(incident);
        }
        const items = [...held.values()];
        held.clear();
        deps.sendSummary(items, contextOf(options, now));
      }
      for (const incident of incidents.values()) evaluate(incident, options, now, quiet);
    },

    /** For tests: what is being followed. */
    inspect() {
      return {
        incidents: [...incidents.values()].map((incident) => ({ ...incident })),
        held: [...held.values()],
      };
    },
  };
}

export type NotificationEngine = ReturnType<typeof createNotificationEngine>;
