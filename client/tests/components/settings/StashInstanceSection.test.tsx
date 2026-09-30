import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api/client";
import { queryKeys } from "../../../src/api/queryKeys";
import StashInstanceSection from "../../../src/components/settings/StashInstanceSection";
import { useAuth } from "../../../src/hooks/useAuth";
import { showError, showInfo, showSuccess } from "../../../src/utils/toast";

vi.mock("../../../src/utils/toast", () => ({
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSuccess: vi.fn(),
}));

// Mock useAuth hook
vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mock the typed API client
type ApiMock = (...args: unknown[]) => Promise<unknown>;
const mockApiGet = vi.fn<ApiMock>();
const mockApiPost = vi.fn<ApiMock>();
const mockApiPut = vi.fn<ApiMock>();
const mockApiDelete = vi.fn<ApiMock>();
vi.mock("../../../src/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

/** Renders the section under a query client, which it refreshes after a change */
const renderSection = (client = new QueryClient()) =>
  render(
    <QueryClientProvider client={client}>
      <StashInstanceSection />
    </QueryClientProvider>
  );

describe("StashInstanceSection", () => {
  const mockInstance = {
    id: "test-instance-1",
    name: "Test Stash",
    description: "Test description",
    url: "http://localhost:9999/graphql",
    uiUrl: null,
    enabled: true,
    priority: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    firstSyncedAt: "2024-01-01T00:10:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Admin user", () => {
    beforeEach(() => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { role: "ADMIN" },
      });
    });

    it("loads all instances for admin users", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });

      renderSection();

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith("/setup/stash-instances");
      });
    });

    it("displays instance list with admin controls", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Test Stash")).toBeInTheDocument();
      });

      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Edit")).toBeInTheDocument();
      expect(screen.getByText("Disable")).toBeInTheDocument();
      expect(screen.getByText("Add Instance")).toBeInTheDocument();
    });

    it("shows add form when clicking Add Instance", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Add Instance"));

      expect(screen.getByText("Add New Instance")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("My Stash Server")
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("http://localhost:9999/graphql")
      ).toBeInTheDocument();
    });

    it("shows edit form when clicking Edit", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Edit"));

      expect(screen.getByText("Edit Instance")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test Stash")).toBeInTheDocument();
    });

    it("toggles instance enabled state", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      mockApiPut.mockResolvedValue({});
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Disable")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Disable"));

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith(
          "/setup/stash-instance/test-instance-1",
          { enabled: false }
        );
      });
      confirmSpy.mockRestore();
    });

    it("Disable asks to confirm, and a cancel sends nothing", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      renderSection();
      await waitFor(() => {
        expect(screen.getByText("Disable")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Disable"));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Disable "Test Stash"? Every user stops seeing its content until you ' +
          "enable it again. Ratings, history and playlists are kept."
      );
      expect(mockApiPut).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("Enable sends at once, with no confirm", async () => {
      mockApiGet.mockResolvedValue({
        instances: [{ ...mockInstance, enabled: false }],
      });
      mockApiPut.mockResolvedValue({});
      const confirmSpy = vi.spyOn(window, "confirm");

      renderSection();
      await waitFor(() => {
        expect(screen.getByText("Enable")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Enable"));

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith(
          "/setup/stash-instance/test-instance-1",
          { enabled: true }
        );
      });
      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("a refused disable shows the server's message in a toast and keeps the list", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      const message =
        "Peek needs an enabled Stash instance. Add another instance first, or change this one's address under Edit.";
      mockApiPut.mockRejectedValue(
        new ApiError(message, 400, { error: message })
      );
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderSection();
      await waitFor(() => {
        expect(screen.getByText("Disable")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Disable"));

      await waitFor(() => {
        expect(showError).toHaveBeenCalledWith(message);
      });
      // The list stays, with the instance still active
      expect(screen.getByText("Test Stash")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Disable")).toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("creates new instance when form is submitted", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      mockApiPost.mockResolvedValue({});

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Add Instance"));

      fireEvent.change(screen.getByPlaceholderText("My Stash Server"), {
        target: { value: "New Instance" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        {
          target: { value: "http://test:9999/graphql" },
        }
      );

      fireEvent.click(screen.getByText("Add Instance", { selector: "button" }));

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith("/setup/stash-instance", {
          name: "New Instance",
          description: null,
          url: "http://test:9999/graphql",
          uiUrl: null,
          apiKey: "",
          enabled: true,
          priority: 1,
        });
      });
    });

    it("adding an instance while a sync runs says it will sync afterwards", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      mockApiPost.mockResolvedValue({
        success: true,
        instance: { ...mockInstance, id: "test-instance-2", name: "Archive" },
        sync: "queued",
      });

      renderSection();
      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Add Instance"));
      fireEvent.change(screen.getByPlaceholderText("My Stash Server"), {
        target: { value: "Archive" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        { target: { value: "http://archive:9999/graphql" } }
      );
      fireEvent.click(screen.getByText("Add Instance", { selector: "button" }));

      await waitFor(() => {
        expect(showInfo).toHaveBeenCalledWith(
          'Saved. A sync is running; "Archive" syncs right after it.'
        );
      });
    });

    it("adding an instance with no sync running says nothing more", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      mockApiPost.mockResolvedValue({
        success: true,
        instance: { ...mockInstance, id: "test-instance-2", name: "Archive" },
        sync: "started",
      });

      renderSection();
      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Add Instance"));
      fireEvent.change(screen.getByPlaceholderText("My Stash Server"), {
        target: { value: "Archive" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        { target: { value: "http://archive:9999/graphql" } }
      );
      fireEvent.click(screen.getByText("Add Instance", { selector: "button" }));

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledTimes(2);
      });
      expect(showInfo).not.toHaveBeenCalled();
    });

    it("shows delete button only when multiple instances exist", async () => {
      mockApiGet.mockResolvedValue({
        instances: [
          mockInstance,
          { ...mockInstance, id: "test-instance-2", name: "Second Instance" },
        ],
      });

      renderSection();

      await waitFor(() => {
        expect(screen.getAllByText("Delete")).toHaveLength(2);
      });
    });

    it("the delete confirmation names what is removed and offers Disable instead", async () => {
      mockApiGet.mockResolvedValue({
        instances: [
          mockInstance,
          { ...mockInstance, id: "test-instance-2", name: "Second Instance" },
        ],
      });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      renderSection();
      await waitFor(() => {
        expect(screen.getAllByText("Delete")).toHaveLength(2);
      });
      fireEvent.click(must(screen.getAllByText("Delete")[1], "second Delete"));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete "Second Instance"? Peek removes its cached library and every ' +
          "user's ratings, favorites, watch history, playlist entries and " +
          "hidden items for it. To keep them, disable the instance instead."
      );
      expect(mockApiDelete).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("a 409 shows the server's message", async () => {
      mockApiGet.mockResolvedValue({
        instances: [
          mockInstance,
          { ...mockInstance, id: "test-instance-2", name: "Second Instance" },
        ],
      });
      const message =
        "A sync is running. Wait for it to finish or abort it under Server Configuration → Sync status, then delete again.";
      mockApiDelete.mockRejectedValue(
        new ApiError(message, 409, { error: message })
      );
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderSection();
      await waitFor(() => {
        expect(screen.getAllByText("Delete")).toHaveLength(2);
      });
      fireEvent.click(must(screen.getAllByText("Delete")[1], "second Delete"));

      await waitFor(() => {
        expect(showError).toHaveBeenCalledWith(message);
      });
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/setup/stash-instance/test-instance-2"
      );
      // The list stays, so the admin can delete again once the sync is done
      expect(screen.getAllByText("Delete")).toHaveLength(2);
      expect(showSuccess).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("after an add, an edit, a disable or a delete, the setup status and the library queries are refetched", async () => {
      const second = {
        ...mockInstance,
        id: "test-instance-2",
        name: "Second Instance",
        priority: 1,
      };
      mockApiGet.mockResolvedValue({ instances: [mockInstance, second] });
      mockApiPost.mockResolvedValue({ success: true, sync: "started" });
      mockApiPut.mockResolvedValue({ success: true });
      mockApiDelete.mockResolvedValue({ success: true, message: "Deleted" });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const client = new QueryClient();
      const statusKey = queryKeys.setup.status();
      const listKey = queryKeys.scenes.list(undefined, { page: 1 });
      const statsKey = queryKeys.user.stats();
      /** Fresh data: nothing invalidated */
      const seed = () => {
        client.setQueryData(statusKey, { stashInstanceCount: 2 });
        client.setQueryData(listKey, { findScenes: { scenes: [] } });
        client.setQueryData(statsKey, {});
      };
      const invalidated = (key: readonly unknown[]) =>
        client.getQueryState(key)?.isInvalidated;
      const expectRefreshed = async () => {
        await waitFor(() => {
          expect(invalidated(statusKey)).toBe(true);
        });
        expect(invalidated(listKey)).toBe(true);
        // What the visible set feeds is refreshed with the library
        expect(invalidated(statsKey)).toBe(true);
      };

      renderSection(client);
      await waitFor(() => {
        expect(screen.getAllByText("Delete")).toHaveLength(2);
      });

      // Add
      seed();
      fireEvent.click(screen.getByText("Add Instance"));
      fireEvent.change(screen.getByPlaceholderText("My Stash Server"), {
        target: { value: "Third" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        { target: { value: "http://third:9999/graphql" } }
      );
      fireEvent.click(screen.getByText("Add Instance", { selector: "button" }));
      await expectRefreshed();
      await waitFor(() => {
        expect(screen.getAllByText("Edit")).toHaveLength(2);
      });

      // Edit
      seed();
      fireEvent.click(must(screen.getAllByText("Edit")[1], "second Edit"));
      fireEvent.click(screen.getByText("Save Changes"));
      await expectRefreshed();
      await waitFor(() => {
        expect(screen.getAllByText("Disable")).toHaveLength(2);
      });

      // Disable
      seed();
      fireEvent.click(
        must(screen.getAllByText("Disable")[1], "second Disable")
      );
      await expectRefreshed();

      // Delete
      seed();
      fireEvent.click(must(screen.getAllByText("Delete")[1], "second Delete"));
      await expectRefreshed();
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/setup/stash-instance/test-instance-2"
      );
      confirmSpy.mockRestore();
    });

    it("a refused change refreshes nothing", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      mockApiPut.mockRejectedValue(new ApiError("refused", 400, {}));
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const client = new QueryClient();
      client.setQueryData(queryKeys.setup.status(), { stashInstanceCount: 1 });

      renderSection(client);
      await waitFor(() => {
        expect(screen.getByText("Disable")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Disable"));

      await waitFor(() => {
        expect(showError).toHaveBeenCalledWith("refused");
      });
      expect(
        client.getQueryState(queryKeys.setup.status())?.isInvalidated
      ).toBe(false);
      confirmSpy.mockRestore();
    });

    it("shows Primary badge on first instance when multiple exist", async () => {
      mockApiGet.mockResolvedValue({
        instances: [
          mockInstance,
          {
            ...mockInstance,
            id: "test-instance-2",
            name: "Second Instance",
            priority: 1,
          },
        ],
      });

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Primary")).toBeInTheDocument();
      });
    });

    it("shows the first-sync badge for an instance without firstSyncedAt", async () => {
      mockApiGet.mockResolvedValue({
        instances: [
          mockInstance,
          {
            ...mockInstance,
            id: "test-instance-2",
            name: "New Stash",
            priority: 1,
            firstSyncedAt: null,
          },
        ],
      });

      renderSection();

      const badge = await screen.findByText(
        "First sync running, hidden from users"
      );
      // Only on the new instance's card
      expect(
        screen.getAllByText("First sync running, hidden from users")
      ).toHaveLength(1);
      const card = must(
        screen.getByText("New Stash").closest("div.p-4"),
        "the new instance's card"
      );
      expect(card).toContainElement(badge);
    });

    it("the first-sync badge goes once the first sync has finished", async () => {
      const syncing = {
        ...mockInstance,
        id: "test-instance-2",
        name: "New Stash",
        priority: 1,
        firstSyncedAt: null,
      };
      mockApiGet.mockResolvedValue({ instances: [mockInstance, syncing] });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        renderSection();
        await screen.findByText("First sync running, hidden from users");

        mockApiGet.mockResolvedValue({
          instances: [
            mockInstance,
            { ...syncing, firstSyncedAt: "2024-01-02T00:00:00.000Z" },
          ],
        });
        await vi.advanceTimersByTimeAsync(10_000);

        await waitFor(() => {
          expect(
            screen.queryByText("First sync running, hidden from users")
          ).not.toBeInTheDocument();
        });
        // Quietly: the list stayed on screen
        expect(screen.getByText("New Stash")).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a disabled instance that never synced shows no first-sync badge", async () => {
      mockApiGet.mockResolvedValue({
        instances: [{ ...mockInstance, enabled: false, firstSyncedAt: null }],
      });

      renderSection();

      await screen.findByText("Disabled");
      expect(
        screen.queryByText("First sync running, hidden from users")
      ).not.toBeInTheDocument();
    });
  });

  describe("Non-admin user", () => {
    beforeEach(() => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { role: "USER" },
      });
    });

    it("loads single instance for non-admin users", async () => {
      mockApiGet.mockResolvedValue({ instance: mockInstance });

      renderSection();

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith("/setup/stash-instance");
      });
    });

    it("does not show admin controls for non-admin", async () => {
      mockApiGet.mockResolvedValue({ instance: mockInstance });

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Test Stash")).toBeInTheDocument();
      });

      expect(screen.queryByText("Add Instance")).not.toBeInTheDocument();
      expect(screen.queryByText("Edit")).not.toBeInTheDocument();
      expect(screen.queryByText("Disable")).not.toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { role: "ADMIN" },
      });
    });

    it("displays error message on API failure", async () => {
      mockApiGet.mockRejectedValue(new Error("Connection failed"));

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Connection failed")).toBeInTheDocument();
      });
    });

    it("displays 'No Stash Instance Configured' when no instances", async () => {
      mockApiGet.mockResolvedValue({ instances: [] });

      renderSection();

      await waitFor(() => {
        expect(
          screen.getByText("No Stash Instance Configured")
        ).toBeInTheDocument();
      });
    });
  });

  describe("Test connection", () => {
    beforeEach(() => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { role: "ADMIN" },
      });
    });

    it("tests connection and shows success", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      mockApiPost.mockResolvedValue({ version: "0.25.0" });

      renderSection();

      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Add Instance"));

      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        {
          target: { value: "http://test:9999/graphql" },
        }
      );

      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith(
          "/setup/test-stash-connection",
          {
            url: "http://test:9999/graphql",
            apiKey: undefined,
          }
        );
      });
    });
  });
  describe("Instance form", () => {
    beforeEach(() => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { role: "ADMIN" },
      });
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
    });

    const openAddForm = async () => {
      renderSection();
      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Add Instance"));
    };

    it("refuses to save without a name and a URL, and sends nothing", async () => {
      await openAddForm();

      fireEvent.click(screen.getByText("Add Instance", { selector: "button" }));

      expect(
        await screen.findByText("Name and URL are required")
      ).toBeInTheDocument();
      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it("shows the server's message when saving fails, and keeps the form", async () => {
      mockApiPost.mockRejectedValue(new Error("URL already in use"));
      await openAddForm();
      fireEvent.change(screen.getByPlaceholderText("My Stash Server"), {
        target: { value: "Dup" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        { target: { value: "http://dup:9999/graphql" } }
      );

      fireEvent.click(screen.getByText("Add Instance", { selector: "button" }));

      expect(await screen.findByText("URL already in use")).toBeInTheDocument();
      expect(screen.getByText("Add New Instance")).toBeInTheDocument();
    });

    it("falls back to a generic message when a failed save has none", async () => {
      mockApiPost.mockRejectedValue(new Error(""));
      await openAddForm();
      fireEvent.change(screen.getByPlaceholderText("My Stash Server"), {
        target: { value: "Dup" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        { target: { value: "http://dup:9999/graphql" } }
      );

      fireEvent.click(screen.getByText("Add Instance", { selector: "button" }));

      expect(
        await screen.findByText("Failed to save instance")
      ).toBeInTheDocument();
    });

    it("Cancel closes the form and shows the list again", async () => {
      await openAddForm();
      expect(screen.getByText("Add New Instance")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Cancel"));

      expect(screen.queryByText("Add New Instance")).not.toBeInTheDocument();
      expect(screen.getByText("Test Stash")).toBeInTheDocument();
    });

    it("editing sends the API key only when a new one is typed", async () => {
      mockApiPut.mockResolvedValue({});
      renderSection();
      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Edit"));
      fireEvent.change(screen.getByPlaceholderText("Optional description"), {
        target: { value: "" },
      });

      fireEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledWith(
          "/setup/stash-instance/test-instance-1",
          {
            name: "Test Stash",
            description: null,
            url: "http://localhost:9999/graphql",
            uiUrl: null,
            enabled: true,
            priority: 0,
          }
        );
      });
    });

    it("editing with a new API key sends it", async () => {
      mockApiPut.mockResolvedValue({});
      renderSection();
      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Edit"));
      fireEvent.change(screen.getByPlaceholderText("••••••••"), {
        target: { value: "new-key" },
      });

      fireEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockApiPut).toHaveBeenCalledTimes(1);
      });
      expect(mockApiPut.mock.calls[0]?.[1]).toMatchObject({
        apiKey: "new-key",
      });
    });

    it("Test Connection stays disabled while the URL is empty", async () => {
      await openAddForm();
      // The button is disabled with no URL, so type one and clear it again
      const url = screen.getByPlaceholderText("http://localhost:9999/graphql");
      fireEvent.change(url, { target: { value: "x" } });
      fireEvent.change(url, { target: { value: "" } });

      expect(screen.getByText("Test Connection")).toBeDisabled();
      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it("a successful test names Stash's version and sends the typed key", async () => {
      mockApiPost.mockResolvedValue({ version: "0.25.0" });
      await openAddForm();
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        { target: { value: "http://test:9999/graphql" } }
      );
      fireEvent.change(screen.getByPlaceholderText("Your Stash API key"), {
        target: { value: "secret" },
      });

      fireEvent.click(screen.getByText("Test Connection"));

      expect(
        await screen.findByText("Connected successfully! Stash version: 0.25.0")
      ).toBeInTheDocument();
      expect(mockApiPost).toHaveBeenCalledWith("/setup/test-stash-connection", {
        url: "http://test:9999/graphql",
        apiKey: "secret",
      });
    });

    it("a successful test with no version says unknown", async () => {
      mockApiPost.mockResolvedValue({});
      await openAddForm();
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        { target: { value: "http://test:9999/graphql" } }
      );

      fireEvent.click(screen.getByText("Test Connection"));

      expect(
        await screen.findByText(
          "Connected successfully! Stash version: unknown"
        )
      ).toBeInTheDocument();
    });

    it("a failed test shows the reason, and a reasonless one says Connection failed", async () => {
      mockApiPost.mockRejectedValueOnce(new Error("401 Unauthorized"));
      await openAddForm();
      fireEvent.change(
        screen.getByPlaceholderText("http://localhost:9999/graphql"),
        { target: { value: "http://test:9999/graphql" } }
      );

      fireEvent.click(screen.getByText("Test Connection"));
      expect(await screen.findByText("401 Unauthorized")).toBeInTheDocument();

      mockApiPost.mockRejectedValueOnce(new Error(""));
      fireEvent.click(screen.getByText("Test Connection"));
      expect(await screen.findByText("Connection failed")).toBeInTheDocument();
    });
  });

  describe("Instance list details", () => {
    beforeEach(() => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { role: "ADMIN" },
      });
    });

    it("shows host and port for both URLs, or the raw text when it is not a URL", async () => {
      mockApiGet.mockResolvedValue({
        instances: [
          {
            ...mockInstance,
            url: "https://stash.example.com/graphql",
            uiUrl: "http://ui.example.com:9998",
          },
          {
            ...mockInstance,
            id: "inst-2",
            name: "Odd",
            url: "not a url",
            createdAt: null,
            description: null,
          },
        ],
      });

      renderSection();

      expect(
        await screen.findByText("stash.example.com:443")
      ).toBeInTheDocument();
      expect(screen.getByText("→ ui.example.com:9998")).toBeInTheDocument();
      expect(screen.getByText("not a url")).toBeInTheDocument();
      expect(screen.getByText("Added: N/A")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
    });

    it("a disabled instance shows Disabled and offers Enable", async () => {
      mockApiGet.mockResolvedValue({
        instances: [{ ...mockInstance, enabled: false }],
      });

      renderSection();

      expect(await screen.findByText("Disabled")).toBeInTheDocument();
      expect(screen.getByText("Enable")).toBeInTheDocument();
    });

    it("an admin's list answering without instances shows the empty state", async () => {
      mockApiGet.mockResolvedValue({});

      renderSection();

      expect(
        await screen.findByText("No Stash Instance Configured")
      ).toBeInTheDocument();
    });

    it("a failed load without a message says so", async () => {
      mockApiGet.mockRejectedValue(new Error(""));

      renderSection();

      expect(
        await screen.findByText("Failed to load Stash instances")
      ).toBeInTheDocument();
    });

    it("a non-admin whose answer has no instance sees the empty state", async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        user: { role: "USER" },
      });
      mockApiGet.mockResolvedValue({});

      renderSection();

      expect(
        await screen.findByText("No Stash Instance Configured")
      ).toBeInTheDocument();
    });

    it("a failed delete without a message toasts a generic one", async () => {
      mockApiGet.mockResolvedValue({
        instances: [mockInstance, { ...mockInstance, id: "inst-2", name: "B" }],
      });
      mockApiDelete.mockRejectedValue(new Error(""));
      vi.spyOn(window, "confirm").mockReturnValue(true);

      renderSection();
      await waitFor(() => {
        expect(screen.getAllByText("Delete").length).toBe(2);
      });
      fireEvent.click(must(screen.getAllByText("Delete")[0]));

      await waitFor(() => {
        expect(showError).toHaveBeenCalledWith("Failed to delete instance");
      });
    });
  });
});
