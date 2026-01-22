import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClipCard from "../../../src/components/cards/ClipCard.jsx";
import { CardDisplaySettingsProvider } from "../../../src/contexts/CardDisplaySettingsContext.jsx";

// Mock the api module
vi.mock("../../../src/services/api.js", () => ({
  getClipPreviewUrl: (id) => `/api/proxy/clip/${id}/preview`,
}));

const mockClip = {
  id: "1",
  title: "Test Clip",
  seconds: 120,
  endSeconds: 180,
  sceneId: "scene-1",
  isGenerated: true,
  primaryTag: { id: "tag-1", name: "Action", color: "#ff0000" },
  tags: [],
  scene: { id: "scene-1", title: "Test Scene", pathScreenshot: "/screenshot.jpg" },
};

const renderWithProviders = (ui) => {
  return render(
    <MemoryRouter>
      <CardDisplaySettingsProvider>{ui}</CardDisplaySettingsProvider>
    </MemoryRouter>
  );
};

describe("ClipCard", () => {
  it("renders clip title", () => {
    renderWithProviders(<ClipCard clip={mockClip} />);
    expect(screen.getByText("Test Clip")).toBeInTheDocument();
  });

  it("shows formatted duration", () => {
    renderWithProviders(<ClipCard clip={mockClip} />);
    // endSeconds (180) - seconds (120) = 60 seconds = 1:00
    expect(screen.getByText("1:00")).toBeInTheDocument();
  });

  it("renders as a link to scene with timestamp", () => {
    const { container } = renderWithProviders(<ClipCard clip={mockClip} />);
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "/scene/scene-1?t=120");
  });

  it("shows no preview badge when not generated", () => {
    const ungeneratedClip = { ...mockClip, isGenerated: false };
    renderWithProviders(<ClipCard clip={ungeneratedClip} />);
    expect(screen.getByText("No preview")).toBeInTheDocument();
  });
});
