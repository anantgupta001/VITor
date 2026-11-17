import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CampusHome from "@/components/CampusHome";
import { FacultyRepository } from "@/repositories/faculty.repository";
import * as NavigationModule from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
}));

// Mock FacultyRepository
vi.mock("@/repositories/faculty.repository", () => ({
  FacultyRepository: {
    getFaculties: vi.fn(),
  },
}));

describe("CampusHome Component", () => {
  const mockRouter = {
    push: vi.fn(),
  };

  const sampleFaculties = [
    {
      id: "fac-1",
      name: "Dr. Ananya Sharma",
      department: "Computer Science and Engineering",
      designation: "Professor",
      avgRating: 4.8,
      avgAttendance: 4.9,
      avgCorrection: 4.5,
      avgTeaching: 4.9,
      avgApproachability: 4.8,
      reviewCount: 15,
    },
    {
      id: "fac-2",
      name: "Dr. Rajesh Iyer",
      department: "Mechanical Engineering",
      designation: "Associate Professor",
      avgRating: 4.1,
      avgAttendance: 4.0,
      avgCorrection: 3.9,
      avgTeaching: 4.2,
      avgApproachability: 4.1,
      reviewCount: 8,
    },
    {
      id: "fac-3",
      name: "Dr. Priya Nair",
      department: "Computer Science and Engineering",
      designation: "Assistant Professor",
      avgRating: 4.6,
      avgAttendance: 4.5,
      avgCorrection: 4.3,
      avgTeaching: 4.8,
      avgApproachability: 4.7,
      reviewCount: 12,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    NavigationModule.useParams.mockReturnValue({ campus: "vit-v" });
    NavigationModule.useSearchParams.mockReturnValue({
      get: (key) => (key === "page" ? "1" : key === "q" ? "" : null),
    });
    NavigationModule.useRouter.mockReturnValue(mockRouter);

    FacultyRepository.getFaculties.mockResolvedValue(sampleFaculties);
  });

  describe("Loading and Error states", () => {
    it("renders loading message while faculties are fetching", () => {
      FacultyRepository.getFaculties.mockReturnValueOnce(new Promise(() => {}));

      render(<CampusHome />);
      expect(screen.getByText("Loading faculty members...")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Loading faculty members...");
    });

    it("associates the search input with an accessible label", () => {
      FacultyRepository.getFaculties.mockReturnValueOnce(new Promise(() => {}));
      render(<CampusHome />);
      expect(screen.getByLabelText("Search by faculty name or department")).toBeInTheDocument();
    });

    it("renders error banner when FacultyRepository.getFaculties fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      FacultyRepository.getFaculties.mockRejectedValueOnce(new Error("Database connection timed out"));

      render(<CampusHome />);
      expect(await screen.findByText("Database connection timed out")).toBeInTheDocument();
      expect(screen.getByText("No faculty members found.")).toBeInTheDocument();
    });

    it("renders 'Campus not found.' with Choose campus button when campus slug is invalid", () => {
      NavigationModule.useParams.mockReturnValue({ campus: "invalid-campus" });

      render(<CampusHome />);
      expect(screen.getByText("Campus not found.")).toBeInTheDocument();

      const chooseBtn = screen.getByRole("button", { name: "Choose campus" });
      chooseBtn.click();
      expect(mockRouter.push).toHaveBeenCalledWith("/");
    });
  });

  describe("Faculty listing and cards", () => {
    it("renders faculty cards when faculty collection is loaded", async () => {
      render(<CampusHome />);

      expect(await screen.findByText("Dr. Ananya Sharma")).toBeInTheDocument();
      expect(screen.getByText("Dr. Rajesh Iyer")).toBeInTheDocument();
      expect(screen.getByText("Dr. Priya Nair")).toBeInTheDocument();

      // Card links point to faculty detail
      const cardLink = screen.getByRole("link", { name: /dr\. ananya sharma/i });
      expect(cardLink).toHaveAttribute("href", "/vit-v/fac-1?page=1");
    });

    it("renders 'No faculty members found.' when collection is empty", async () => {
      FacultyRepository.getFaculties.mockResolvedValueOnce([]);

      render(<CampusHome />);
      expect(await screen.findByText("No faculty members found.")).toBeInTheDocument();
    });
  });

  describe("Search interactions and suggestions", () => {
    it("updates draft query as user types in search input and displays clear button", async () => {
      const user = userEvent.setup();
      render(<CampusHome />);

      const searchInput = await screen.findByPlaceholderText("Search by faculty name or department...");
      expect(searchInput).toHaveValue("");

      await user.type(searchInput, "Ananya");
      expect(searchInput).toHaveValue("Ananya");

      const clearBtn = screen.getByRole("button", { name: "Clear search" });
      expect(clearBtn).toBeInTheDocument();
    });

    it("displays auto-complete suggestions popover and applies suggestion on click", async () => {
      const user = userEvent.setup();
      render(<CampusHome />);

      const searchInput = await screen.findByPlaceholderText("Search by faculty name or department...");
      await user.type(searchInput, "Anan");

      // Suggestion listbox appears
      const listbox = await screen.findByRole("listbox");
      expect(listbox).toBeInTheDocument();

      const suggestionOption = screen.getByRole("option", { name: "Dr. Ananya Sharma" });
      expect(suggestionOption).toBeInTheDocument();

      await user.click(suggestionOption);

      expect(mockRouter.push).toHaveBeenCalledWith("/vit-v?page=1&q=Dr.+Ananya+Sharma");
    });

    it("commits search query on Enter key press", async () => {
      const user = userEvent.setup();
      render(<CampusHome />);

      const searchInput = await screen.findByPlaceholderText("Search by faculty name or department...");
      await user.type(searchInput, "Mechanical{enter}");

      expect(mockRouter.push).toHaveBeenCalledWith("/vit-v?page=1&q=Mechanical");
    });

    it("commits search query on clicking Search button", async () => {
      const user = userEvent.setup();
      render(<CampusHome />);

      const searchInput = await screen.findByPlaceholderText("Search by faculty name or department...");
      await user.type(searchInput, "Rajesh");

      const searchBtn = screen.getByRole("button", { name: "Search" });
      await user.click(searchBtn);

      expect(mockRouter.push).toHaveBeenCalledWith("/vit-v?page=1&q=Rajesh");
    });

    it("clears search query and restores page URL on clicking Clear search button", async () => {
      const user = userEvent.setup();
      NavigationModule.useSearchParams.mockReturnValue({
        get: (key) => (key === "page" ? "1" : key === "q" ? "Ananya" : null),
      });

      render(<CampusHome />);

      const clearBtn = await screen.findByRole("button", { name: "Clear search" });
      await user.click(clearBtn);

      expect(mockRouter.push).toHaveBeenCalledWith("/vit-v");
    });

    it("filters faculty list by active query from URL (case-insensitive and department search)", async () => {
      NavigationModule.useSearchParams.mockReturnValue({
        get: (key) => (key === "page" ? "1" : key === "q" ? "computer science" : null),
      });

      render(<CampusHome />);

      // CS faculties match
      expect(await screen.findByText("Dr. Ananya Sharma")).toBeInTheDocument();
      expect(screen.getByText("Dr. Priya Nair")).toBeInTheDocument();

      // Mechanical faculty does not match
      expect(screen.queryByText("Dr. Rajesh Iyer")).not.toBeInTheDocument();
    });

    it("displays 'No faculty members found.' when search query matches nothing", async () => {
      NavigationModule.useSearchParams.mockReturnValue({
        get: (key) => (key === "page" ? "1" : key === "q" ? "Nonexistent Faculty Name" : null),
      });

      render(<CampusHome />);

      expect(await screen.findByText("No faculty members found.")).toBeInTheDocument();
    });
  });

  describe("Pagination behaviour", () => {
    it("renders pagination controls when total items exceed ITEMS_PER_PAGE (8) and navigates between pages", async () => {
      const user = userEvent.setup();
      // Generate 12 faculty items so there are 2 pages (8 on page 1, 4 on page 2)
      const twelveFaculties = Array.from({ length: 12 }, (_, i) => ({
        id: `fac-${i + 1}`,
        name: `Faculty Member ${i + 1}`,
        department: "School of Engineering",
        designation: "Professor",
        avgRating: 4.0,
        reviewCount: 5,
      }));

      FacultyRepository.getFaculties.mockResolvedValue(twelveFaculties);

      render(<CampusHome />);

      // Wait for load
      expect(await screen.findByText("Faculty Member 1")).toBeInTheDocument();
      expect(screen.getByText("Faculty Member 8")).toBeInTheDocument();
      // Item 9 should be on page 2
      expect(screen.queryByText("Faculty Member 9")).not.toBeInTheDocument();

      // Pagination indicators
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

      const prevBtn = screen.getByRole("button", { name: /← prev/i });
      const nextBtn = screen.getByRole("button", { name: /next →/i });

      // On page 1, Prev is disabled and Next is enabled
      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeEnabled();

      // Click Next
      await user.click(nextBtn);
      expect(mockRouter.push).toHaveBeenCalledWith("/vit-v?page=2");
    });

    it("disables Next button and enables Prev button on the final page", async () => {
      const twelveFaculties = Array.from({ length: 12 }, (_, i) => ({
        id: `fac-${i + 1}`,
        name: `Faculty Member ${i + 1}`,
        department: "School of Engineering",
        designation: "Professor",
        avgRating: 4.0,
        reviewCount: 5,
      }));

      NavigationModule.useSearchParams.mockReturnValue({
        get: (key) => (key === "page" ? "2" : key === "q" ? "" : null),
      });

      FacultyRepository.getFaculties.mockResolvedValue(twelveFaculties);

      render(<CampusHome />);

      expect(await screen.findByText("Faculty Member 9")).toBeInTheDocument();
      expect(screen.getByText("Faculty Member 12")).toBeInTheDocument();
      expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

      const prevBtn = screen.getByRole("button", { name: /← prev/i });
      const nextBtn = screen.getByRole("button", { name: /next →/i });

      expect(prevBtn).toBeEnabled();
      expect(nextBtn).toBeDisabled();
    });
  });
});
