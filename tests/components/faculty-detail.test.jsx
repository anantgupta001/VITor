import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FacultyDetail from "@/components/FacultyDetail";
import * as AuthContextModule from "@/context/auth-context";
import { FacultyRepository } from "@/repositories/faculty.repository";
import { ReviewsRepository } from "@/repositories/reviews.repository";
import * as NavigationModule from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
}));

// Mock repositories
vi.mock("@/repositories/faculty.repository", () => ({
  FacultyRepository: {
    getFacultyById: vi.fn(),
  },
}));

vi.mock("@/repositories/reviews.repository", () => ({
  ReviewsRepository: {
    getPublicReviews: vi.fn(),
  },
}));

// Mock ReviewForm so we can test FacultyDetail's callback contract in isolation
vi.mock("@/components/ReviewForm", () => ({
  default: ({ onReviewSubmitted, campusSlug, facultyId }) => (
    <div data-testid="mock-review-form">
      <span>ReviewForm for {campusSlug}/{facultyId}</span>
      <button
        onClick={() =>
          onReviewSubmitted({
            updatedStats: {
              avgAttendance: 4.8,
              avgCorrection: 4.5,
              avgTeaching: 4.9,
              avgApproachability: 4.7,
              avgRating: 4.73,
              reviewCount: 3,
            },
            reviews: [
              {
                id: "rev-new",
                text: "Newly submitted student review.",
                overall: 4.75,
                attendance: 5,
                correction: 4,
                teaching: 5,
                approachability: 5,
              },
              {
                id: "rev-1",
                text: "First review from earlier.",
                overall: 4.5,
                attendance: 4,
                correction: 5,
                teaching: 4,
                approachability: 5,
              },
            ],
          })
        }
      >
        Trigger Submit Callback
      </button>
    </div>
  ),
}));

