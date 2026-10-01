/**
 * User Management: the users and groups tables around the user and group
 * editors. Every edit is saved as it is made, so closing an editor after a
 * write refreshes the tables in place.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ApiModule from "../../../src/api";
import UserManagementTab from "../../../src/components/settings/tabs/UserManagementTab";
import { ShortcutScopeProvider } from "../../../src/contexts/ShortcutScopeContext";

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  getGroups: vi.fn(),
  getGroup: vi.fn(),
  deleteGroup: vi.fn(),
  addGroupMember: vi.fn(),
  removeGroupMember: vi.fn(),
  getUserGroupMemberships: vi.fn(),
  getUserPermissions: vi.fn(),
  updateUserPermissionOverrides: vi.fn(),
}));

vi.mock("../../../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  ...api,
}));

vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin", role: "ADMIN" } }),
}));

interface UserRow {
  id: number;
  username: string;
  role: string;
  createdAt: string;
  groups: Array<{ id: number; name: string }>;
}

const admin: UserRow = {
  id: 1,
  username: "admin",
  role: "ADMIN",
  createdAt: "2026-01-01T00:00:00.000Z",
  groups: [],
};
const viewer: UserRow = {
  id: 2,
  username: "viewer",
  role: "USER",
  createdAt: "2026-01-02T00:00:00.000Z",
  groups: [],
};
const family = { id: 7, name: "Family", memberCount: 0 };

const permissions = {
  canShare: false,
  canDownloadFiles: false,
  canDownloadPlaylists: false,
  sources: {
    canShare: "default",
    canDownloadFiles: "default",
    canDownloadPlaylists: "default",
  },
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const userRow = (username: string) =>
  must(
    screen.getByText(username, { selector: "span" }).closest("tr"),
    `${username}'s row`
  );

const renderTab = async () => {
  render(
    <ShortcutScopeProvider>
      <UserManagementTab />
    </ShortcutScopeProvider>
  );
  await screen.findByText("viewer", { selector: "span" });
};

const usersLoads = () =>
  api.apiGet.mock.calls.filter(([path]) => path === "/user/all").length;

describe("UserManagementSection", () => {
  beforeEach(() => {
    // A test that fails before its queued answer is used must not leak it
    for (const mock of Object.values(api)) mock.mockReset();
    api.apiGet.mockResolvedValue({ users: [admin, viewer] });
    api.getGroups.mockResolvedValue({ groups: [family] });
    api.getUserGroupMemberships.mockResolvedValue({ groups: [] });
    api.getUserPermissions.mockResolvedValue({ permissions });
    api.addGroupMember.mockResolvedValue({});
  });

  it("closing the user modal after a write reloads the users without unmounting the table", async () => {
    await renderTab();
    const table = must(userRow("viewer").closest("table"), "users table");
    fireEvent.click(
      within(userRow("viewer")).getByRole("button", { name: /Edit/ })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit User: viewer",
    });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    await waitFor(() =>
      expect(api.addGroupMember).toHaveBeenCalledWith("7", 2)
    );

    const reload = deferred<{ users: UserRow[] }>();
    api.apiGet.mockReturnValueOnce(reload.promise);
    fireEvent.click(
      must(
        within(dialog).getAllByRole("button", { name: "Close" }).at(-1),
        "footer Close"
      )
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(usersLoads()).toBe(2);
    // The reload is still pending: the table stays, no spinner replaces it
    expect(table).toBeInTheDocument();

    reload.resolve({
      users: [admin, { ...viewer, groups: [{ id: 7, name: "Family" }] }],
    });
    await waitFor(() =>
      expect(within(userRow("viewer")).getByText("Family")).toBeInTheDocument()
    );
    expect(table).toBeInTheDocument();
  });

  it("closing the user modal with no write reloads nothing", async () => {
    await renderTab();
    fireEvent.click(
      within(userRow("viewer")).getByRole("button", { name: /Edit/ })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit User: viewer",
    });
    fireEvent.click(
      must(
        within(dialog).getAllByRole("button", { name: "Close" }).at(-1),
        "footer Close"
      )
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(usersLoads()).toBe(1);
  });

  it("deleting a user says it was deleted, and nothing after it says updated", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    api.apiDelete.mockResolvedValue({});
    await renderTab();
    fireEvent.click(
      within(userRow("viewer")).getByRole("button", { name: /Edit/ })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit User: viewer",
    });
    api.apiGet.mockResolvedValueOnce({ users: [admin] });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Delete User/ })
    );

    expect(
      await screen.findByText('User "viewer" deleted')
    ).toBeInTheDocument();
    expect(screen.queryByText(/updated/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.apiDelete).toHaveBeenCalledWith("/user/2");
    await waitFor(() =>
      expect(
        screen.queryByText("viewer", { selector: "span" })
      ).not.toBeInTheDocument()
    );
    confirmSpy.mockRestore();
  });

  it("a failed reload keeps the table and shows the error beside it", async () => {
    await renderTab();
    fireEvent.click(
      within(userRow("viewer")).getByRole("button", { name: /Edit/ })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit User: viewer",
    });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    await waitFor(() => expect(api.addGroupMember).toHaveBeenCalled());
    api.apiGet.mockRejectedValueOnce(new Error("Server offline"));
    fireEvent.click(
      must(
        within(dialog).getAllByRole("button", { name: "Close" }).at(-1),
        "footer Close"
      )
    );

    expect(await screen.findByText("Server offline")).toBeInTheDocument();
    expect(userRow("viewer")).toBeInTheDocument();
  });

  it("adding a group member then Cancel reloads the groups and users", async () => {
    api.getGroup.mockResolvedValue({
      group: {
        ...family,
        description: null,
        canShare: false,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        members: [],
      },
    });
    await renderTab();
    const groupRow = must(
      (await screen.findByText("Family", { selector: "td" })).closest("tr"),
      "Family's row"
    );
    fireEvent.click(within(groupRow).getByRole("button", { name: /Edit/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit Group: Family",
    });
    await within(dialog).findByText("Members (0)");
    fireEvent.change(
      within(dialog).getByDisplayValue("Select a user to add..."),
      {
        target: { value: "2" },
      }
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await within(dialog).findByText("Members (1)");
    expect(api.getGroups).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(api.getGroups).toHaveBeenCalledTimes(2));
    expect(usersLoads()).toBe(2);
  });

  it("Cancel on a group with no member change reloads nothing", async () => {
    api.getGroup.mockResolvedValue({
      group: {
        ...family,
        description: null,
        canShare: false,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        members: [],
      },
    });
    await renderTab();
    const groupRow = must(
      (await screen.findByText("Family", { selector: "td" })).closest("tr"),
      "Family's row"
    );
    fireEvent.click(within(groupRow).getByRole("button", { name: /Edit/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit Group: Family",
    });
    await within(dialog).findByText("Members (0)");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.getGroups).toHaveBeenCalledTimes(1);
    expect(usersLoads()).toBe(1);
  });
});
