import { useEffect, useState } from "react";
import type { PlexAdminResponse } from "@peek/shared-types/api/auth.js";
import { apiPut } from "../../api";
import { plexApi } from "../../api/plex";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { Button, Paper } from "../ui/index";

export default function PlexAdminSection({
  onUsersChanged,
}: {
  onUsersChanged?: () => void;
}) {
  const [data, setData] = useState<PlexAdminResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const load = async () =>
    setData(await plexApi<PlexAdminResponse>("/admin", undefined, "GET"));
  useEffect(() => {
    void load().catch(() => setMessage("Could not load Plex users."));
  }, []);
  const save = async (path: string, body: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      await plexApi(path, body, "PUT");
      await load();
      onUsersChanged?.();
      setMessage("Saved.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const role = async (id: number, name: string, value: string) => {
    if (
      !(await confirm({
        title:
          value === "ADMIN" ? `Make ${name} an admin?` : `Make ${name} a User?`,
        message:
          value === "ADMIN"
            ? "Admins can manage users and servers, and content restrictions do not apply to them."
            : "They will lose administrator access and their saved content restrictions will apply.",
        confirmText: "Change role",
      }))
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await apiPut(`/user/${id}/role`, { role: value });
      await load();
      onUsersChanged?.();
      setMessage("Role updated.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if ((!data && !message) || (data && !data.enabled)) return null;
  return (
    <Paper className="mb-6">
      <Paper.Header>
        <Paper.Title>Plex users</Paper.Title>
      </Paper.Header>
      <Paper.Body>
        <p className="mb-3">
          Connect and import your Plex server under Server Configuration. New
          users are inactive until you activate them here. Sync preserves the
          roles you assign.
        </p>
        {!data?.identities.length && <p>No Plex accounts imported yet.</p>}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left p-2">Plex user</th>
                <th className="text-left p-2">Server access</th>
                <th className="text-left p-2">Peek access</th>
                <th className="text-left p-2">Role</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.identities.map((identity) => {
                const active =
                  identity.approved &&
                  !identity.user?.disabled &&
                  identity.serverMember;
                const name =
                  identity.username ??
                  identity.user?.username ??
                  identity.accountId;
                const user = identity.user;
                return (
                  <tr key={identity.accountId}>
                    <td className="p-2">
                      {name}
                      <span className="block text-xs">
                        Plex ID: {identity.accountId}
                      </span>
                    </td>
                    <td className="p-2">
                      {identity.serverMember ? "Member" : "No access"}
                    </td>
                    <td className="p-2">{active ? "Active" : "Inactive"}</td>
                    <td className="p-2">
                      {user && (
                        <select
                          aria-label={`Role for ${name}`}
                          value={user.role ?? "USER"}
                          disabled={busy}
                          onChange={(e) =>
                            void role(user.id, name, e.target.value)
                          }
                          style={{
                            background: "var(--bg-card)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="USER">User</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      )}
                    </td>
                    <td className="p-2">
                      <Button
                        disabled={
                          busy || !user || (!active && !identity.serverMember)
                        }
                        onClick={() =>
                          void save("/admin/active", {
                            accountId: identity.accountId,
                            active: !active,
                          })
                        }
                      >
                        {active ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <details className="mt-4">
          <summary>Disable a Peek account across all sign-in methods</summary>
          <p>
            Use this to block local login as well as Plex. Deactivating a linked
            Plex identity leaves local login available.
          </p>
          <ul className="space-y-2 mt-3">
            {data?.users.map((user) => (
              <li key={user.id} className="flex items-center gap-3">
                <span>
                  {user.username}: {user.disabled ? "Disabled" : "Enabled"}
                </span>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void save("/admin/disabled", {
                      userId: user.id,
                      disabled: !user.disabled,
                    })
                  }
                >
                  {user.disabled ? "Enable" : "Disable"}
                </Button>
              </li>
            ))}
          </ul>
        </details>
        {message && (
          <p role="status" className="mt-3">
            {message}
          </p>
        )}
        {dialog}
      </Paper.Body>
    </Paper>
  );
}
