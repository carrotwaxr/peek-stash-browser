import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DetailCard from "@/components/detail/DetailCard";

describe("DetailCard", () => {
  it("holds its title and content in one card", () => {
    render(
      <DetailCard title="Parent Tags">
        <p>a chip</p>
      </DetailCard>
    );

    const heading = screen.getByRole("heading", { name: "Parent Tags" });
    expect(
      within(heading.parentElement as HTMLElement).getByText("a chip")
    ).toBeVisible();
  });

  it("has no heading without a title", () => {
    render(
      <DetailCard>
        <p>content</p>
      </DetailCard>
    );

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("content")).toBeVisible();
  });
});
