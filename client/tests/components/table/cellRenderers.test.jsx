// client/tests/components/table/cellRenderers.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { getCellRenderer } from "../../../src/components/table/cellRenderers.jsx";

describe("cellRenderers", () => {
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
      expect(img).toHaveAttribute("src", "/api/proxy/stash?path=/galleries/cover.jpg");
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
});
