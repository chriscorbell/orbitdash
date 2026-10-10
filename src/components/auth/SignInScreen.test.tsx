// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { SignInScreen } from "@/components/auth/SignInScreen";
import { signIn } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

vi.mock("@/lib/api/auth", () => ({ signIn: vi.fn() }));

const signedIn = {
  authenticated: true,
  canEdit: true,
  guest: "none" as const,
  mode: "password" as const,
  user: "admin",
};

beforeEach(() => {
  document.title = "Homelab";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function passwordField() {
  return screen.getByLabelText("Password") as HTMLInputElement;
}

describe("SignInScreen", () => {
  it("names the dashboard and focuses an empty password field", async () => {
    const { container } = render(<SignInScreen mode="password" onSignedIn={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Homelab" })).toBeTruthy();
    expect(document.activeElement).toBe(passwordField());
    expect(passwordField().autocomplete).toBe("current-password");
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.queryByRole("button", { name: "Back to dashboard" })).toBeNull();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("signs in and hands over the new session", async () => {
    const user = userEvent.setup();
    const onSignedIn = vi.fn();
    vi.mocked(signIn).mockResolvedValue(signedIn);
    render(<SignInScreen mode="password" onSignedIn={onSignedIn} />);

    await user.type(passwordField(), "hunter22{Enter}");

    expect(signIn).toHaveBeenCalledWith("hunter22");
    expect(onSignedIn).toHaveBeenCalledWith(signedIn);
  });

  it("shows or hides the password", async () => {
    const user = userEvent.setup();
    render(<SignInScreen mode="password" onSignedIn={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordField().type).toBe("text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordField().type).toBe("password");
  });

  it("says when the password is wrong and lets you try again", async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockRejectedValue(new ApiError("incorrect password", 401));
    render(<SignInScreen mode="password" onSignedIn={vi.fn()} />);

    await user.type(passwordField(), "nope");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Incorrect password.");
    expect(passwordField().value).toBe("");
    expect(passwordField().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(passwordField());
  });

  it("explains other failures without blaming the password", async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SignInScreen mode="password" onSignedIn={vi.fn()} />);

    await user.type(passwordField(), "hunter22{Enter}");

    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't sign in. Try again.");
    expect(passwordField().value).toBe("hunter22");
  });

  it("counts down a rate limit and then allows another try", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(signIn).mockRejectedValue(new ApiError("too many sign-in attempts", 429, 65));
    render(<SignInScreen mode="password" onSignedIn={vi.fn()} />);
    // Time on the screen before the attempt must not be added to the wait.
    vi.advanceTimersByTime(4_000);

    await user.type(passwordField(), "hunter22{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Too many attempts. Try again in 1:05.")
    );
    const button = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.getByRole("alert").textContent).toBe("Too many attempts. Try again in 0:59.");

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(button.disabled).toBe(false);
  });

  it("offers the way back to the read-only dashboard when guests can view it", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<SignInScreen mode="password" onCancel={onCancel} onSignedIn={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("points to the proxy in proxy mode instead of asking for a password", () => {
    render(<SignInScreen mode="proxy" onSignedIn={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Not signed in" })).toBeTruthy();
    expect(screen.getByText("Open this dashboard through your sign-in proxy.")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
