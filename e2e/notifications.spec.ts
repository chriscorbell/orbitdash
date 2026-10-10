import { expect, test } from "@playwright/test";

test("a notification channel can be added, tested and deleted from settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: "Notifications" })
    .click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);
  const settings = page.getByRole("main");
  await settings.getByRole("button", { name: "Add channel" }).click();

  const form = page.getByRole("dialog", { name: "Add channel" });
  await form.getByRole("radio", { name: "Webhook" }).click();
  await form.getByLabel("Name").fill("Local hook");
  // Nothing listens on the discard port, so the test never sends anything anywhere.
  await form.getByLabel("URL").fill("http://127.0.0.1:9/orbitdash");
  await form.getByRole("button", { name: "Add channel" }).click();
  await expect(form).toBeHidden();

  const channels = settings.getByRole("list", { name: "Notification channels" });
  await expect(channels.getByText("Local hook")).toBeVisible();
  await settings.getByRole("button", { name: "Send a test to Local hook" }).click();
  await expect(channels.getByText("Connection refused")).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Recent deliveries" })).toBeVisible();

  // The saved URL comes back masked, and an untouched field keeps it.
  await settings.getByRole("button", { name: "Edit Local hook" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Local hook" });
  await expect(edit.getByLabel("URL")).toHaveAttribute(
    "placeholder",
    "Saved (http://127.0.0.1:9/••••)"
  );
  await edit.getByRole("button", { name: "Delete" }).click();
  await edit.getByRole("button", { name: "Delete channel?" }).click();
  await expect(edit).toBeHidden();
  await expect(settings.getByText("No channels yet")).toBeVisible();
});
