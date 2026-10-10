// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker, reloadOnStaleChunks, unregisterServiceWorker } from "@/lib/pwa";

function fakeRegistration(scriptURL: string | null) {
  return {
    active: scriptURL ? { scriptURL } : null,
    installing: null,
    waiting: null,
    unregister: vi.fn(async () => true),
    update: vi.fn(async () => undefined),
  };
}

function fakeContainer({
  registration = fakeRegistration("https://dash.example/sw.js"),
  registrations = [] as ReturnType<typeof fakeRegistration>[],
  registerFails = false,
} = {}) {
  return {
    getRegistrations: vi.fn(async () => registrations),
    register: vi.fn(async () => {
      if (registerFails) throw new Error("storage blocked");
      return registration;
    }),
  };
}

const asContainer = (fake: ReturnType<typeof fakeContainer>) =>
  fake as unknown as ServiceWorkerContainer;

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, "readyState", { configurable: true, value: state });
}

afterEach(() => {
  vi.restoreAllMocks();
  setReadyState("complete");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("registerServiceWorker", () => {
  it("registers the worker, bypassing the HTTP cache for updates", () => {
    setReadyState("complete");
    const container = fakeContainer();

    registerServiceWorker(asContainer(container));

    expect(container.register).toHaveBeenCalledWith("/sw.js", { updateViaCache: "none" });
  });

  it("waits for the page to finish loading before registering", () => {
    setReadyState("loading");
    const container = fakeContainer();

    registerServiceWorker(asContainer(container));
    expect(container.register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    expect(container.register).toHaveBeenCalledTimes(1);
  });

  it("looks for a new worker whenever the app comes back into view", async () => {
    const registration = fakeRegistration("https://dash.example/sw.js");
    const container = fakeContainer({ registration });

    registerServiceWorker(asContainer(container));
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled());
    await Promise.resolve();

    setVisibility("hidden");
    expect(registration.update).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("keeps the app working when registration fails", async () => {
    const container = fakeContainer({ registerFails: true });

    expect(() => registerServiceWorker(asContainer(container))).not.toThrow();
    await expect(container.register.mock.results[0]?.value).rejects.toThrow("storage blocked");
  });

  it("does nothing where service workers are unavailable, like plain http", () => {
    // happy-dom has no navigator.serviceWorker either.
    expect(navigator.serviceWorker).toBeUndefined();
    expect(() => registerServiceWorker()).not.toThrow();
    expect(() => unregisterServiceWorker()).not.toThrow();
  });
});

describe("unregisterServiceWorker", () => {
  it("removes only orbitdash's worker", async () => {
    const ours = fakeRegistration("http://localhost:4173/sw.js");
    const other = fakeRegistration("http://localhost:4173/other-worker.js");
    const empty = fakeRegistration(null);
    const container = fakeContainer({ registrations: [ours, other, empty] });

    unregisterServiceWorker(asContainer(container));

    await vi.waitFor(() => expect(ours.unregister).toHaveBeenCalled());
    expect(other.unregister).not.toHaveBeenCalled();
    expect(empty.unregister).not.toHaveBeenCalled();
    expect(container.register).not.toHaveBeenCalled();
  });
});

describe("reloadOnStaleChunks", () => {
  function fakeWindow(storage: Pick<Storage, "getItem" | "setItem">) {
    const target = new EventTarget() as EventTarget & {
      location: { reload: () => void };
      sessionStorage: Pick<Storage, "getItem" | "setItem">;
    };
    target.location = { reload: vi.fn() };
    target.sessionStorage = storage;
    return target;
  }

  function memoryStorage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
  }

  it("reloads into the new build when an old lazy chunk is gone, at most once per cooldown", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const target = fakeWindow(memoryStorage());
    reloadOnStaleChunks(target as unknown as Window);

    target.dispatchEvent(new Event("vite:preloadError"));
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(target.location.reload).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, "now").mockReturnValue(1_011_000);
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(target.location.reload).toHaveBeenCalledTimes(2);
  });

  it("still reloads when session storage is unavailable", () => {
    const target = fakeWindow({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    });
    reloadOnStaleChunks(target as unknown as Window);

    target.dispatchEvent(new Event("vite:preloadError"));

    expect(target.location.reload).toHaveBeenCalledTimes(1);
  });
});
