import axios from "axios";
import packageJson from "../../../../package.json";
import ServerStatsSection from "../ServerStatsSection.jsx";
import StashInstanceSection from "../StashInstanceSection.jsx";
import SyncSettingsSection from "../SyncSettingsSection.jsx";
import VersionInfoSection from "../VersionInfoSection.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const ServerConfigTab = () => {
  const CLIENT_VERSION = packageJson.version;

  return (
    <div className="space-y-6">
      {/* Stash Instance Section */}
      <StashInstanceSection api={api} />

      {/* Sync Settings Section */}
      <SyncSettingsSection />

      {/* Server Statistics Section */}
      <ServerStatsSection />

      {/* Version Information Section */}
      <VersionInfoSection clientVersion={CLIENT_VERSION} api={api} />
    </div>
  );
};

export default ServerConfigTab;
