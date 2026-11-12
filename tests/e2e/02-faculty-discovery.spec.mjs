// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Journey 2: Faculty Discovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/vit-v");
    // Wait for faculty list to load (cards should appear)
    await expect(
      page.getByText(/loading faculty members/i)
    ).not.toBeVisible({ timeout: 15_000 });
  });

  test("displays faculty cards on the campus directory page", async ({
    page,
  }) => {
    // At least one faculty card should be present
    // Faculty names seeded: Dr. Alice Sharma, Prof. Rajesh Kumar, Dr. Meena Patel
    await expect(page.getByText("Dr. Alice Sharma")).toBeVisible();
    await expect(page.getByText("Prof. Rajesh Kumar")).toBeVisible();
    await expect(page.getByText("Dr. Meena Patel")).toBeVisible();
  });

  test("search filters faculty results and shows relevant matches", async ({
    page,
  }) => {
    const searchInput = page.getByPlaceholder(
      /search by faculty name or department/i
    );

    // Type search query
    await searchInput.fill("Alice");

    // Press Enter to commit search
    await searchInput.press("Enter");
    await page.waitForURL(/q=Alice/);

    // Should show Alice
    await expect(page.getByText("Dr. Alice Sharma")).toBeVisible();

    // Others should NOT be visible
    await expect(page.getByText("Prof. Rajesh Kumar")).not.toBeVisible();
  });

  test("search with no results shows empty state", async ({ page }) => {
    const searchInput = page.getByPlaceholder(
      /search by faculty name or department/i
    );

    await searchInput.fill("NonexistentFacultyXYZ");
    await searchInput.press("Enter");

    await expect(
      page.getByText(/no faculty members found/i)
    ).toBeVisible();
  });

  test("clearing search restores the full faculty list", async ({ page }) => {
    const searchInput = page.getByPlaceholder(
      /search by faculty name or department/i
    );

    // Search and filter
    await searchInput.fill("Alice");
    await searchInput.press("Enter");
    await page.waitForURL(/q=Alice/);
    await expect(page.getByText("Dr. Alice Sharma")).toBeVisible();

    // Click clear button
    await page.getByRole("button", { name: /clear search/i }).click();

    // All faculty should be visible again
    await expect(page.getByText("Dr. Alice Sharma")).toBeVisible();
    await expect(page.getByText("Prof. Rajesh Kumar")).toBeVisible();
    await expect(page.getByText("Dr. Meena Patel")).toBeVisible();
  });

  test("clicking a faculty card navigates to the faculty detail page", async ({
    page,
  }) => {
    // Click on Alice Sharma's card (it's a link)
    await page.getByText("Dr. Alice Sharma").click();

    // Should navigate to faculty detail
    await page.waitForURL("**/vit-v/fac-e2e-001**");

    // Faculty detail should load
    await expect(
      page.getByRole("heading", { name: "Dr. Alice Sharma" })
    ).toBeVisible();
  });
});
