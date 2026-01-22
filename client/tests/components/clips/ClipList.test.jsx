import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClipList from "../../../src/components/clips/ClipList.jsx";

// Mock the api module
vi.mock("../../../src/services/api.js", () => ({
  getClipPreviewUrl: (id) => `/api/proxy/clip/${id}/preview`,
}));

const mockClips = [
  {
    id: "1",
    title: "First Clip",
    seconds: 0,
    sceneId: "s1",
    isGenerated: true,
    primaryTag: { id: "1", name: "Intro", color: "#00ff00" },
    scene: { id: "s1", title: "Scene" },
  },
  {
    id: "2",
    title: "Second Clip",
    seconds: 60,
    sceneId: "s1",
    isGenerated: true,
    primaryTag: { id: "2", name: "Action", color: "#ff0000" },
    scene: { id: "s1", title: "Scene" },
  },
];

describe("ClipList", () => {
  it("renders list of clips", () => {
    render(
      <MemoryRouter>
        <ClipList clips={mockClips} onClipClick={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("First Clip")).toBeInTheDocument();
    expect(screen.getByText("Second Clip")).toBeInTheDocument();
  });

  it("shows empty state when no clips", () => {
    render(
      <MemoryRouter>
        <ClipList clips={[]} onClipClick={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText(/no clips/i)).toBeInTheDocument();
  });

  it("shows loading skeleton when loading", () => {
    const { container } = render(
      <MemoryRouter>
        <ClipList clips={[]} onClipClick={() => {}} loading={true} />
      </MemoryRouter>
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows clip count in header", () => {
    render(
      <MemoryRouter>
        <ClipList clips={mockClips} onClipClick={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("Clips (2)")).toBeInTheDocument();
  });
});
