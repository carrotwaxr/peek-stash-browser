import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import ContentTab from "../../../src/components/settings/tabs/ContentTab.jsx";

// Mock hooks and API
vi.mock("../../../src/hooks/useHiddenEntities.js", () => ({
  useHiddenEntities: () => ({
    hideConfirmationDisabled: false,
    updateHideConfirmation: vi.fn(),
  }),
}));

vi.mock("../../../src/services/api.js", () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}));

import { apiGet } from "../../../src/services/api.js";

describe("ContentTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Content Sources section when multiple instances exist", async () => {
    // API returns data directly (not wrapped in .data)
    apiGet.mockResolvedValue({
      selectedInstanceIds: ["inst-1", "inst-2"],
      availableInstances: [
        { id: "inst-1", name: "Main", description: "Primary" },
        { id: "inst-2", name: "Backup", description: "Archive" },
      ],
    });

    render(
      <BrowserRouter>
        <ContentTab />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Content Sources")).toBeInTheDocument();
      expect(screen.getByText("Main")).toBeInTheDocument();
      expect(screen.getByText("Backup")).toBeInTheDocument();
    });
  });

  it("hides Content Sources section when only one instance exists", async () => {
    apiGet.mockResolvedValue({
      selectedInstanceIds: ["inst-1"],
      availableInstances: [
        { id: "inst-1", name: "Main", description: "Primary" },
      ],
    });

    render(
      <BrowserRouter>
        <ContentTab />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Use getAllByText since "Hidden Items" appears in both header and link
      expect(screen.getAllByText("Hidden Items").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Content Sources")).not.toBeInTheDocument();
  });
});
