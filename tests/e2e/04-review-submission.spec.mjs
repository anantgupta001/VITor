// @ts-check
import { test, expect } from "@playwright/test";
import { signInAsTestUser, getReviewsSection } from "./helpers.mjs";

test.describe("Journey 4: Review Submission (Authenticated)", () => {
  test("unauthenticated user sees sign-in prompt instead of review form", async ({
    page,
  }) => {
    await page.goto("/vit-v/fac-e2e-001");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    // Should see sign-in prompt
    await expect(page.getByText("Sign in to submit a review.")).toBeVisible();
  });

  test("authenticated user can submit a review and see it appear", async ({
    page,
  }) => {
    await page.goto("/vit-v/fac-e2e-001");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    // Sign in as test user
    await signInAsTestUser(page);

    // Should see the review form (the "Your Experience" label)
    await expect(page.getByText("Your Experience")).toBeVisible({
      timeout: 10_000,
    });

    // Fill in the comment
    const textarea = page.getByPlaceholder(/share your honest experience/i);
    await textarea.fill(
      "This professor is outstanding. Clear explanations and very helpful during office hours."
    );

    // Rate all 4 metrics (click 4 stars for each)
    const starButtons = page.getByRole("button", { name: "4 star" });
    const starCount = await starButtons.count();
    for (let i = 0; i < starCount; i++) {
      await starButtons.nth(i).click();
    }

    // Submit button should be enabled now
    const submitBtn = page.getByRole("button", { name: /submit review/i });
    await expect(submitBtn).toBeEnabled();

    // Submit
    await submitBtn.click();

    // Wait for submission to complete
    await expect(submitBtn).toHaveText(/submit review/i, { timeout: 15_000 });

    // Form reset is verified independently of the list: empty textarea, disabled button
    await expect(page.getByPlaceholder(/share your honest experience/i)).toHaveValue("", {
      timeout: 10_000,
    });
    await expect(submitBtn).toBeDisabled();

    // The review must be rendered inside the reviews list, not left in the form
    await expect(
      getReviewsSection(page).getByText(
        "This professor is outstanding. Clear explanations and very helpful during office hours.",
        { exact: true }
      )
    ).toBeVisible({ timeout: 10_000 });
  });

  test("submit button is disabled when form is incomplete", async ({
    page,
  }) => {
    await page.goto("/vit-v/fac-e2e-002");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    await signInAsTestUser(page);

    await expect(page.getByText("Your Experience")).toBeVisible({
      timeout: 10_000,
    });

    const submitBtn = page.getByRole("button", { name: /submit review/i });

    // Initially disabled (no ratings, no comment)
    await expect(submitBtn).toBeDisabled();

    // Add a short comment (below minimum 10 chars)
    const textarea = page.getByPlaceholder(/share your honest experience/i);
    await textarea.fill("Short");
    await expect(submitBtn).toBeDisabled();

    // Add valid comment but still no ratings
    await textarea.fill("This is a valid comment with enough characters.");
    await expect(submitBtn).toBeDisabled();

    // Rate only 2 out of 4 metrics
    const star3Buttons = page.getByRole("button", { name: "3 star" });
    await star3Buttons.nth(0).click();
    await star3Buttons.nth(1).click();
    await expect(submitBtn).toBeDisabled();

    // Rate remaining 2 metrics — should now be enabled
    await star3Buttons.nth(2).click();
    await star3Buttons.nth(3).click();
    await expect(submitBtn).toBeEnabled();
  });

  test("duplicate submission by same user updates their existing review", async ({
    page,
  }) => {
    await page.goto("/vit-v/fac-e2e-003");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    await signInAsTestUser(page);

    await expect(page.getByText("Your Experience")).toBeVisible({
      timeout: 10_000,
    });

    const textarea = page.getByPlaceholder(/share your honest experience/i);
    const submitBtn = page.getByRole("button", { name: /submit review/i });

    // 1. Submit initial review
    await textarea.fill("Initial review comment for Meena Patel.");

    const star5Buttons = page.getByRole("button", { name: "5 star" });
    for (let i = 0; i < 4; i++) {
      await star5Buttons.nth(i).click();
    }

    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Initial review is rendered inside the reviews list
    const reviewsSection = getReviewsSection(page);
    await expect(
      reviewsSection.getByText("Initial review comment for Meena Patel.", { exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // Form reset is verified independently: empty textarea and disabled button
    await expect(textarea).toHaveValue("", { timeout: 5_000 });
    await expect(submitBtn).toBeDisabled({ timeout: 5_000 });

    // 2. Submit second review for same faculty (updates existing review)
    await textarea.fill("Updated review comment: Absolutely phenomenal teaching throughout!");
    const star4Buttons = page.getByRole("button", { name: "4 star" });
    for (let i = 0; i < 4; i++) {
      await star4Buttons.nth(i).click();
    }

    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // The updated comment replaces the previous one in the reviews list
    await expect(
      reviewsSection.getByText(
        "Updated review comment: Absolutely phenomenal teaching throughout!",
        { exact: true }
      )
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      reviewsSection.getByText("Initial review comment for Meena Patel.", { exact: true })
    ).toHaveCount(0);

    // Form reset again after the update
    await expect(textarea).toHaveValue("", { timeout: 5_000 });
    await expect(submitBtn).toBeDisabled({ timeout: 5_000 });
  });
});
