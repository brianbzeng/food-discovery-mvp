import { expect, test, type Page } from "@playwright/test";

async function openHydratedDiscovery(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Taste memory saved")).toBeVisible();
}

test("first visit asks for a meal and personalizes the active choice", async ({
  page,
}) => {
  await openHydratedDiscovery(page);

  const mealChooser = page.getByLabel("Choose a meal");
  await expect(mealChooser).toContainText("Breakfast");
  await expect(mealChooser).toContainText("Brunch");
  await expect(mealChooser).toContainText("Lunch");
  await expect(mealChooser).toContainText("Dinner");
  await expect(mealChooser).toContainText("Late night");
  await expect(mealChooser).toContainText("Snack");

  await mealChooser.getByRole("button", { name: "Brunch" }).click();
  await expect(
    mealChooser.getByRole("button", { name: /Brunch/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText(/brunch/i);
});

test("saving prompts for a profile and survives a reload", async ({ page }) => {
  await openHydratedDiscovery(page);
  const initialGuestCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "food_guest_id",
  );
  expect(initialGuestCookie).toBeDefined();

  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().includes("/api/v1/saves/"),
  );
  await page.getByRole("button", { name: "Save restaurant" }).click();
  await expect(
    page.getByRole("dialog", { name: "Your discovery data." }),
  ).toBeVisible();
  const response = await saveResponse;
  expect(response.status()).toBe(200);
  const savePayload = (await response.json()) as { saves: unknown[] };
  expect(savePayload.saves).toHaveLength(1);

  await page.getByRole("button", { name: "Close account" }).click();
  await page.reload();
  const reloadedGuestCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "food_guest_id",
  );
  expect(reloadedGuestCookie?.value).toBe(initialGuestCookie?.value);
  await expect(
    page.getByRole("button", { name: "Shortlist (1)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Shortlist (1)" }).click();

  const shortlist = page.getByRole("dialog", { name: "Saved for later." });
  await expect(shortlist).toBeVisible();
  await expect(shortlist.locator(".saved-row")).toHaveCount(1);
});

test("five discovery choices prompt for a profile", async ({ page }) => {
  await openHydratedDiscovery(page);

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "Pass for now" }).click();
  }

  await expect(
    page.getByRole("dialog", { name: "Your discovery data." }),
  ).toBeVisible();
});

test("dish-aware allergen settings persist without hiding a safe sibling dish", async ({
  page,
}) => {
  await openHydratedDiscovery(page);
  await page.getByRole("button", { name: "Edit allergy settings" }).click();

  const settings = page.getByRole("dialog", {
    name: "What should we screen for?",
  });
  await settings.getByText("Peanut", { exact: true }).click();
  await expect(settings.getByLabel("Peanut")).toBeChecked();

  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith("/api/v1/taste-profile"),
  );
  await settings.getByRole("button", { name: "Save safety settings" }).click();
  await saveResponse;
  await expect(settings).toBeHidden();

  const recommendations = await page.evaluate(async () => {
    const response = await fetch("/api/v1/feed?limit=50");
    if (!response.ok) throw new Error("Feed unavailable");
    const payload = (await response.json()) as {
      recommendations: Array<{
        restaurantId: string;
        dishCardId: string;
      }>;
    };
    return payload.recommendations;
  });

  expect(recommendations).toContainEqual(
    expect.objectContaining({
      restaurantId: "restaurant-fold-house",
      dishCardId: "demo-fold-house-vegetable-wontons",
    }),
  );
  expect(recommendations).not.toContainEqual(
    expect.objectContaining({
      dishCardId: "demo-fold-house",
    }),
  );

  await page.reload();
  await expect(page.getByText("Taste memory saved")).toBeVisible();
  await page.getByRole("button", { name: "Edit allergy settings" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "What should we screen for?" })
      .getByLabel("Peanut"),
  ).toBeChecked();
});
