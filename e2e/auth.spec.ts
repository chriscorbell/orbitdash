import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "./auth-backend";

// Runs in the "auth-password" project, against a backend started with ORBITDASH_AUTH=password.

function passwordField(page: Page) {
  // Exact, so the "Show password" toggle doesn't match too.
  return page.getByLabel("Password", { exact: true });
}

async function signIn(page: Page, password: string) {
  await passwordField(page).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("signs in with the password, refuses a wrong one, and signs out", async ({ page }) => {
  await page.goto("/");

  await expect(passwordField(page)).toBeFocused();
  await expect(page.getByRole("region", { name: "Live stats" })).toHaveCount(0);

  await signIn(page, "not the password");
  await expect(page.getByRole("alert")).toHaveText("Incorrect password.");
  await expect(passwordField(page)).toHaveValue("");

  await signIn(page, E2E_PASSWORD);
  await expect(page.getByRole("button", { name: "Add service" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live stats" })).toBeVisible();

  // The session cookie survives a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Add service" })).toBeVisible();

  await page.getByRole("button", { name: "Open settings" }).click();
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: "Security" })
    .click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(passwordField(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add service" })).toHaveCount(0);

  // The server agrees: this browser no longer has a session.
  const status = await page.evaluate(async () => (await fetch("/api/services")).status);
  expect(status).toBe(401);
});
