import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReviewForm from "@/components/ReviewForm";
import * as AuthContextModule from "@/context/auth-context";
import { ReviewsService } from "@/services/reviews/reviews.service";

// Mock ReviewsService
vi.mock("@/services/reviews/reviews.service", () => ({
  MIN_COMMENT_LENGTH: 10,
  ReviewsService: {
    submitReview: vi.fn(),
  },
}));

describe("ReviewForm Component", () => {
  const defaultUser = {
    uid: "student-123",
    email: "student@vitstudent.ac.in",
  };
  const campusSlug = "vellore";
  const facultyId = "faculty-456";

  const selectRating = async (user, metricLabel, starCount) => {
    const labelEl = screen.getByText(metricLabel);
    const rowEl = labelEl.closest("div.flex.items-center.justify-between");
    const starBtn = within(rowEl).getByRole("button", { name: `${starCount} star` });
    await user.click(starBtn);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: defaultUser,
      userCampus: "vellore",
    });
  });

  describe("Initial rendering and controls", () => {
    it("renders experience comment textarea, all 4 metric rows, and disabled submit button initially", () => {
      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={vi.fn()}
        />
      );

      // Comment textarea
      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue("");

      // Metric labels
      expect(screen.getByText("Attendance")).toBeInTheDocument();
      expect(screen.getByText("Correction")).toBeInTheDocument();
      expect(screen.getByText("Teaching")).toBeInTheDocument();
      expect(screen.getByText("Approachability")).toBeInTheDocument();

      // Submit button initially disabled
      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      expect(submitBtn).toBeInTheDocument();
      expect(submitBtn).toBeDisabled();
    });
  });

  describe("Validation behaviour", () => {
    it("keeps submit button disabled when user is unauthenticated", () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: null,
        userCampus: null,
      });

      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={vi.fn()}
        />
      );

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      expect(submitBtn).toBeDisabled();
    });

    it("keeps submit button disabled when user belongs to a different campus", () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: defaultUser,
        userCampus: "chennai", // faculty is vellore
      });

      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={vi.fn()}
        />
      );

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      expect(submitBtn).toBeDisabled();
    });

    it("keeps submit button disabled when comment is shorter than 10 characters", async () => {
      const user = userEvent.setup();
      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={vi.fn()}
        />
      );

      // Select all 4 ratings
      await selectRating(user, "Attendance", 5);
      await selectRating(user, "Correction", 4);
      await selectRating(user, "Teaching", 5);
      await selectRating(user, "Approachability", 4);

      // Type only 9 characters (less than MIN_COMMENT_LENGTH = 10)
      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);
      await user.type(textarea, "Short 123");

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      expect(submitBtn).toBeDisabled();
    });

    it("keeps submit button disabled when only some metrics are rated", async () => {
      const user = userEvent.setup();
      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);
      await user.type(textarea, "Excellent professor with clear explanations.");

      // Rate only 3 out of 4 metrics
      await selectRating(user, "Attendance", 5);
      await selectRating(user, "Correction", 4);
      await selectRating(user, "Teaching", 5);
      // Approachability remains 0

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      expect(submitBtn).toBeDisabled();
    });

    it("enables submit button when all 4 metrics are rated and comment >= 10 characters", async () => {
      const user = userEvent.setup();
      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);
      await user.type(textarea, "Great lectures and very helpful during office hours.");

      await selectRating(user, "Attendance", 5);
      await selectRating(user, "Correction", 4);
      await selectRating(user, "Teaching", 5);
      await selectRating(user, "Approachability", 4);

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      expect(submitBtn).toBeEnabled();
    });
  });

  describe("Form submission flow", () => {
    it("submits valid review with correct payload and invokes callback on success", async () => {
      const user = userEvent.setup();
      const onReviewSubmitted = vi.fn();
      const mockResult = {
        success: true,
        overall: 4.5,
        updatedStats: { avgRating: 4.5, reviewCount: 1 },
      };
      ReviewsService.submitReview.mockResolvedValueOnce(mockResult);

      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={onReviewSubmitted}
        />
      );

      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);
      const commentText = "Dr. Smith gives very engaging practical lectures.";
      await user.type(textarea, commentText);

      await selectRating(user, "Attendance", 4);
      await selectRating(user, "Correction", 5);
      await selectRating(user, "Teaching", 4);
      await selectRating(user, "Approachability", 5);

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      await user.click(submitBtn);

      expect(ReviewsService.submitReview).toHaveBeenCalledTimes(1);
      expect(ReviewsService.submitReview).toHaveBeenCalledWith({
        campusSlug: "vellore",
        facultyId: "faculty-456",
        user: defaultUser,
        userCampus: "vellore",
        ratings: {
          attendance: 4,
          correction: 5,
          teaching: 4,
          approachability: 5,
        },
        comment: commentText,
      });

      // Verify callback was invoked with submission result
      expect(onReviewSubmitted).toHaveBeenCalledWith(mockResult);

      // Verify form fields reset after successful submission
      expect(textarea).toHaveValue("");
      // After reset, submit button should become disabled again
      expect(screen.getByRole("button", { name: /submit review/i })).toBeDisabled();
    });

    it("displays loading state and disables button during in-flight submission", async () => {
      const user = userEvent.setup();
      let resolveSubmission;
      ReviewsService.submitReview.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubmission = resolve;
          })
      );

      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);
      await user.type(textarea, "Superb teaching methodology throughout semester.");

      await selectRating(user, "Attendance", 5);
      await selectRating(user, "Correction", 5);
      await selectRating(user, "Teaching", 5);
      await selectRating(user, "Approachability", 5);

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      await user.click(submitBtn);

      // In-flight state: text changes to "Submitting..." and button is disabled
      expect(screen.getByRole("button", { name: /submitting\.\.\./i })).toBeDisabled();

      // Resolve the pending promise
      resolveSubmission({ success: true, overall: 5 });
      await screen.findByRole("button", { name: /submit review/i });
    });

    it("renders error message and keeps input intact when submission rejects", async () => {
      const user = userEvent.setup();
      const onReviewSubmitted = vi.fn();
      vi.spyOn(console, "error").mockImplementation(() => {});
      ReviewsService.submitReview.mockRejectedValueOnce(
        new Error("You have already reviewed this faculty member.")
      );

      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={onReviewSubmitted}
        />
      );

      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);
      const commentText = "Clear doubt solving sessions every week.";
      await user.type(textarea, commentText);

      await selectRating(user, "Attendance", 5);
      await selectRating(user, "Correction", 4);
      await selectRating(user, "Teaching", 4);
      await selectRating(user, "Approachability", 5);

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      await user.click(submitBtn);

      // Error message should appear in document
      const errorMsg = await screen.findByText("You have already reviewed this faculty member.");
      expect(errorMsg).toBeInTheDocument();

      // Comment should NOT be cleared on failure
      expect(textarea).toHaveValue(commentText);

      // onReviewSubmitted should not have been called
      expect(onReviewSubmitted).not.toHaveBeenCalled();
    });

    it("falls back to generic error message when error object has no message", async () => {
      const user = userEvent.setup();
      vi.spyOn(console, "error").mockImplementation(() => {});
      ReviewsService.submitReview.mockRejectedValueOnce({});

      render(
        <ReviewForm
          campusSlug={campusSlug}
          facultyId={facultyId}
          onReviewSubmitted={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText(/minimum 10 characters/i);
      await user.type(textarea, "Insightful lectures and project guidance.");

      await selectRating(user, "Attendance", 4);
      await selectRating(user, "Correction", 4);
      await selectRating(user, "Teaching", 4);
      await selectRating(user, "Approachability", 4);

      const submitBtn = screen.getByRole("button", { name: /submit review/i });
      await user.click(submitBtn);

      const errorMsg = await screen.findByText("Failed to submit review. Try again.");
      expect(errorMsg).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to submit review. Try again.");
    });
  });

  describe("Accessibility semantics", () => {
    it("labels the textarea and groups each rating control under its metric name", () => {
      render(<ReviewForm campusSlug={campusSlug} facultyId={facultyId} onReviewSubmitted={vi.fn()} />);

      expect(screen.getByLabelText("Your Experience").tagName).toBe("TEXTAREA");
      for (const name of ["Attendance", "Correction", "Teaching", "Approachability"]) {
        const group = screen.getByRole("group", { name });
        expect(within(group).getAllByRole("button")).toHaveLength(5);
      }
    });
  });
});
