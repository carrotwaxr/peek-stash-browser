import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WallView, { MAX_WALL_PREVIEWS } from "@/components/wall/WallView";

// The shared empty state, as a stub naming what it was given
vi.mock("@/components/ui/EmptyState", () => ({
  default: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <div data-testid="empty-state">
      {title}
      {description ? ` | ${description}` : ""}
    </div>
  ),
}));

// Every tile is in view, and the album lays its photos out without a width
vi.mock("@/hooks/useInView", () => ({ useInView: () => true }));
vi.mock("react-photo-album", () => ({
  RowsPhotoAlbum: ({
    photos,
    render,
  }: {
    photos: { key: string; width: number; height: number }[];
    render: {
      photo: (
        props: Record<string, never>,
        context: { photo: unknown; width: number; height: number }
      ) => ReactNode;
    };
  }) => (
    <div>
      {photos.map((photo) =>
        render.photo({}, { photo, width: photo.width, height: photo.height })
      )}
    </div>
  ),
}));

describe("WallView", () => {
  it("an empty list shows EmptyState with the page's message", () => {
    render(
      <MemoryRouter>
        <WallView
          items={[]}
          entityType="scene"
          emptyMessage="No scenes found"
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "No scenes found"
    );
  });

  it("with 20 tiles in view only 6 play", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      instanceId: "i1",
      title: `Scene ${i}`,
      paths: { screenshot: `/s/${i}.jpg`, preview: `/p/${i}.mp4` },
    }));

    const { container } = render(
      <MemoryRouter>
        <WallView items={items} entityType="scene" playbackMode="autoplay" />
      </MemoryRouter>
    );

    expect(container.querySelectorAll("video")).toHaveLength(20);
    expect(container.querySelectorAll("video[src]")).toHaveLength(
      MAX_WALL_PREVIEWS
    );
  });
});
