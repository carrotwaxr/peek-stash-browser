import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api";
import { Button, Paper, StatusMessage } from "../ui/index";

interface Props {
  clientVersion: string;
}

/** The field read from GitHub's latest-release response */
interface GitHubRelease {
  tag_name: string;
}

const VersionInfoSection = ({ clientVersion }: Props) => {
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const loadServerVersion = useCallback(async () => {
    try {
      const data = await apiGet<{ server: string }>("/version");
      setServerVersion(data.server);
    } catch (err) {
      console.error("Failed to load server version:", err);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    setCheckingUpdate(true);
    setUpdateError(null);

    try {
      const response = await fetch(
        "https://api.github.com/repos/carrotwaxr/peek-stash-browser/releases/latest"
      );

      if (!response.ok) {
        if (response.status === 404) {
          setUpdateError("No releases available yet");
        } else {
          setUpdateError(`GitHub API error: ${response.status}`);
        }
        return;
      }

      const data = (await response.json()) as GitHubRelease;
      const latestTag = data.tag_name.replace("v", "");
      setLatestVersion(latestTag);
    } catch (err) {
      console.error("Failed to check for updates:", err);
      setUpdateError("Network error - could not reach GitHub");
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    void loadServerVersion();
    void checkForUpdates();
  }, [loadServerVersion, checkForUpdates]);

  const parseVersion = (v: string) => {
    // split() always returns at least one part, so the default never applies
    const [core = "", pre] = v.split("-");
    const parts = core.split(".").map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
      pre: pre || null,
    };
  };

  const compareVersions = (current: string, latest: string) => {
    if (!current || !latest) return false;
    const c = parseVersion(current);
    const l = parseVersion(latest);
    if (l.major !== c.major) return l.major > c.major;
    if (l.minor !== c.minor) return l.minor > c.minor;
    if (l.patch !== c.patch) return l.patch > c.patch;
    // Same core version: stable (no pre) is newer than pre-release
    if (c.pre && !l.pre) return true;
    return false;
  };

  const hasUpdate =
    latestVersion && compareVersions(clientVersion, latestVersion);
  const isUpToDate =
    latestVersion && !compareVersions(clientVersion, latestVersion);

  return (
    <Paper className="mb-6">
      <Paper.Header>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Paper.Title>Version Information</Paper.Title>
            <Paper.Subtitle className="mt-1">
              Current versions and update status
            </Paper.Subtitle>
          </div>
          <Button
            onClick={() => void checkForUpdates()}
            disabled={checkingUpdate}
            variant="secondary"
            loading={checkingUpdate}
            className="w-full md:w-auto"
          >
            Check for Updates
          </Button>
        </div>
      </Paper.Header>
      <Paper.Body>
        <div className="space-y-4">
          {/* Version Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p
                className="text-sm font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Client Version
              </p>
              <p
                className="text-lg font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {clientVersion}
              </p>
            </div>
            <div>
              <p
                className="text-sm font-medium mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Server Version
              </p>
              <p
                className="text-lg font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {serverVersion || "Loading..."}
              </p>
            </div>
          </div>

          {/* Update Available */}
          {hasUpdate && (
            <StatusMessage variant="info" title={null}>
              <p
                className="font-medium mb-1"
                style={{ color: "var(--status-info)" }}
              >
                Update Available
              </p>
              <span className="block text-sm mb-2">
                Version {latestVersion} is now available. You're running version{" "}
                {clientVersion}.
              </span>
              <a
                href="https://github.com/carrotwaxr/peek-stash-browser/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium inline-flex items-center gap-1 hover:underline"
                style={{ color: "var(--status-info)" }}
              >
                View Release Notes
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </StatusMessage>
          )}

          {/* Error State */}
          {updateError && (
            <StatusMessage
              variant="error"
              title={null}
              className="text-sm"
              message={updateError}
            />
          )}

          {/* Up to Date */}
          {isUpToDate && (
            <StatusMessage
              variant="success"
              title={null}
              className="text-sm"
              message={
                clientVersion.includes("-")
                  ? `You're running a pre-release version (ahead of latest stable v${latestVersion})`
                  : "You're running the latest version"
              }
            />
          )}
        </div>
      </Paper.Body>
    </Paper>
  );
};

export default VersionInfoSection;
