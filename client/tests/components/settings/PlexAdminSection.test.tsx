import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPut } from "@/api";
import { plexApi } from "@/api/plex";
import PlexAdminSection from "@/components/settings/PlexAdminSection";

vi.mock("@/api/plex", () => ({ plexApi: vi.fn() }));
vi.mock("@/api", () => ({ apiPut: vi.fn() }));
vi.mock("@/hooks/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: () => Promise.resolve(true),
    dialog: null,
  }),
}));
const request = vi.mocked(plexApi);
let active = false;
beforeEach(() => {
  active = false;
  request.mockReset();
  vi.mocked(apiPut).mockReset();
  request.mockImplementation(async (_path, _body, method) => {
    await Promise.resolve();
    return method === "PUT"
      ? { success: true }
      : {
          enabled: true,
          identities: [
            {
              accountId: "12345",
              username: "alice",
              serverMember: true,
              approved: active,
              userId: 2,
              user: {
                id: 2,
                username: "alice",
                disabled: !active,
                role: "USER",
              },
            },
          ],
          users: [{ id: 2, username: "alice", disabled: !active }],
        };
  });
});
describe("Plex administration", () => {
  it("activates imported users without requiring account IDs", async () => {
    render(<PlexAdminSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/admin/active",
        { accountId: "12345", active: true },
        "PUT"
      )
    );
    expect(screen.queryByLabelText("Plex account ID")).toBeNull();
  });
  it("deactivates an account without deleting its profile", async () => {
    active = true;
    render(<PlexAdminSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/admin/active",
        { accountId: "12345", active: false },
        "PUT"
      )
    );
  });
  it("uses Peek's role endpoint after administrator confirmation", async () => {
    render(<PlexAdminSection />);
    fireEvent.change(await screen.findByLabelText("Role for alice"), {
      target: { value: "ADMIN" },
    });
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith("/user/2/role", { role: "ADMIN" })
    );
  });
  it("shows failures from disabling accounts", async () => {
    active = true;
    render(<PlexAdminSection />);
    await screen.findByRole("button", { name: "Disable" });
    request.mockRejectedValueOnce(
      new Error("Keep a local administrator available for recovery")
    );
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Keep a local administrator"
    );
  });
});
