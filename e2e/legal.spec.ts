import { expect, test } from "@playwright/test";

test("privacy and terms pages expose the implemented safety boundaries", async ({
  page,
}) => {
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your discovery data, explained.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Guest identity" })).toBeVisible();
  await expect(page.getByText(/HTTP-only cookies/i)).toBeVisible();

  await page.getByRole("link", { name: "Terms" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Terms for this early product.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Allergens and dietary needs" }),
  ).toBeVisible();
});

test("unknown routes return the custom 404 page", async ({ page }) => {
  const response = await page.goto("/definitely-not-on-the-menu");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "We could not find that page.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to discovery" })).toBeVisible();
});

test("readiness endpoint verifies the Worker and D1 binding", async ({
  request,
}) => {
  const response = await request.get("/api/v1/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({
    status: "ok",
    checks: {
      worker: "ok",
      database: "ok",
    },
  });
});
