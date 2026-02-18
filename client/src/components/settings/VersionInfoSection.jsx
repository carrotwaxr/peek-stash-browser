import { useCallback, useEffect, useState } from "react";
import { Button, Paper } from "../ui/index.js";

const VersionInfoSection = ({ clientVersion, api }) => {
  const [serverVersion, setServerVersion] = useState(null);
  const [latestVersion, setLatestVersion] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState(null);

  const loadServerVersion = useCallback(async () => {
    try {
      const response = await api.get("/version");
      setServerVersion(response.data.server);
    } catch (err) {
      console.error("Failed to load server version:", err);
    }
  }, [api]);

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

      const data = await response.json();
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
    loadServerVersion();
    checkForUpdates();
  }, [loadServerVersion, checkForUpdates]);

  const parseVersion = (v) => {
    const [core, pre] = v.split("-");
    const parts = core.split(".").map(Number);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0, pre: pre || null };
  };

  const compareVersions = (current, latest) => {
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

  const hasUpdate = latestVersion && compareVersions(clientVersion, latestVersion);
  const isUpToDate = latestVersion && !compareVersions(clientVersion, latestVersion);

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
            onClick={checkForUpdates}
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
            <div
              className="p-4 rounded-lg"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
              }}
            >
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 flex-shrink-0 mt-0.5"
                  style={{ color: "rgb(59, 130, 246)" }}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <p
                    className="font-medium mb-1"
                    style={{ color: "rgb(59, 130, 246)" }}
                  >
                    Update Available
                  </p>
                  <p
                    className="text-sm mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Version {latestVersion} is now available. You're running
                    version {clientVersion}.
                  </p>
                  <a
                    href="https://github.com/carrotwaxr/peek-stash-browser/releases/latest"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium inline-flex items-center gap-1 hover:underline"
                    style={{ color: "rgb(59, 130, 246)" }}
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
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {updateError && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "rgb(239, 68, 68)",
              }}
            >
              {updateError}
            </div>
          )}

          {/* Up to Date */}
          {isUpToDate && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                color: "rgb(34, 197, 94)",
              }}
            >
              {clientVersion.includes("-")
                ? `You're running a pre-release version (ahead of latest stable v${latestVersion})`
                : "You're running the latest version"}
            </div>
          )}
        </div>
      </Paper.Body>
    </Paper>
  );
};

export default VersionInfoSection;
