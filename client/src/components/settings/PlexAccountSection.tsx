import { useCallback, useEffect, useState } from "react";
import type { PlexAccountResponse } from "@peek/shared-types/api/auth.js";
import { plexApi } from "../../api/plex";
import PlexSignIn from "../auth/PlexSignIn";

export default function PlexAccountSection({
  onPlexOnly,
}: {
  onPlexOnly?: (value: boolean) => void;
}) {
  const [account, setAccount] = useState<PlexAccountResponse | null>(null);
  const load = useCallback(() => {
    void plexApi<PlexAccountResponse>("/account", undefined, "GET")
      .then((value) => {
        setAccount(value);
        onPlexOnly?.(value.plexOnly);
      })
      .catch(() => {});
  }, [onPlexOnly]);
  useEffect(load, [load]);
  if (!account || (!account.enabled && !account.identity)) return null;
  return (
    <section className="mb-6 space-y-3">
      <h2 className="text-lg font-semibold">Plex account</h2>
      {account.identity ? (
        <p>
          Plex ID: {account.identity.accountId} —{" "}
          {account.identity.approved ? "Approved" : "Approval revoked"}
        </p>
      ) : (
        <>
          <p>
            Link an approved Plex account to keep this profile, history and
            playlists.
          </p>
          <PlexSignIn link onLinked={load} />
        </>
      )}
      {account.plexOnly && (
        <p>
          This profile uses Plex sign-in. Local password recovery is
          unavailable.
        </p>
      )}
    </section>
  );
}
