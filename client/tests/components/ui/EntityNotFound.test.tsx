import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as apiModule from "@/api";
import { ApiError } from "@/api/client";
import EntityNotFound from "@/components/ui/EntityNotFound";

const mockApiGet = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof apiModule>()),
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

const renderAt = (ui: React.ReactElement) =>
  render(<MemoryRouter initialEntries={["/performer/7"]}>{ui}</MemoryRouter>);

describe("EntityNotFound", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue({
      selectedInstanceIds: [],
      availableInstances: [
        { id: "inst-a", name: "Main server", description: null },
        { id: "inst-b", name: "Archive", description: null },
      ],
    });
  });

  it("not found names the type and links back to its list", () => {
    renderAt(<EntityNotFound entityType="performer" status="notFound" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Performer not found" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse performers" })
    ).toHaveAttribute("href", "/performers");
    // Nothing to choose from, so no server names are asked for
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("a collection's way back is the Collections page", () => {
    renderAt(<EntityNotFound entityType="group" status="notFound" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Collection not found" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse collections" })
    ).toHaveAttribute("href", "/collections");
  });

  it("lists each match with its instance link", async () => {
    renderAt(
      <EntityNotFound
        entityType="performer"
        status="ambiguous"
        matches={[
          { id: "7", name: "Jane Doe", instanceId: "inst-a" },
          { id: "7", name: "Jane Doe", instanceId: "inst-b" },
        ]}
      />
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Performer found on several servers",
      })
    ).toBeInTheDocument();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const first = within(must(items[0], "the first match"));
    const second = within(must(items[1], "the second match"));
    expect(first.getByRole("link", { name: "Jane Doe" })).toHaveAttribute(
      "href",
      "/performer/7?instance=inst-a"
    );
    expect(second.getByRole("link", { name: "Jane Doe" })).toHaveAttribute(
      "href",
      "/performer/7?instance=inst-b"
    );
    // Each match names its server once the names load
    expect(await first.findByText("Main server")).toBeInTheDocument();
    expect(second.getByText("Archive")).toBeInTheDocument();
    const call = must(mockApiGet.mock.calls[0], "the server names request");
    expect(call[0]).toBe("/user/stash-instances");
    expect(call[1]).toBeInstanceOf(AbortSignal);
  });

  it("a scene match shows its title, and its instance id when names fail to load", async () => {
    mockApiGet.mockRejectedValue(new ApiError("Server error", 500));

    renderAt(
      <EntityNotFound
        entityType="scene"
        status="ambiguous"
        matches={[
          { id: "3", title: "Beach day", instanceId: "inst-a" },
          { id: "3", title: null, instanceId: "inst/b" },
        ]}
      />
    );

    expect(screen.getByRole("link", { name: "Beach day" })).toHaveAttribute(
      "href",
      "/scene/3?instance=inst-a"
    );
    // An untitled match still gets a label, and the instance is encoded
    expect(screen.getByRole("link", { name: "Scene 3" })).toHaveAttribute(
      "href",
      "/scene/3?instance=inst%2Fb"
    );
    expect(await screen.findByText("inst-a")).toBeInTheDocument();
    expect(screen.getByText("inst/b")).toBeInTheDocument();
  });

  it("an error shows the server's message and Retry asks again", () => {
    const onRetry = vi.fn();

    renderAt(
      <EntityNotFound
        entityType="studio"
        status="error"
        error={new ApiError("Stash is not answering", 502)}
        onRetry={onRetry}
      />
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Could not load this studio",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Stash is not answering"
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: "Browse studios" })
    ).toHaveAttribute("href", "/studios");
  });
});