describe("FacultyDetail Component", () => {
  const sampleFaculty = {
    id: "fac-101",
    name: "Dr. Arvind Kumar",
    designation: "Associate Professor Senior",
    department: "School of Computer Science and Engineering",
    avgAttendance: 4.25,
    avgCorrection: 3.8,
    avgTeaching: 4.5,
    avgApproachability: 4.0,
    avgRating: 4.14,
    reviewCount: 2,
    photo: "https://example.com/arvind.jpg",
  };

  const sampleReviews = [
    {
      id: "rev-1",
      text: "Comprehensive notes and interactive laboratory sessions.",
      overall: 4.25,
      attendance: 4,
      correction: 4,
      teaching: 5,
      approachability: 4,
    },
    {
      id: "rev-2",
      text: "Fair evaluation and supportive guidance during final capstone.",
      overall: 4.0,
      attendance: 4,
      correction: 4,
      teaching: 4,
      approachability: 4,
    },
  ];

  const mockSetUserCampus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    NavigationModule.useParams.mockReturnValue({
      campus: "vit-v",
      id: "fac-101",
    });

    NavigationModule.useSearchParams.mockReturnValue({
      get: (key) => (key === "page" ? "1" : key === "q" ? "arvind" : null),
    });

    FacultyRepository.getFacultyById.mockResolvedValue(sampleFaculty);
    ReviewsRepository.getPublicReviews.mockResolvedValue(sampleReviews);

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: { uid: "user-1", email: "student@vitstudent.ac.in" },
      userCampus: "vit-v",
      setUserCampus: mockSetUserCampus,
    });
  });

  describe("Loading and Error states", () => {
    it("renders loading state while faculty data is fetching", () => {
      FacultyRepository.getFacultyById.mockReturnValueOnce(new Promise(() => {}));
      ReviewsRepository.getPublicReviews.mockReturnValueOnce(new Promise(() => {}));

      render(<FacultyDetail />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    });

    it("renders 'Campus not found.' when campus slug is invalid", async () => {
      NavigationModule.useParams.mockReturnValue({
        campus: "invalid-campus",
        id: "fac-101",
      });

      render(<FacultyDetail />);
      expect(await screen.findByText("Campus not found.")).toBeInTheDocument();
    });

    it("renders 'Faculty not found' when faculty document does not exist", async () => {
      FacultyRepository.getFacultyById.mockResolvedValueOnce(null);
      ReviewsRepository.getPublicReviews.mockResolvedValueOnce([]);

      render(<FacultyDetail />);
      expect(await screen.findByText("Faculty not found")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Faculty not found");
    });
  });

  describe("Faculty details and stats rendering", () => {
    it("renders faculty bio, title, department, and photo", async () => {
      render(<FacultyDetail />);

      expect(await screen.findByRole("heading", { level: 1, name: "Dr. Arvind Kumar" })).toBeInTheDocument();
      expect(screen.getByText("Associate Professor Senior")).toBeInTheDocument();
      expect(screen.getByText("School of Computer Science and Engineering")).toBeInTheDocument();

      const img = screen.getByAltText("Dr. Arvind Kumar");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", sampleFaculty.photo);
    });

    it("renders all 6 aggregate statistics boxes accurately", async () => {
      render(<FacultyDetail />);

      await screen.findByRole("heading", { level: 1, name: "Dr. Arvind Kumar" });

      // Stat titles
      expect(screen.getByText("Attendance")).toBeInTheDocument();
      expect(screen.getByText("Correction")).toBeInTheDocument();
      expect(screen.getByText("Teaching")).toBeInTheDocument();
      expect(screen.getByText("Approachability")).toBeInTheDocument();
      expect(screen.getByText("Overall Rating")).toBeInTheDocument();
      expect(screen.getByText("Total Reviews")).toBeInTheDocument();

      // Values checked within their respective stat cards
      const attendanceBox = screen.getByText("Attendance").parentElement;
      expect(within(attendanceBox).getByText(/4\.25/)).toBeInTheDocument();

      const correctionBox = screen.getByText("Correction").parentElement;
      expect(within(correctionBox).getByText(/3\.80/)).toBeInTheDocument();

      const teachingBox = screen.getByText("Teaching").parentElement;
      expect(within(teachingBox).getByText(/4\.50/)).toBeInTheDocument();

      const approachabilityBox = screen.getByText("Approachability").parentElement;
      expect(within(approachabilityBox).getByText(/4\.00/)).toBeInTheDocument();

      const overallBox = screen.getByText("Overall Rating").parentElement;
      expect(within(overallBox).getByText(/4\.14/)).toBeInTheDocument();

      const totalReviewsBox = screen.getByText("Total Reviews").parentElement;
      expect(within(totalReviewsBox).getByText("2")).toBeInTheDocument();
    });

    it("preserves query parameters in Back link href", async () => {
      render(<FacultyDetail />);

      const backLink = await screen.findByRole("link", { name: /back/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute("href", "/vit-v?page=1&q=arvind");
    });
  });

  describe("Review list rendering and pagination", () => {
    it("renders existing reviews with anonymous author and scores", async () => {
      render(<FacultyDetail />);

      expect(await screen.findByText(sampleReviews[0].text)).toBeInTheDocument();
      expect(screen.getByText(sampleReviews[1].text)).toBeInTheDocument();
      expect(screen.getAllByText("Anonymous")).toHaveLength(2);
    });

    it("displays 'No reviews yet.' when reviews array is empty", async () => {
      ReviewsRepository.getPublicReviews.mockResolvedValueOnce([]);

      render(<FacultyDetail />);

      expect(await screen.findByText("No reviews yet.")).toBeInTheDocument();
    });

    it("shows 'Show more' button when review count exceeds initial limit and reveals more on click", async () => {
      const user = userEvent.setup();
      const fourReviews = [
        { id: "r1", text: "Review 1 text", overall: 4, attendance: 4, correction: 4, teaching: 4, approachability: 4 },
        { id: "r2", text: "Review 2 text", overall: 4, attendance: 4, correction: 4, teaching: 4, approachability: 4 },
        { id: "r3", text: "Review 3 text", overall: 4, attendance: 4, correction: 4, teaching: 4, approachability: 4 },
        { id: "r4", text: "Review 4 text", overall: 5, attendance: 5, correction: 5, teaching: 5, approachability: 5 },
      ];

      ReviewsRepository.getPublicReviews.mockResolvedValueOnce(fourReviews);

      render(<FacultyDetail />);

      // Initially shows top 3
      expect(await screen.findByText("Review 1 text")).toBeInTheDocument();
      expect(screen.getByText("Review 2 text")).toBeInTheDocument();
      expect(screen.getByText("Review 3 text")).toBeInTheDocument();
      expect(screen.queryByText("Review 4 text")).not.toBeInTheDocument();

      // Show more button displays remaining count (1 left)
      const showMoreBtn = screen.getByRole("button", { name: /show more/i });
      expect(showMoreBtn).toHaveTextContent("(1 left)");

      // Click to reveal next batch
      await user.click(showMoreBtn);

      expect(screen.getByText("Review 4 text")).toBeInTheDocument();
      // Show more button disappears once all reviews are visible
      expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
    });

    it("fetches the next page using cursor when 'Show more' is clicked and appends results", async () => {
      const user = userEvent.setup();
      const page1Reviews = [
        { id: "r1", text: "Page 1 - Review 1", overall: 4, attendance: 4, correction: 4, teaching: 4, approachability: 4 },
        { id: "r2", text: "Page 1 - Review 2", overall: 4, attendance: 4, correction: 4, teaching: 4, approachability: 4 },
        { id: "r3", text: "Page 1 - Review 3", overall: 4, attendance: 4, correction: 4, teaching: 4, approachability: 4 },
      ];
      const page2Reviews = [
        { id: "r4", text: "Page 2 - Review 4", overall: 5, attendance: 5, correction: 5, teaching: 5, approachability: 5 },
      ];

      ReviewsRepository.getPublicReviews
        .mockResolvedValueOnce({
          reviews: page1Reviews,
          nextCursor: "token-cursor-page-2",
          hasMore: true,
        })
        .mockResolvedValueOnce({
          reviews: page2Reviews,
          nextCursor: null,
          hasMore: false,
        });

      render(<FacultyDetail />);

      expect(await screen.findByText("Page 1 - Review 1")).toBeInTheDocument();
      expect(screen.getByText("Page 1 - Review 2")).toBeInTheDocument();
      expect(screen.getByText("Page 1 - Review 3")).toBeInTheDocument();
      expect(screen.queryByText("Page 2 - Review 4")).not.toBeInTheDocument();

      const showMoreBtn = screen.getByRole("button", { name: /show more/i });
      expect(showMoreBtn).toBeInTheDocument();

      await user.click(showMoreBtn);

      expect(ReviewsRepository.getPublicReviews).toHaveBeenCalledWith("vit-v", "fac-101", {
        cursor: "token-cursor-page-2",
        limit: 3,
      });

      // Both page 1 and page 2 reviews should now be visible (appended)
      expect(await screen.findByText("Page 2 - Review 4")).toBeInTheDocument();
      expect(screen.getByText("Page 1 - Review 1")).toBeInTheDocument();
      expect(screen.getByText("Page 1 - Review 2")).toBeInTheDocument();
      expect(screen.getByText("Page 1 - Review 3")).toBeInTheDocument();

      // Show more button disappears when hasMore is false
      expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
    });

    it("displays error message when loadMoreReviews fails", async () => {
      const user = userEvent.setup();
      ReviewsRepository.getPublicReviews
        .mockResolvedValueOnce({
          reviews: [
            { id: "r1", text: "Initial Review", overall: 4, attendance: 4, correction: 4, teaching: 4, approachability: 4 },
          ],
          nextCursor: "err-cursor",
          hasMore: true,
        })
        .mockRejectedValueOnce(new Error("Network failed"));

      render(<FacultyDetail />);

      expect(await screen.findByText("Initial Review")).toBeInTheDocument();
      const showMoreBtn = screen.getByRole("button", { name: /show more/i });
      await user.click(showMoreBtn);

      expect(await screen.findByRole("alert")).toHaveTextContent(/failed to load more reviews/i);
      expect(screen.getByText("Initial Review")).toBeInTheDocument();
    });
  });

  describe("Authentication-dependent review section", () => {
    it("displays sign-in prompt when user is not authenticated", async () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: null,
        userCampus: null,
        setUserCampus: mockSetUserCampus,
      });

      render(<FacultyDetail />);

      expect(
        await screen.findByText(/Please sign in using your official college ID to submit a review\./i)
      ).toBeInTheDocument();
      expect(screen.getByText("Sign in to submit a review.")).toBeInTheDocument();
      expect(screen.queryByTestId("mock-review-form")).not.toBeInTheDocument();
    });

    it("displays campus selection buttons when user has dual-campus email and unselected campus preference", async () => {
      const user = userEvent.setup();
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: { uid: "dual-user", email: "student@vitstudent.ac.in" },
        userCampus: null, // unassigned dual campus
        setUserCampus: mockSetUserCampus,
      });

      render(<FacultyDetail />);

      expect(
        await screen.findByText(/Your email is used for both Vellore and Chennai\. Select your campus to rate faculty:/i)
      ).toBeInTheDocument();

      const velloreBtn = screen.getByRole("button", { name: "Vellore Campus" });
      const chennaiBtn = screen.getByRole("button", { name: "Chennai Campus" });
      expect(velloreBtn).toBeInTheDocument();
      expect(chennaiBtn).toBeInTheDocument();

      await user.click(velloreBtn);
      expect(mockSetUserCampus).toHaveBeenCalledWith("vit-v");
    });

    it("displays cross-campus restriction message when user belongs to a different campus", async () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: { uid: "chennai-user", email: "student@vitstudent.ac.in" },
        userCampus: "vit-c", // user is vit-c (Chennai), faculty is vit-v (Vellore)
        setUserCampus: mockSetUserCampus,
      });

      render(<FacultyDetail />);

      expect(
        await screen.findByText(/You can only rate faculty from your own campus \(Chennai Campus\)\. This page is for another campus\./i)
      ).toBeInTheDocument();
      expect(screen.queryByTestId("mock-review-form")).not.toBeInTheDocument();
    });

    it("renders ReviewForm when user belongs to the matching campus", async () => {
      render(<FacultyDetail />);

      expect(await screen.findByTestId("mock-review-form")).toBeInTheDocument();
      expect(screen.getByText("ReviewForm for vit-v/fac-101")).toBeInTheDocument();
    });
  });

  describe("Review submission callback integration", () => {
    it("updates faculty statistics and displays fresh reviews when review is submitted", async () => {
      const user = userEvent.setup();

      render(<FacultyDetail />);

      expect(await screen.findByTestId("mock-review-form")).toBeInTheDocument();

      // Prior stats
      expect(screen.getByText(/4\.14/)).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();

      // Trigger submission callback
      const submitBtn = screen.getByRole("button", { name: /trigger submit callback/i });
      await user.click(submitBtn);

      // Verify updated stats appear
      expect(await screen.findByText(/4\.73/)).toBeInTheDocument(); // new avgRating
      expect(screen.getByText("3")).toBeInTheDocument();           // new reviewCount

      // Verify new review text appears
      expect(screen.getByText("Newly submitted student review.")).toBeInTheDocument();
    });
  });
});
