import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClipCard from "../../../src/components/cards/ClipCard.jsx";

// Mock the api module
vi.mock("../../../src/services/api.js", () => ({
  getClipPreviewUrl: (id) => `/api/proxy/clip/${id}/preview`,
}));

const mockClip = {
  id: "1",
  title: "Test Clip",
  seconds: 120,
  sceneId: "scene-1",
  isGenerated: true,
  primaryTag: { id: "tag-1", name: "Action", color: "#ff0000" },
  scene: { id: "scene-1", title: "Test Scene", pathScreenshot: "/screenshot.jpg" },
};

describe("ClipCard", () => {
  it("renders clip title", () => {
    render(
      <MemoryRouter>
        <ClipCard clip={mockClip} />
      </MemoryRouter>
    );
    expect(screen.getByText("Test Clip")).toBeInTheDocument();
  });

  it("shows formatted timestamp", () => {
    render(
      <MemoryRouter>
        <ClipCard clip={mockClip} />
      </MemoryRouter>
    );
    // 120 seconds = 2:00
    expect(screen.getByText("2:00")).toBeInTheDocument();
  });

  it("shows primary tag name", () => {
    render(
      <MemoryRouter>
        <ClipCard clip={mockClip} />
      </MemoryRouter>
    );
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("shows scene title when showSceneTitle is true", () => {
    render(
      <MemoryRouter>
        <ClipCard clip={mockClip} showSceneTitle={true} />
      </MemoryRouter>
    );
    expect(screen.getByText("Test Scene")).toBeInTheDocument();
  });
});
