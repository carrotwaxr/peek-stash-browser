import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClipList from "../../../src/components/clips/ClipList.jsx";
import { CardDisplaySettingsProvider } from "../../../src/contexts/CardDisplaySettingsContext.jsx";

// Mock the api module
vi.mock("../../../src/services/api.js", () => ({
  getClipPreviewUrl: (id) => `/api/proxy/clip/${id}/preview`,
}));

const mockClips = [
  {
    id: "1",
    title: "First Clip",
    seconds: 0,
    endSeconds: 30,
    sceneId: "s1",
    isGenerated: true,
    primaryTag: { id: "1", name: "Intro", color: "#00ff00" },
    tags: [],
    scene: { id: "s1", title: "Scene" },
  },
  {
    id: "2",
    title: "Second Clip",
    seconds: 60,
    endSeconds: 90,
    sceneId: "s1",
    isGenerated: true,
    primaryTag: { id: "2", name: "Action", color: "#ff0000" },
    tags: [],
    scene: { id: "s1", title: "Scene" },
  },
];

const renderWithProviders = (ui) => {
  return render(
    <MemoryRouter>
      <CardDisplaySettingsProvider>{ui}</CardDisplaySettingsProvider>
    </MemoryRouter>
  );
};

describe("ClipList", () => {
  it("renders list of clips", () => {
    renderWithProviders(<ClipList clips={mockClips} onClipClick={() => {}} />);
    expect(screen.getByText("First Clip")).toBeInTheDocument();
    expect(screen.getByText("Second Clip")).toBeInTheDocument();
  });

  it("shows empty state when no clips", () => {
    renderWithProviders(<ClipList clips={[]} onClipClick={() => {}} />);
    expect(screen.getByText(/no clips/i)).toBeInTheDocument();
  });

  it("shows loading skeleton when loading", () => {
    const { container } = renderWithProviders(
      <ClipList clips={[]} onClipClick={() => {}} loading={true} />
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders clip grid", () => {
    const { container } = renderWithProviders(
      <ClipList clips={mockClips} onClipClick={() => {}} />
    );
    // Should have a grid container
    expect(container.querySelector(".grid")).toBeInTheDocument();
  });
});
