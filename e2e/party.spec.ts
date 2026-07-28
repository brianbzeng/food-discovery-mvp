import { expect, test } from "@playwright/test";

test("creator and invitee can find something for everyone without profile leakage", async ({
  browser,
  page,
}) => {
  await page.goto("/party");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Find something for everyone.",
    }),
  ).toBeVisible();
  await expect(page.getByText("No plans yet. Create the first one.")).toBeVisible();

  await page.getByLabel("Plan name").fill("Friday dinner");
  await page.getByLabel("Your display name").fill("Brian");
  await page.getByRole("button", { name: "Create private plan" }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: "Friday dinner" }),
  ).toBeVisible();
  await expect(page.locator(".party-member").filter({ hasText: "Brian" })).toContainText(
    "Accepted",
  );
  await expect(page.locator(".party-recommendation").first()).toBeVisible();

  await page.getByLabel("Friend's display name").fill("Maya");
  await page.getByRole("button", { name: "Create invite" }).click();
  const shareLink = page.getByLabel("Private share link");
  await expect(shareLink).toBeVisible();
  const invitationUrl = await shareLink.inputValue();
  expect(invitationUrl).toMatch(/\/party#invite=[A-Za-z0-9_-]{32,128}$/);

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  try {
    await inviteePage.goto(invitationUrl);
    await expect(
      inviteePage.getByRole("heading", {
        name: "Bring your taste, not your profile details.",
      }),
    ).toBeVisible();

    const recommendationResponse = inviteePage.waitForResponse(
      (response) =>
        response.url().includes("/recommendations") &&
        response.request().method() === "GET",
    );
    await inviteePage
      .getByRole("button", { name: "Accept invitation" })
      .click();

    await expect(
      inviteePage.getByRole("heading", { level: 2, name: "Friday dinner" }),
    ).toBeVisible();
    await expect(
      inviteePage.locator(".party-member").filter({ hasText: "Maya" }),
    ).toContainText("Accepted");

    const response = await recommendationResponse;
    expect(response.status()).toBe(200);
    const responseText = await response.text();
    expect(responseText).toContain(
      "aggregate-results-and-current-member-outcome-only",
    );
    expect(responseText).not.toMatch(
      /"allergens"|"dietaryRestrictions"|"learnedWeights"|"memberOutcomes"/,
    );
    await expect(
      inviteePage.getByText(
        /aggregate group scores and your own outcome only/i,
      ),
    ).toBeVisible();
  } finally {
    await inviteeContext.close();
  }

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator(".party-member").filter({ hasText: "Maya" })).toContainText(
    "Accepted",
  );
});
