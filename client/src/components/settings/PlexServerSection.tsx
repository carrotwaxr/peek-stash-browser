import { useCallback, useEffect, useState } from "react";
import type { PlexConnectionResponse } from "@peek/shared-types/api/auth.js";
import { plexApi } from "../../api/plex";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import PlexSignIn from "../auth/PlexSignIn";
import { Button, Paper } from "../ui/index";

export default function PlexServerSection() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<PlexConnectionResponse | null>(null);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const load = useCallback(async () => {
    const config = await plexApi<{ enabled: boolean }>(
      "/config",
      undefined,
      "GET"
    );
    setEnabled(config.enabled);
    if (!config.enabled) return;
    const connection = await plexApi<PlexConnectionResponse>(
      "/admin/connection",
      undefined,
      "GET"
    );
    setStatus(connection);
    setSelected(connection.serverId ?? "");
    if (connection.connected) {
      const list = await plexApi<{
        servers: Array<{ id: string; name: string }>;
      }>("/admin/servers", undefined, "GET");
      setServers(list.servers);
    } else setServers([]);
  }, []);
  useEffect(() => {
    void load().catch(() =>
      setMessage("Could not load the Plex connection. Try reconnecting.")
    );
  }, [load]);
  const connected = useCallback(() => {
    void load().catch(() =>
      setMessage("Could not discover servers. Try reconnecting.")
    );
  }, [load]);
  const action = async (path: string, body: unknown = {}) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await plexApi<{ imported?: number; members?: number }>(
        path,
        body
      );
      setMessage(
        result.members !== undefined
          ? `Sync complete: ${result.members} members, ${result.imported ?? 0} new inactive profiles. Manage access under User Management.`
          : "Plex disconnected. Imported profiles and their data have been kept."
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      await load().catch(() => {});
      setBusy(false);
    }
  };
  const toggle = async () => {
    setBusy(true);
    setMessage("");
    try {
      await plexApi("/admin/settings", { enabled: !enabled }, "PUT");
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper>
      <Paper.Header>
        <Paper.Title>Plex server connection</Paper.Title>
      </Paper.Header>
      <Paper.Body>
        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={() => void toggle()}
          />
          Enable Plex integration
        </label>
        {!enabled && (
          <p>
            Enable Plex to connect your server and manage Plex sign-ins. No
            container settings are required.
          </p>
        )}
        {enabled && (
          <>
            <p>
              Connect the full Plex account that owns your server. Users are
              imported as inactive Users. Activate them and assign roles under
              User Management.
            </p>
            {status?.connected && (
              <p className="my-3">
                Connected as {status.ownerName}. Selected server:{" "}
                {status.serverName ?? "None"}.
              </p>
            )}
            <PlexSignIn connect onLinked={connected} />
            {status?.connected && (
              <div className="space-y-3 mt-4">
                <label className="block">
                  Plex Media Server
                  <select
                    aria-label="Plex Media Server"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={busy}
                    className="block p-2 rounded"
                    style={{
                      background: "var(--bg-card)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="">Select a server</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  disabled={busy || !selected}
                  onClick={() =>
                    void (async () => {
                      if (
                        status.serverId &&
                        selected !== status.serverId &&
                        !(await confirm({
                          title: "Change Plex server?",
                          message:
                            "All Plex users become inactive and must be activated again after importing the new server's users.",
                          confirmText: "Change server",
                        }))
                      )
                        return;
                      await action("/admin/server", { serverId: selected });
                    })()
                  }
                >
                  Select server and import users
                </Button>
                <Button
                  disabled={busy || !status.serverId}
                  onClick={() => void action("/admin/sync")}
                >
                  Sync now
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      if (
                        await confirm({
                          title: "Disconnect Plex?",
                          message:
                            "Plex sign-ins will stop and imported users become inactive. Local administrator login stays available.",
                          confirmText: "Disconnect",
                        })
                      )
                        await action("/admin/disconnect");
                    })()
                  }
                >
                  Disconnect Plex
                </Button>
                <p>
                  Automatic sync every 30 minutes. Last successful sync:{" "}
                  {status.lastSyncedAt
                    ? new Date(status.lastSyncedAt).toLocaleString()
                    : "Never"}
                  .
                </p>
                {status.lastError && <p role="alert">{status.lastError}</p>}
              </div>
            )}
          </>
        )}
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
