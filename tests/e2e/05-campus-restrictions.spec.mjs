// @ts-check
import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./helpers.mjs";

test.describe("Journey 5: Campus Restrictions", () => {
  test("authenticated Vellore user sees restriction message on Chennai campus faculty", async ({
    page,
  }) => {
    // Navigate to a Chennai campus faculty page
    await page.goto("/vit-c/fac-e2e-c01");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    // Sign in as test user (associated with vit-v)
    await signInAsTestUser(page);

    // Should see the cross-campus restriction message
    await expect(
      page.getByText(/you can only rate faculty from your own campus/i)
    ).toBeVisible({ timeout: 10_000 });

    // The review form textarea should NOT be visible
    await expect(
      page.getByPlaceholder(/share your honest experience/i)
    ).not.toBeVisible();
  });

  test("authenticated Vellore user CAN see the review form on Vellore campus faculty", async ({
    page,
  }) => {
    // Navigate to a Vellore campus faculty page
    await page.goto("/vit-v/fac-e2e-001");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    await signInAsTestUser(page);

    // Should see the review form
    await expect(page.getByText("Your Experience")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByPlaceholder(/share your honest experience/i)
    ).toBeVisible();
  });
});
