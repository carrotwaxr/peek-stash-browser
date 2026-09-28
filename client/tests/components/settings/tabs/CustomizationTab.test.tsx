/**
 * CustomizationTab: the table-column editor saves through the tab (CS-21).
 * A failed save is reported once, by the tab, and the editor keeps its
 * changes marked unsaved; a failed load offers Retry and no editor, so a
 * save cannot replace the stored column defaults with a partial set.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../../src/api";
import CustomizationTab from "../../../../src/components/settings/tabs/CustomizationTab";
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

/** The table-column editor's card, found by its heading. */
async function tableColumns(): Promise<HTMLElement> {
  const title = await screen.findByRole("heading", {
    name: "Table View Default Columns",
  });
  return must(title.closest<HTMLElement>(".p-6"), "table columns section");
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
    mockApiGet.mockResolvedValue({ settings: {} });
  });

  it("a failed table-column save keeps the changes marked unsaved", async () => {
    mockApiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
    render(<CustomizationTab />);
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
    render(<CustomizationTab />);
    const section = await tableColumns();

    toggleAColumn(section);
    const save = within(section).getByRole("button", { name: "Save Changes" });
    fireEvent.click(save);

    await waitFor(() => expect(save).toBeDisabled());
    expect(showSuccess).toHaveBeenCalledWith("Table column defaults saved!");
  });

  it("a failed view preference save shows the server's message and keeps the stored value", async () => {
    mockApiGet.mockResolvedValue({ settings: { wallPlayback: "hover" } });
    mockApiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
    render(<CustomizationTab />);
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
      .mockResolvedValueOnce({ settings: { wallPlayback: "static" } });
    render(<CustomizationTab />);

    expect(await screen.findByText("Database busy")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Table View Default Columns" })
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
});
