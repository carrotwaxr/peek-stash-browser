// client/tests/components/table/cellRenderers.test.jsx
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getCellRenderer } from "../../../src/components/table/cellRenderers";

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
