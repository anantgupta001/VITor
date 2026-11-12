import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CampusSelector from "@/components/CampusSelector";

describe("CampusSelector Component", () => {
  it("renders page header and subtitle", () => {
    render(<CampusSelector />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Choose your campus" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select your VIT campus to view and rate faculty")
    ).toBeInTheDocument();
  });

  it("renders navigation links to all four VIT campuses", () => {
    render(<CampusSelector />);

    const apLink = screen.getByRole("link", { name: /ap campus/i });
    expect(apLink).toHaveAttribute("href", "/vit-ap");

    const velloreLink = screen.getByRole("link", { name: /vellore campus/i });
    expect(velloreLink).toHaveAttribute("href", "/vit-v");

    const chennaiLink = screen.getByRole("link", { name: /chennai campus/i });
    expect(chennaiLink).toHaveAttribute("href", "/vit-c");

    const bhopalLink = screen.getByRole("link", { name: /bhopal campus/i });
    expect(bhopalLink).toHaveAttribute("href", "/vit-b");
  });
});
