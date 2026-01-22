import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClipTimelineMarkers from "../../../src/components/video-player/ClipTimelineMarkers.jsx";

const mockClips = [
  { id: "1", seconds: 30, title: "Intro", primaryTag: { color: "#ff0000", name: "Intro" } },
  { id: "2", seconds: 120, title: "Main", primaryTag: { color: "#00ff00", name: "Main" } },
];

describe("ClipTimelineMarkers", () => {
  it("renders markers for each clip", () => {
    render(
      <ClipTimelineMarkers
        clips={mockClips}
        duration={300}
        onMarkerClick={() => {}}
      />
    );
    const markers = screen.getAllByRole("button");
    expect(markers).toHaveLength(2);
  });

  it("calculates position as percentage of duration", () => {
    const { container } = render(
      <ClipTimelineMarkers
        clips={mockClips}
        duration={300}
        onMarkerClick={() => {}}
      />
    );
    // First marker at 30s / 300s = 10%
    const firstMarker = container.querySelector('[data-clip-id="1"]');
    expect(firstMarker.style.left).toBe("10%");
  });

  it("calls onMarkerClick with correct seconds when clicked", () => {
    const handleClick = vi.fn();
    render(
      <ClipTimelineMarkers
        clips={mockClips}
        duration={300}
        onMarkerClick={handleClick}
      />
    );
    const markers = screen.getAllByRole("button");
    fireEvent.click(markers[0]);
    expect(handleClick).toHaveBeenCalledWith(30);
  });

  it("returns null when no clips", () => {
    const { container } = render(
      <ClipTimelineMarkers
        clips={[]}
        duration={300}
        onMarkerClick={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when duration is 0", () => {
    const { container } = render(
      <ClipTimelineMarkers
        clips={mockClips}
        duration={0}
        onMarkerClick={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
