import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StashInstanceSection from "../../../src/components/settings/StashInstanceSection.jsx";

// Mock useAuth hook
vi.mock("../../../src/hooks/useAuth.js", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../../src/hooks/useAuth.js";

describe("StashInstanceSection", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  const mockInstance = {
    id: "test-instance-1",
    name: "Test Stash",
    description: "Test description",
    url: "http://localhost:9999/graphql",
    enabled: true,
    priority: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Admin user", () => {
    beforeEach(() => {
      useAuth.mockReturnValue({ user: { role: "ADMIN" } });
    });

    it("loads all instances for admin users", async () => {
      mockApi.get.mockResolvedValue({
        data: { instances: [mockInstance] },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith("/setup/stash-instances");
      });
    });

    it("displays instance list with admin controls", async () => {
      mockApi.get.mockResolvedValue({
        data: { instances: [mockInstance] },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("Test Stash")).toBeInTheDocument();
      });

      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Edit")).toBeInTheDocument();
      expect(screen.getByText("Disable")).toBeInTheDocument();
      expect(screen.getByText("Add Instance")).toBeInTheDocument();
    });

    it("shows add form when clicking Add Instance", async () => {
      mockApi.get.mockResolvedValue({
        data: { instances: [mockInstance] },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Add Instance"));

      expect(screen.getByText("Add New Instance")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("My Stash Server")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("http://localhost:9999/graphql")).toBeInTheDocument();
    });

    it("shows edit form when clicking Edit", async () => {
      mockApi.get.mockResolvedValue({
        data: { instances: [mockInstance] },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Edit"));

      expect(screen.getByText("Edit Instance")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test Stash")).toBeInTheDocument();
    });

    it("toggles instance enabled state", async () => {
      mockApi.get.mockResolvedValue({
        data: { instances: [mockInstance] },
      });
      mockApi.put.mockResolvedValue({ data: {} });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("Disable")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Disable"));

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith(
          "/setup/stash-instance/test-instance-1",
          { enabled: false }
        );
      });
    });

    it("creates new instance when form is submitted", async () => {
      mockApi.get.mockResolvedValue({
        data: { instances: [mockInstance] },
      });
      mockApi.post.mockResolvedValue({ data: {} });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Add Instance"));

      fireEvent.change(screen.getByPlaceholderText("My Stash Server"), {
        target: { value: "New Instance" },
      });
      fireEvent.change(screen.getByPlaceholderText("http://localhost:9999/graphql"), {
        target: { value: "http://test:9999/graphql" },
      });

      fireEvent.click(screen.getByText("Add Instance", { selector: "button" }));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith("/setup/stash-instance", {
          name: "New Instance",
          description: null,
          url: "http://test:9999/graphql",
          apiKey: "",
          enabled: true,
          priority: 1,
        });
      });
    });

    it("shows delete button only when multiple instances exist", async () => {
      mockApi.get.mockResolvedValue({
        data: {
          instances: [
            mockInstance,
            { ...mockInstance, id: "test-instance-2", name: "Second Instance" },
          ],
        },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getAllByText("Delete")).toHaveLength(2);
      });
    });

    it("shows Primary badge on first instance when multiple exist", async () => {
      mockApi.get.mockResolvedValue({
        data: {
          instances: [
            mockInstance,
            { ...mockInstance, id: "test-instance-2", name: "Second Instance", priority: 1 },
          ],
        },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("Primary")).toBeInTheDocument();
      });
    });
  });

  describe("Non-admin user", () => {
    beforeEach(() => {
      useAuth.mockReturnValue({ user: { role: "USER" } });
    });

    it("loads single instance for non-admin users", async () => {
      mockApi.get.mockResolvedValue({
        data: { instance: mockInstance },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith("/setup/stash-instance");
      });
    });

    it("does not show admin controls for non-admin", async () => {
      mockApi.get.mockResolvedValue({
        data: { instance: mockInstance },
      });

      render(<StashInstanceSection api={mockApi} />);

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
      useAuth.mockReturnValue({ user: { role: "ADMIN" } });
    });

    it("displays error message on API failure", async () => {
      mockApi.get.mockRejectedValue({
        response: { data: { error: "Connection failed" } },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("Connection failed")).toBeInTheDocument();
      });
    });

    it("displays 'No Stash Instance Configured' when no instances", async () => {
      mockApi.get.mockResolvedValue({
        data: { instances: [] },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("No Stash Instance Configured")).toBeInTheDocument();
      });
    });
  });

  describe("Test connection", () => {
    beforeEach(() => {
      useAuth.mockReturnValue({ user: { role: "ADMIN" } });
    });

    it("tests connection and shows success", async () => {
      mockApi.get.mockResolvedValue({
        data: { instances: [mockInstance] },
      });
      mockApi.post.mockResolvedValue({
        data: { version: "0.25.0" },
      });

      render(<StashInstanceSection api={mockApi} />);

      await waitFor(() => {
        expect(screen.getByText("Add Instance")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Add Instance"));

      fireEvent.change(screen.getByPlaceholderText("http://localhost:9999/graphql"), {
        target: { value: "http://test:9999/graphql" },
      });

      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(mockApi.post).toHaveBeenCalledWith("/setup/test-stash-connection", {
          url: "http://test:9999/graphql",
          apiKey: undefined,
        });
      });
    });
  });
});
