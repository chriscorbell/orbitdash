const DEVICE_ID_KEY = "orbitdash.deviceId";

let memoryDeviceId: string | null = null;

/** A random id for this browser, used to keep per-device settings on the server. */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const created = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    // Storage blocked: fall back to an id for this page load only.
    memoryDeviceId ??= crypto.randomUUID();
    return memoryDeviceId;
  }
}
