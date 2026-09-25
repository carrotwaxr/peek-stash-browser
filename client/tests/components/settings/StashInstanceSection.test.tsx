import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/api/client";
import StashInstanceSection from "../../../src/components/settings/StashInstanceSection";
import { useAuth } from "../../../src/hooks/useAuth";
import { showError, showSuccess } from "../../../src/utils/toast";

vi.mock("../../../src/utils/toast", () => ({
  showError: vi.fn(),
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

      render(<StashInstanceSection />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith("/setup/stash-instances");
      });
    });

    it("displays instance list with admin controls", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });

      render(<StashInstanceSection />);

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

      render(<StashInstanceSection />);

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

      render(<StashInstanceSection />);

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

      render(<StashInstanceSection />);

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
    });

    it("creates new instance when form is submitted", async () => {
      mockApiGet.mockResolvedValue({ instances: [mockInstance] });
      mockApiPost.mockResolvedValue({});

      render(<StashInstanceSection />);

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

    it("shows delete button only when multiple instances exist", async () => {
      mockApiGet.mockResolvedValue({
        instances: [
          mockInstance,
          { ...mockInstance, id: "test-instance-2", name: "Second Instance" },
        ],
      });

      render(<StashInstanceSection />);

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

      render(<StashInstanceSection />);
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

      render(<StashInstanceSection />);
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

      render(<StashInstanceSection />);

      await waitFor(() => {
        expect(screen.getByText("Primary")).toBeInTheDocument();
      });
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

      render(<StashInstanceSection />);

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith("/setup/stash-instance");
      });
    });

    it("does not show admin controls for non-admin", async () => {
      mockApiGet.mockResolvedValue({ instance: mockInstance });

      render(<StashInstanceSection />);

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

      render(<StashInstanceSection />);

      await waitFor(() => {
        expect(screen.getByText("Connection failed")).toBeInTheDocument();
      });
    });

    it("displays 'No Stash Instance Configured' when no instances", async () => {
      mockApiGet.mockResolvedValue({ instances: [] });

      render(<StashInstanceSection />);

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

      render(<StashInstanceSection />);

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
});
