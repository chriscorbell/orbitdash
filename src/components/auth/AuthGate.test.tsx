// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/auth/AuthGate";
import { fetchAuthSession, signIn, signOut } from "@/lib/api/auth";
import { request } from "@/lib/api/client";
import { eventStream, type ConnectionEvent } from "@/lib/live/event-stream";
import { createQueryWrapper } from "@/test/query";
import type { AuthSession } from "@shared/auth";

vi.mock("@/lib/api/auth", () => ({
  fetchAuthSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// The dashboard itself is tested elsewhere; here it only shows what it was given.
vi.mock("@/App", () => ({
  default: ({
    auth,
    onSignIn,
    onSignOut,
  }: {
    auth: AuthSession;
    onSignIn: () => void;
    onSignOut: () => void;
  }) => (
    <main aria-label="Dashboard">
      <span data-testid="can-edit">{String(auth.canEdit)}</span>
      <button type="button" onClick={onSignIn}>
        Open sign-in
      </button>
      <button type="button" onClick={onSignOut}>
        Sign out
      </button>
    </main>
  ),
}));

const session = (overrides: Partial<AuthSession>): AuthSession => ({
  authenticated: false,
  canEdit: false,
  guest: "none",
  mode: "password",
  user: null,
  ...overrides,
});
const OPEN = session({ canEdit: true, mode: "none" });
const SIGNED_IN = session({ authenticated: true, canEdit: true, user: "admin" });
const GUEST = session({ guest: "view" });
const SIGNED_OUT = session({});

function renderGate() {
  const query = createQueryWrapper();
  render(<AuthGate />, { wrapper: query.wrapper });
  return query.client;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AuthGate", () => {
  it("shows the editable dashboard when auth is off", async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue(OPEN);
    renderGate();

    expect((await screen.findByTestId("can-edit")).textContent).toBe("true");
  });

  it("shows the sign-in screen without a session or guest access", async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue(SIGNED_OUT);
    renderGate();

    expect(await screen.findByLabelText("Password")).toBeTruthy();
    expect(screen.queryByRole("main", { name: "Dashboard" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Back to dashboard" })).toBeNull();
  });

  it("signs in, then shows the dashboard and refetches its data", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAuthSession).mockResolvedValue(SIGNED_OUT);
    vi.mocked(signIn).mockResolvedValue(SIGNED_IN);
    const client = renderGate();
    client.setQueryData(["services"], ["stale"]);

    await user.type(await screen.findByLabelText("Password"), "hunter22{Enter}");

    expect((await screen.findByTestId("can-edit")).textContent).toBe("true");
    expect(client.getQueryData(["services"])).toBeUndefined();
    expect(JSON.parse(window.localStorage.getItem("orbitdash.authCache")!)).toEqual(SIGNED_IN);
  });

  it("lets guests view, sign in from the dashboard, or go back", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAuthSession).mockResolvedValue(GUEST);
    renderGate();

    expect((await screen.findByTestId("can-edit")).textContent).toBe("false");
    await user.click(screen.getByRole("button", { name: "Open sign-in" }));
    await user.click(await screen.findByRole("button", { name: "Back to dashboard" }));

    expect(screen.getByTestId("can-edit").textContent).toBe("false");
  });

  it("signs out to the sign-in screen, or to the guest view when there is one", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAuthSession).mockResolvedValue(SIGNED_IN);
    vi.mocked(signOut).mockResolvedValueOnce(SIGNED_OUT).mockResolvedValueOnce(GUEST);
    const client = renderGate();
    client.setQueryData(["services"], ["kept until sign-out"]);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByLabelText("Password")).toBeTruthy();
    // Nothing can load without a session, so the data is dropped rather than refetched.
    expect(client.getQueryCache().find({ queryKey: ["services"] })).toBeUndefined();

    cleanup();
    renderGate();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByTestId("can-edit").textContent).toBe("false"));
  });

  it("goes back to sign-in when any request finds the session gone", async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue(SIGNED_IN);
    renderGate();
    await screen.findByTestId("can-edit");

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "sign in required", auth: SIGNED_OUT }), {
            status: 401,
          })
      )
    );
    await expect(request("/api/services", {}, "Failed")).rejects.toThrow("sign in required");

    expect(await screen.findByLabelText("Password")).toBeTruthy();
  });

  it("ignores a challenge it can't read", async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue(SIGNED_IN);
    renderGate();
    await screen.findByTestId("can-edit");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "nope", auth: "?" }), { status: 401 }))
    );
    await expect(request("/api/services", {}, "Failed")).rejects.toThrow("nope");

    expect(screen.getByTestId("can-edit").textContent).toBe("true");
  });

  it("renders the last known state at once while it checks again", async () => {
    window.localStorage.setItem("orbitdash.authCache", JSON.stringify(SIGNED_IN));
    vi.mocked(fetchAuthSession).mockResolvedValue(SIGNED_OUT);
    renderGate();

    expect(screen.getByTestId("can-edit").textContent).toBe("true");
    expect(await screen.findByLabelText("Password")).toBeTruthy();
  });

  it("falls back to the dashboard when the server can't be reached on a first visit", async () => {
    window.localStorage.setItem("orbitdash.authCache", "{broken");
    vi.mocked(fetchAuthSession).mockRejectedValue(new TypeError("Failed to fetch"));
    renderGate();

    expect((await screen.findByTestId("can-edit")).textContent).toBe("true");
  });

  it("checks the session again when the event stream drops", async () => {
    let onConnection: ((event: ConnectionEvent) => void) | undefined;
    const spy = vi.spyOn(eventStream, "onConnection").mockImplementation((listener) => {
      onConnection = listener;
      return () => {};
    });
    vi.mocked(fetchAuthSession).mockResolvedValueOnce(SIGNED_IN).mockResolvedValue(SIGNED_OUT);
    renderGate();
    await screen.findByTestId("can-edit");

    act(() => onConnection?.("open"));
    expect(fetchAuthSession).toHaveBeenCalledTimes(1);

    act(() => onConnection?.("error"));
    expect(await screen.findByLabelText("Password")).toBeTruthy();
    spy.mockRestore();
  });
});
