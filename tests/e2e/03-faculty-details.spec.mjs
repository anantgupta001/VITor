// @ts-check
import { test, expect } from "@playwright/test";
import { getReviewsSection } from "./helpers.mjs";

test.describe("Journey 3: Faculty Details and Reviews", () => {
  test("displays faculty profile with information and aggregate statistics", async ({
    page,
  }) => {
    await page.goto("/vit-v/fac-e2e-001");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    // Faculty info
    await expect(
      page.getByRole("heading", { name: "Dr. Alice Sharma" })
    ).toBeVisible();
    await expect(page.getByText("Associate Professor")).toBeVisible();
    await expect(
      page.getByText("Computer Science and Engineering")
    ).toBeVisible();

    // Aggregate stat labels
    await expect(page.getByText("Attendance")).toBeVisible();
    await expect(page.getByText("Correction")).toBeVisible();
    await expect(page.getByText("Teaching")).toBeVisible();
    await expect(page.getByText("Approachability")).toBeVisible();
    await expect(page.getByText("Overall Rating")).toBeVisible();
    await expect(page.getByText("Total Reviews")).toBeVisible();
  });

  test("displays existing reviews from seeded data", async ({ page }) => {
    await page.goto("/vit-v/fac-e2e-001");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    // Student Reviews section
    const reviewsSection = getReviewsSection(page);
    await expect(reviewsSection.getByRole("heading", { name: "Student Reviews" })).toBeVisible();

    // Seeded review texts must be rendered inside the reviews list itself
    await expect(
      reviewsSection.getByText("Great teacher, very approachable and explains well.", { exact: true })
    ).toBeVisible();
    await expect(
      reviewsSection.getByText("One of the best professors in the department.", { exact: true })
    ).toBeVisible();
  });

  test("shows 'No reviews yet' for a faculty with zero reviews", async ({
    page,
  }) => {
    await page.goto("/vit-c/fac-e2e-c01");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    await expect(getReviewsSection(page).getByText("No reviews yet.")).toBeVisible();
  });

  test("back link navigates to the campus directory", async ({ page }) => {
    await page.goto("/vit-v/fac-e2e-001");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    // Click back link
    await page.getByRole("link", { name: /back/i }).click();

    // Should go back to campus directory
    await page.waitForURL("**/vit-v**");
    await expect(
      page.getByPlaceholder(/search by faculty name or department/i)
    ).toBeVisible();
  });

  test("browser back button returns to campus directory", async ({ page }) => {
    // Navigate to campus directory first, then to a faculty detail
    await page.goto("/vit-v");
    await expect(page.getByText(/loading faculty members/i)).not.toBeVisible({
      timeout: 15_000,
    });

    await page.getByText("Dr. Alice Sharma").click();
    await page.waitForURL("**/vit-v/fac-e2e-001**");
    await expect(
      page.getByRole("heading", { name: "Dr. Alice Sharma" })
    ).toBeVisible();

    // Go back
    await page.goBack();
    await page.waitForURL("**/vit-v**");
    await expect(
      page.getByPlaceholder(/search by faculty name or department/i)
    ).toBeVisible();
  });
});
