import { expect, test } from "@playwright/test";

test("an integration's Test reports why it couldn't connect", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add service" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add Service" });

  await dialog.getByLabel("Name *").fill("Orbit DNS");
  // Nothing listens on the discard port, so the test never reaches anything.
  await dialog.getByLabel("URL *").fill("http://127.0.0.1:9/");

  await dialog.getByRole("combobox", { name: "Integration" }).click();
  await page.getByRole("option", { name: "AdGuard Home" }).click();
  const test = dialog.getByRole("button", { name: "Test AdGuard Home" });
  // Both credentials are required before there is anything to test.
  await expect(test).toBeDisabled();
  await dialog.getByLabel("Username *").fill("admin");
  await dialog.getByLabel("Password").fill("hunter2");
  await test.click();
  // Exact, because reading the page for the link can fail the same way a moment earlier.
  await expect(dialog.getByText("Connection refused", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});
