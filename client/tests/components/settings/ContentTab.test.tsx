import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPut } from "../../../src/api";
import { ApiError } from "../../../src/api/client";
import { queryKeys } from "../../../src/api/queryKeys";
import ContentTab from "../../../src/components/settings/tabs/ContentTab";
import { showError } from "../../../src/utils/toast";

vi.mock("../../../src/utils/toast", () => ({
  showError: vi.fn(),
}));

// Mock hooks and API
vi.mock("../../../src/hooks/useHiddenEntities", () => ({
  useHiddenEntities: () => ({
    hideConfirmationDisabled: false,
    updateHideConfirmation: vi.fn(),
  }),
}));

vi.mock("../../../src/api", () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}));

const mockApiGet = apiGet as ReturnType<typeof vi.fn>;
const mockApiPut = apiPut as ReturnType<typeof vi.fn>;

/** Renders the tab under a query client, which it refreshes after a change */
const renderTab = (client = new QueryClient()) =>
  render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <ContentTab />
      </BrowserRouter>
    </QueryClientProvider>
  );

const TWO_SOURCES = {
  selectedInstanceIds: ["inst-1", "inst-2"],
  availableInstances: [
    { id: "inst-1", name: "Main", description: "Primary" },
    { id: "inst-2", name: "Backup", description: "Archive" },
  ],
};

const checkbox = (name: string) =>
  screen.getByRole("checkbox", { name: new RegExp(name) });

describe("ContentTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Content Sources section when multiple instances exist", async () => {
    // API returns data directly (not wrapped in .data)
    mockApiGet.mockResolvedValue({
      selectedInstanceIds: ["inst-1", "inst-2"],
      availableInstances: [
        { id: "inst-1", name: "Main", description: "Primary" },
        { id: "inst-2", name: "Backup", description: "Archive" },
      ],
    });

    renderTab();

    await waitFor(() => {
      expect(screen.getByText("Content Sources")).toBeInTheDocument();
      expect(screen.getByText("Main")).toBeInTheDocument();
      expect(screen.getByText("Backup")).toBeInTheDocument();
    });
  });

  it("hides Content Sources section when only one instance exists", async () => {
    mockApiGet.mockResolvedValue({
      selectedInstanceIds: ["inst-1"],
      availableInstances: [
        { id: "inst-1", name: "Main", description: "Primary" },
      ],
    });

    renderTab();

    await waitFor(() => {
      // Use getAllByText since "Hidden Items" appears in both header and link
      expect(screen.getAllByText("Hidden Items").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Content Sources")).not.toBeInTheDocument();
  });

  it("changing Content Sources refetches the library queries", async () => {
    mockApiGet.mockResolvedValue(TWO_SOURCES);
    mockApiPut.mockResolvedValue({ success: true });
    const client = new QueryClient();
    const listKey = queryKeys.scenes.list(undefined, { page: 1 });
    client.setQueryData(listKey, { findScenes: { scenes: [] } });
    client.setQueryData(queryKeys.setup.status(), { stashInstanceCount: 2 });

    renderTab(client);
    await waitFor(() => {
      expect(checkbox("Backup")).toBeChecked();
    });
    fireEvent.click(checkbox("Backup"));

    await waitFor(() => {
      expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    });
    expect(mockApiPut).toHaveBeenCalledWith("/user/stash-instances", {
      instanceIds: ["inst-1"],
    });
    expect(client.getQueryState(queryKeys.setup.status())?.isInvalidated).toBe(
      true
    );
    expect(showError).not.toHaveBeenCalled();
  });

  it("a failed change shows an error and restores the checkboxes", async () => {
    mockApiGet.mockResolvedValue(TWO_SOURCES);
    mockApiPut.mockRejectedValue(
      new ApiError("Unknown instance", 400, { error: "Unknown instance" })
    );
    const client = new QueryClient();
    const listKey = queryKeys.scenes.list(undefined, { page: 1 });
    client.setQueryData(listKey, { findScenes: { scenes: [] } });

    renderTab(client);
    await waitFor(() => {
      expect(checkbox("Backup")).toBeChecked();
    });
    fireEvent.click(checkbox("Backup"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Unknown instance");
    });
    expect(checkbox("Backup")).toBeChecked();
    expect(checkbox("Backup")).toBeEnabled();
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(false);
  });
});
