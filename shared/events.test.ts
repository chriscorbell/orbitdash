import { describe, expect, it } from "vitest";
import {
  configScopeForMutation,
  EVENT_TOPICS,
  parseEventTopics,
  TOPIC_BY_EVENT_TYPE,
} from "./events";

describe("parseEventTopics", () => {
  it("returns every topic when none or only unknown ones are requested", () => {
    expect(parseEventTopics(undefined)).toEqual([...EVENT_TOPICS]);
    expect(parseEventTopics(null)).toEqual([...EVENT_TOPICS]);
    expect(parseEventTopics("")).toEqual([...EVENT_TOPICS]);
    expect(parseEventTopics("weather")).toEqual([...EVENT_TOPICS]);
  });

  it("keeps known topics once, in the order given", () => {
    expect(parseEventTopics("config")).toEqual(["config"]);
    expect(parseEventTopics(" config , metrics,config,nope")).toEqual(["config", "metrics"]);
    expect(parseEventTopics("host,metrics")).toEqual(["host", "metrics"]);
    expect(parseEventTopics("alerts")).toEqual(["alerts"]);
    expect(parseEventTopics("status")).toEqual(["status"]);
  });

  it("includes the status topic among all topics", () => {
    expect(EVENT_TOPICS).toContain("status");
    expect(EVENT_TOPICS).toContain("containers");
    expect(TOPIC_BY_EVENT_TYPE.status).toBe("status");
  });
});

describe("configScopeForMutation", () => {
  it("maps routes to the data they change", () => {
    expect(configScopeForMutation("/api/alerts/rules")).toBe("settings");
    expect(configScopeForMutation("/api/services")).toBe("layout");
    expect(configScopeForMutation("/api/services/abc/move")).toBe("layout");
    expect(configScopeForMutation("/api/categories/rename")).toBe("layout");
    expect(configScopeForMutation("/api/settings/category-order")).toBe("layout");
    expect(configScopeForMutation("/api/settings")).toBe("settings");
    expect(configScopeForMutation("/api/settings/devices/abc")).toBe("settings");
    expect(configScopeForMutation("/api/backup/import")).toBe("all");
    expect(configScopeForMutation("/api/widgets/agenda/feeds/abc")).toBe("settings");
    expect(configScopeForMutation("/api/widgets/weather")).toBeNull();
    expect(configScopeForMutation("/api/import/apply")).toBe("layout");
    expect(configScopeForMutation("/api/import/preview")).toBeNull();
  });

  it("ignores mutations other clients don't display", () => {
    expect(configScopeForMutation("/api/backup/snapshots")).toBeNull();
    expect(configScopeForMutation("/api/metrics")).toBeNull();
  });
});
