import packageJson from "../../../../package.json";
import ServerStatsSection from "../ServerStatsSection";
import StashInstanceSection from "../StashInstanceSection";
import SyncSettingsSection from "../SyncSettingsSection";
import VersionInfoSection from "../VersionInfoSection";

const ServerConfigTab = () => {
  const CLIENT_VERSION = packageJson.version;

  return (
    <div className="space-y-6">
      {/* Stash Instance Section */}
      <StashInstanceSection />

      {/* Sync Settings Section */}
      <SyncSettingsSection />

      {/* Server Statistics Section */}
      <ServerStatsSection />

      {/* Version Information Section */}
      <VersionInfoSection clientVersion={CLIENT_VERSION} />
    </div>
  );
};

export default ServerConfigTab;
