import { useEffect, useRef, useState } from "react";
import type {
  PlexFlowResponse,
  PlexPollResponse,
} from "@peek/shared-types/api/auth.js";
import { REDIRECT_STORAGE_KEY } from "../../api";
import { plexApi } from "../../api/plex";
import { getLandingPage } from "../../constants/navigation";
import Button from "../ui/Button";

export default function PlexSignIn({
  link = false,
  onLinked,
  connect = false,
}: {
  link?: boolean;
  onLinked?: () => void;
  connect?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [flow, setFlow] = useState<PlexFlowResponse | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef<PlexFlowResponse | null>(null);
  useEffect(() => {
    let mounted = true;
    void plexApi<{ enabled: boolean }>("/config", undefined, "GET")
      .then((value) => {
        if (mounted) setEnabled(value.enabled);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!flow) return;
    active.current = flow;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() >= Date.parse(flow.expiresAt)) {
        active.current = null;
        setFlow(null);
        setMessage("Plex sign-in expired. Please start again.");
        return;
      }
      try {
        const result = await plexApi<PlexPollResponse>(
          connect ? "/admin/connect/poll" : link ? "/link/poll" : "/poll",
          { correlationId: flow.correlationId }
        );
        if (stopped) return;
        if (result.status === "pending") {
          timer = setTimeout(() => void poll(), 2500);
          return;
        }
        active.current = null;
        setFlow(null);
        if (result.status === "connected") {
          setMessage("Plex owner account connected. Select your server below.");
          onLinked?.();
          return;
        }
        if (link) {
          setMessage("Plex account linked.");
          onLinked?.();
          return;
        }
        const redirect = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
        sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
        window.location.assign(
          redirect?.startsWith("/") && !redirect.startsWith("//")
            ? redirect
            : getLandingPage(result.landingPagePreference)
        );
      } catch (error) {
        if (!stopped) {
          active.current = null;
          setFlow(null);
          setMessage((error as Error).message);
        }
      }
    };
    timer = setTimeout(() => void poll(), 2500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [flow, link, connect, onLinked]);

  useEffect(
    () => () => {
      const current = active.current;
      if (current)
        void plexApi("/cancel", { correlationId: current.correlationId }).catch(
          () => {}
        );
    },
    []
  );

  if (!enabled) return null;
  const start = async () => {
    setBusy(true);
    setMessage("");
    try {
      setFlow(
        await plexApi<PlexFlowResponse>(
          connect ? "/admin/connect/start" : link ? "/link/start" : "/start",
          link ? { password } : {}
        )
      );
      setPassword("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    const current = flow;
    active.current = null;
    setFlow(null);
    setMessage("Plex sign-in cancelled.");
    if (current)
      await plexApi("/cancel", { correlationId: current.correlationId }).catch(
        () => {}
      );
  };
  return (
    <div className="space-y-3 mt-4">
      {flow ? (
        <>
          <p role="status">
            Waiting for Plex authorization. Complete sign-in in the new tab,
            then return here.
          </p>
          <a
            className="underline"
            href={flow.authorizationUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Plex to authorize
          </a>
          <Button type="button" onClick={() => void cancel()}>
            Cancel Plex sign-in
          </Button>
        </>
      ) : (
        <>
          {link && (
            <input
              aria-label="Current local password for Plex linking"
              type="password"
              autoComplete="current-password"
              className="p-2 rounded text-black bg-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Current local password"
            />
          )}
          <Button
            type="button"
            fullWidth
            loading={busy}
            onClick={() => void start()}
          >
            {connect
              ? "Connect Plex owner account"
              : link
                ? "Link Plex account"
                : "Sign in with Plex"}
          </Button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
