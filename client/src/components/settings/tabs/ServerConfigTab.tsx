import { useCallback, useState } from "react";
import packageJson from "../../../../package.json";
import ServerStatsSection from "../ServerStatsSection";
import StashInstanceSection from "../StashInstanceSection";
import SyncSettingsSection from "../SyncSettingsSection";
import VersionInfoSection from "../VersionInfoSection";

const ServerConfigTab = () => {
  const CLIENT_VERSION = packageJson.version;
  // Syncs the server statistics saw start, so the sync status follows them
  const [syncStarts, setSyncStarts] = useState(0);
  const onSyncStarted = useCallback(() => setSyncStarts((n) => n + 1), []);

  return (
    <div className="space-y-6">
      {/* Stash Instance Section */}
      <StashInstanceSection />

      {/* Sync Settings and Status Section */}
      <SyncSettingsSection syncStarts={syncStarts} />

      {/* Server Statistics Section */}
      <ServerStatsSection onSyncStarted={onSyncStarted} />

      {/* Version Information Section */}
      <VersionInfoSection clientVersion={CLIENT_VERSION} />
    </div>
  );
};

export default ServerConfigTab;
