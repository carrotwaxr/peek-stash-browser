import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import type { EntityDetail } from "@/api/hooks/useEntityDetail";
import EntityDetailPage from "@/components/detail/EntityDetailPage";
import { foundTag, renderDetailPart } from "./renderDetailPart";

const page = (detail: EntityDetail<"tag">) => (
  <EntityDetailPage type="tag" detail={detail}>
    {(found) => <p>the page of {found.entity.name}</p>}
  </EntityDetailPage>
);

describe("EntityDetailPage", () => {
  beforeEach(() => {
    // The ambiguous screen asks for the servers' names
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              availableInstances: [
                { id: "inst-a", name: "Alpha" },
                { id: "inst-b", name: "Beta" },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      )
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("each lookup state renders its screen", async () => {
    const loading = renderDetailPart(page({ status: "loading" }));
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText(/the page of/)).toBeNull();
    loading.unmount();

    const notFound = renderDetailPart(page({ status: "notFound" }));
    expect(screen.getByText(/Tag not found/i)).toBeVisible();
    notFound.unmount();

    const ambiguous = renderDetailPart(
      page({
        status: "ambiguous",
        matches: [
          { id: "5", instanceId: "inst-a", name: "Thing A" },
          { id: "5", instanceId: "inst-b", name: "Thing B" },
        ],
      })
    );
    expect(screen.getByRole("link", { name: "Thing A" })).toHaveAttribute(
      "href",
      "/tag/5?instance=inst-a"
    );
    expect(await screen.findByText("Beta")).toBeVisible();
    ambiguous.unmount();

    const retry = vi.fn();
    const failed = renderDetailPart(
      page({
        status: "error",
        error: new ApiError("Server error", 500, {}),
        retry,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/the page of/)).toBeNull();
    failed.unmount();

    renderDetailPart(page(foundTag()));
    expect(screen.getByText("the page of Thing")).toBeVisible();
  });
});
