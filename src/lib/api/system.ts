import { requestJson } from "@/lib/api/client";
import { systemInfoSchema, type SystemInfo } from "@/lib/api/schemas";

export function fetchSystemInfo(): Promise<SystemInfo> {
  return requestJson("/api/system", {}, "Failed to load system info", systemInfoSchema);
}
