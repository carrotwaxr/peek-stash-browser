/**
 * CustomizationTab: the table-column editor saves through the tab (CS-21).
 * A failed save is reported once, by the tab, and the editor keeps its
 * changes marked unsaved; a failed load offers Retry and no editor, so a
 * save cannot replace the stored column defaults with a partial set.
 * The tab reads and saves through the user-settings query, so a change
 * reaches every mounted reader at once (item 52); its table columns are the
 * ones the tables save.
 */
import type { NormalizedScene, TableColumnsConfig } from "@peek/shared-types";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../../src/api";
import CustomizationTab from "../../../../src/components/settings/tabs/CustomizationTab";
import SceneCardPreview from "../../../../src/components/ui/SceneCardPreview";
import { getColumnsForEntity } from "../../../../src/config/tableColumns";
import { useTableColumns } from "../../../../src/hooks/useTableColumns";
import { showError, showSuccess } from "../../../../src/utils/toast";
import { flushPromises, must } from "../../../testUtils";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

// The tab's calls are stubbed; the rest (ApiError, getErrorMessage) is real
vi.mock("../../../../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

vi.mock("../../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// Card display settings load their own data through a context
vi.mock("../../../../src/components/settings/CardDisplaySettings", () => ({
  default: () => null,
}));

const renderTab = () =>
  render(
    <SignedInWithQuery>
      <CustomizationTab />
    </SignedInWithQuery>
  );

/** The table-column editor's card, found by its heading. */
async function tableColumns(): Promise<HTMLElement> {
  const title = await screen.findByRole("heading", {
    name: "Table Columns",
  });
  return must(title.closest<HTMLElement>(".p-6"), "table columns section");
}

/** A scene table's column toggle, as the table's columns popover calls it */
function SceneTableDuration() {
  const { toggleColumn } = useTableColumns("scene");
  return (
    <button type="button" onClick={() => toggleColumn("duration")}>
      Toggle Duration on the table
    </button>
  );
}

/** A performer table's toggle of its first optional column */
function PerformerTableToggle() {
  const { toggleColumn } = useTableColumns("performer");
  const optional = must(
    getColumnsForEntity("performer").find((col) => !col.mandatory),
    "an optional performer column"
  );
  return (
    <button type="button" onClick={() => toggleColumn(optional.id)}>
      Toggle a column on the table
    </button>
  );
}

/** The table columns the nth PUT carried */
function sentColumns(n: number): Record<string, TableColumnsConfig> {
  const body = mockApiPut.mock.calls[n]?.[1] as {
    tableColumnDefaults?: Record<string, TableColumnsConfig>;
  };
  return must(body.tableColumnDefaults, `the table columns of PUT ${n}`);
}

/** The editor's checkbox for a column, found by its label */
function columnBox(section: HTMLElement, label: string): HTMLInputElement {
  const row = must(
    within(section).getByText(label).closest("div"),
    `the ${label} row`
  );
  return within(row).getByRole<HTMLInputElement>("checkbox");
}

/** Toggle the first column that is not required. */
function toggleAColumn(section: HTMLElement) {
  const box = must(
    within(section)
      .getAllByRole<HTMLInputElement>("checkbox")
      .find((b) => !b.disabled),
    "an optional column"
  );
  fireEvent.click(box);
}

describe("CustomizationTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(userSettingsResponse());
  });

  it("a failed table-column save keeps the changes marked unsaved", async () => {
    mockApiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
    renderTab();
    const section = await tableColumns();

    toggleAColumn(section);
    const save = within(section).getByRole("button", { name: "Save Changes" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Database busy")
    );
    await flushPromises();
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(save).toBeEnabled();
  });

  it("a saved table-column change is no longer marked unsaved", async () => {
    mockApiPut.mockResolvedValue({ success: true });
    renderTab();
    const section = await tableColumns();

    toggleAColumn(section);
    const save = within(section).getByRole("button", { name: "Save Changes" });
    fireEvent.click(save);

    await waitFor(() => expect(save).toBeDisabled());
    expect(showSuccess).toHaveBeenCalledWith("Table columns saved!");
  });

  it("a column toggled on the Scenes table shows in Settings' table columns", async () => {
    mockApiPut.mockResolvedValue({ success: true });
    const { rerender } = render(
      <SignedInWithQuery>
        <SceneTableDuration />
      </SignedInWithQuery>
    );
    const toggle = await screen.findByRole("button", {
      name: "Toggle Duration on the table",
    });
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
    await flushPromises();

    fireEvent.click(toggle);
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));

    // Settings opens after the table (the same query client)
    rerender(
      <SignedInWithQuery>
        <SceneTableDuration />
        <CustomizationTab />
      </SignedInWithQuery>
    );
    const section = await tableColumns();

    expect(columnBox(section, "Duration")).toBeChecked();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it("an open editor follows a column change made on a table", async () => {
    mockApiPut.mockResolvedValue({ success: true });
    render(
      <SignedInWithQuery>
        <SceneTableDuration />
        <CustomizationTab />
      </SignedInWithQuery>
    );
    const section = await tableColumns();
    expect(columnBox(section, "Duration")).not.toBeChecked();

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle Duration on the table" })
    );

    await waitFor(() => expect(columnBox(section, "Duration")).toBeChecked());
    expect(
      within(section).getByRole("button", { name: "Save Changes" })
    ).toBeDisabled();
  });

  it("unsaved edits in the editor are kept when a table changes its columns", async () => {
    mockApiPut.mockResolvedValue({ success: true });
    render(
      <SignedInWithQuery>
        <SceneTableDuration />
        <CustomizationTab />
      </SignedInWithQuery>
    );
    const section = await tableColumns();
    fireEvent.click(columnBox(section, "Rating"));

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle Duration on the table" })
    );
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));

    expect(columnBox(section, "Rating")).toBeChecked();
    expect(
      within(section).getByRole("button", { name: "Save Changes" })
    ).toBeEnabled();
  });

  it("saving in Settings keeps another type's columns a table saved meanwhile", async () => {
    mockApiPut.mockResolvedValue({ success: true });
    render(
      <SignedInWithQuery>
        <PerformerTableToggle />
        <CustomizationTab />
      </SignedInWithQuery>
    );
    const section = await tableColumns();
    // Scene's columns edited in Settings, not saved yet
    fireEvent.click(columnBox(section, "Rating"));

    // Meanwhile a performer table saves its columns
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle a column on the table" })
    );
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));
    await flushPromises();
    const performerColumns = sentColumns(0).performer;
    expect(performerColumns).toBeDefined();

    fireEvent.click(
      within(section).getByRole("button", { name: "Save Changes" })
    );

    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(2));
    expect(sentColumns(1).performer).toEqual(performerColumns);
    expect(sentColumns(1).scene?.visible).toContain("rating");
  });

  it("a failed view preference save shows the server's message and keeps the stored value", async () => {
    mockApiGet.mockResolvedValue(
      userSettingsResponse({ wallPlayback: "hover" })
    );
    mockApiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
    renderTab();
    const select = await screen.findByLabelText("Wall View Preview Behavior");

    fireEvent.change(select, { target: { value: "static" } });

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Database busy")
    );
    expect(select).toHaveValue("hover");
  });

  it("a failed customization settings load offers Retry and no editor", async () => {
    mockApiGet
      .mockRejectedValueOnce(new api.ApiError("Database busy", 503))
      .mockResolvedValueOnce(userSettingsResponse({ wallPlayback: "static" }));
    renderTab();

    expect(await screen.findByText("Database busy")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Table Columns" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Wall View Preview Behavior")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByLabelText("Wall View Preview Behavior")
    ).toHaveValue("static");
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  describe("preview quality", () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
      fetchMock.mockReset();
      // The scene's VTT (an empty sprite sheet) and the preview's HEAD
      fetchMock.mockImplementation((input) =>
        Promise.resolve(
          (input instanceof Request ? input.url : input.toString()).endsWith(
            ".vtt"
          )
            ? new Response("WEBVTT\n", { status: 200 })
            : new Response(null, { status: 200 })
        )
      );
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("choosing MP4 previews makes a mounted SceneCardPreview request the mp4 preview without a reload", async () => {
      mockApiGet.mockResolvedValue(
        userSettingsResponse({ preferredPreviewQuality: "sprite" })
      );
      mockApiPut.mockResolvedValue({ success: true });
      const scene = {
        id: "42",
        title: "A scene",
        instanceId: "inst-a",
        paths: {
          screenshot: null,
          vtt: "/api/proxy/scene/42/vtt.vtt",
          sprite: "/api/proxy/scene/42/sprite.jpg",
        },
      } as unknown as NormalizedScene;
      const { container } = render(
        <SignedInWithQuery>
          <CustomizationTab />
          <SceneCardPreview scene={scene} active />
        </SignedInWithQuery>
      );
      const select = await screen.findByLabelText("Scene Card Preview Quality");
      // The sprite preview loaded first
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/proxy/scene/42/vtt.vtt",
          expect.objectContaining({})
        )
      );

      fireEvent.change(select, { target: { value: "mp4" } });

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/proxy/scene/42/preview?instanceId=inst-a",
          { method: "HEAD" }
        )
      );
      await waitFor(() =>
        expect(container.querySelector("video")).toHaveAttribute(
          "src",
          "/api/proxy/scene/42/preview?instanceId=inst-a"
        )
      );
      expect(mockApiPut).toHaveBeenCalledWith("/user/settings", {
        preferredPreviewQuality: "mp4",
      });
      expect(select).toHaveValue("mp4");
      expect(
        mockApiGet.mock.calls.filter(([path]) => path === "/user/settings")
      ).toHaveLength(1);
    });
  });
});
