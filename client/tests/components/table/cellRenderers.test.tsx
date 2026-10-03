// client/tests/components/table/cellRenderers.test.jsx
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getCellRenderer } from "../../../src/components/table/cellRenderers";

describe("cellRenderers", () => {
  describe("image renderers", () => {
    const image = {
      id: "12",
      instanceId: "inst-a",
      title: "Sunset",
      paths: { thumbnail: "/thumb.jpg" },
    };

    it("an Images table title cell links to the image, not #", () => {
      const TitleRenderer = getCellRenderer("title", "image");
      render(
        <MemoryRouter>
          <TitleRenderer {...image} />
        </MemoryRouter>
      );

      expect(screen.getByRole("link").getAttribute("href")).toBe(
        "/images?image=12%3Ainst-a"
      );
    });

    it("an Images table thumbnail cell links to the image, not #", () => {
      const ThumbnailRenderer = getCellRenderer("image", "image");
      render(
        <MemoryRouter>
          <ThumbnailRenderer {...image} />
        </MemoryRouter>
      );

      expect(screen.getByRole("link").getAttribute("href")).toBe(
        "/images?image=12%3Ainst-a"
      );
    });
  });

  describe("clip renderers", () => {
    const untitled = {
      id: "3",
      instanceId: "inst-a",
      sceneId: "9",
      seconds: 12,
      title: null,
      primaryTag: { id: "t1", name: "Action" },
      scene: { pathScreenshot: "/shot.jpg" },
    };

    it("the table cell of an untitled clip reads its primary tag's name", () => {
      const TitleRenderer = getCellRenderer("title", "clip");
      render(
        <MemoryRouter>
          <TitleRenderer {...untitled} />
        </MemoryRouter>
      );
      expect(screen.getByText("Action")).toBeInTheDocument();
      expect(screen.queryByText("Untitled")).not.toBeInTheDocument();
    });

    it("the thumbnail of an untitled clip is named by its primary tag", () => {
      const ThumbnailRenderer = getCellRenderer("thumbnail", "clip");
      render(
        <MemoryRouter>
          <ThumbnailRenderer {...untitled} />
        </MemoryRouter>
      );
      expect(screen.getByAltText("Action")).toBeInTheDocument();
    });
  });

  describe("gallery cover renderer", () => {
    it("renders thumbnail from gallery.cover string URL", () => {
      const gallery = {
        id: "123",
        title: "Test Gallery",
        cover: "/api/proxy/stash?path=/galleries/cover.jpg",
      };

      const CoverRenderer = getCellRenderer("cover", "gallery");
      render(
        <MemoryRouter>
          <CoverRenderer {...gallery} />
        </MemoryRouter>
      );

      const img = screen.getByRole("img");
      expect(img).toHaveAttribute(
        "src",
        "/api/proxy/stash?path=/galleries/cover.jpg"
      );
    });

    it("renders placeholder when gallery has no cover", () => {
      const gallery = {
        id: "123",
        title: "Test Gallery",
        cover: null,
      };

      const CoverRenderer = getCellRenderer("cover", "gallery");
      render(
        <MemoryRouter>
          <CoverRenderer {...gallery} />
        </MemoryRouter>
      );

      // Should render ThumbnailCell with no src (shows placeholder)
      expect(screen.getByText("No image")).toBeInTheDocument();
    });
  });

  describe("group performers renderer", () => {
    it("counts relation_totals.performers in its '+N more' and its list", () => {
      const group = {
        id: "7",
        instanceId: "inst-a",
        performers: Array.from({ length: 12 }, (_, i) => ({
          id: String(i + 1),
          instanceId: "inst-a",
          name: `Performer ${i + 1}`,
        })),
        relation_totals: { performers: 30 },
      };

      const PerformersRenderer = getCellRenderer("performers", "group");
      render(
        <MemoryRouter>
          <PerformersRenderer {...group} />
        </MemoryRouter>
      );

      const more = screen.getByRole("button", { name: "+28 more" });
      fireEvent.click(more);
      expect(screen.getByText("and 18 more")).toBeInTheDocument();
    });
  });
});
