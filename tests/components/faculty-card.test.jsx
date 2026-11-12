import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FacultyCard from "@/components/FacultyCard";

describe("FacultyCard Component", () => {
  const sampleFaculty = {
    id: "fac-99",
    name: "Dr. Suresh V",
    designation: "Professor Higher Academic Grade",
    department: "School of Mechanical Engineering",
    avgRating: 4.35,
    avgAttendance: 4.5,
    avgCorrection: 4.2,
    avgTeaching: 4.6,
    avgApproachability: 4.1,
    reviewCount: 42,
    photo: "https://example.com/suresh.jpg",
  };

  it("renders faculty name, designation, department, and photo", () => {
    render(
      <FacultyCard
        faculty={sampleFaculty}
        campusSlug="vit-v"
        currentPage={1}
        query=""
      />
    );

    expect(screen.getByRole("heading", { level: 2, name: "Dr. Suresh V" })).toBeInTheDocument();
    expect(screen.getByText("Professor Higher Academic Grade")).toBeInTheDocument();
    expect(screen.getByText("School of Mechanical Engineering")).toBeInTheDocument();

    const img = screen.getByAltText("Dr. Suresh V");
    expect(img).toHaveAttribute("src", sampleFaculty.photo);
  });

  it("renders all metric stats and total review count", () => {
    render(
      <FacultyCard
        faculty={sampleFaculty}
        campusSlug="vit-v"
        currentPage={1}
        query=""
      />
    );

    expect(screen.getByText("Attendance")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();

    expect(screen.getByText("Correction")).toBeInTheDocument();
    expect(screen.getByText("4.2")).toBeInTheDocument();

    expect(screen.getByText("Teaching")).toBeInTheDocument();
    expect(screen.getByText("4.6")).toBeInTheDocument();

    expect(screen.getByText("Approachability")).toBeInTheDocument();
    expect(screen.getByText("4.1")).toBeInTheDocument();

    expect(screen.getByText("4.3")).toBeInTheDocument(); // avgRating 4.35 formatted via toFixed(1)
    expect(screen.getByText("42")).toBeInTheDocument();  // review count
  });

  it("constructs link href preserving current page and search query", () => {
    render(
      <FacultyCard
        faculty={sampleFaculty}
        campusSlug="vit-v"
        currentPage={3}
        query="mechanical"
      />
    );

    const cardLink = screen.getByRole("link");
    expect(cardLink).toHaveAttribute("href", "/vit-v/fac-99?page=3&q=mechanical");
  });
});
