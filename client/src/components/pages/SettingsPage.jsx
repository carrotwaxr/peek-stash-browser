import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import SectionSelector from "../settings/SectionSelector.jsx";
import SettingsLayout from "../settings/SettingsLayout.jsx";
import { PageHeader, PageLayout } from "../ui/index.js";
import ThemeTab from "../settings/tabs/ThemeTab.jsx";
import PlaybackTab from "../settings/tabs/PlaybackTab.jsx";
import CustomizationTab from "../settings/tabs/CustomizationTab.jsx";
import ContentTab from "../settings/tabs/ContentTab.jsx";
import AccountTab from "../settings/tabs/AccountTab.jsx";
import NavigationTab from "../settings/tabs/NavigationTab.jsx";
import UserManagementTab from "../settings/tabs/UserManagementTab.jsx";
import ServerConfigTab from "../settings/tabs/ServerConfigTab.jsx";

// Tab definitions
const USER_TABS = [
  { id: "theme", label: "Theme" },
  { id: "playback", label: "Playback" },
  { id: "customization", label: "Customization" },
  { id: "navigation", label: "Navigation" },
  { id: "content", label: "Content" },
  { id: "account", label: "Account" },
];

const SERVER_TABS = [
  { id: "server-config", label: "Server Configuration" },
  { id: "user-management", label: "User Management" },
];

const SettingsPage = () => {
  usePageTitle("Settings");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Parse URL parameters
  const sectionParam = searchParams.get("section") || "user";
  const validSection = ["user", "server"].includes(sectionParam) ? sectionParam : "user";
  const tabParam = searchParams.get("tab");

  // Determine active section (redirect non-admins from server section)
  const isAdmin = user?.role === "ADMIN";
  const activeSection = validSection === "server" && !isAdmin ? "user" : validSection;

  // Redirect if non-admin tries to access server section
  useEffect(() => {
    if (sectionParam === "server" && !isAdmin) {
      navigate("/settings?section=user&tab=theme", { replace: true });
    }
  }, [sectionParam, isAdmin, navigate]);

  // Determine active tab (default to first tab of section if invalid)
  const tabs = activeSection === "user" ? USER_TABS : SERVER_TABS;
  const defaultTab = tabs[0].id;
  const activeTab = tabParam && tabs.some((t) => t.id === tabParam) ? tabParam : defaultTab;

  // Sync URL if tab param is missing or invalid
  useEffect(() => {
    if (!tabParam || !tabs.some((t) => t.id === tabParam)) {
      const params = new URLSearchParams();
      params.set("section", activeSection);
      params.set("tab", defaultTab);
      navigate(`/settings?${params.toString()}`, { replace: true });
    }
  }, [tabParam, activeSection, defaultTab, tabs, navigate]);

  // Handle section change
  const handleSectionChange = (newSection) => {
    const newDefaultTab = newSection === "user" ? USER_TABS[0].id : SERVER_TABS[0].id;
    navigate(`/settings?section=${newSection}&tab=${newDefaultTab}`, { replace: true });
  };

  // Handle tab change
  const handleTabChange = (newTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", newTab);
    navigate(`/settings?${params.toString()}`, { replace: true });
  };

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Settings"
          subtitle="Manage your preferences and server configuration"
        />

        {/* Section Selector (User/Server) */}
        <SectionSelector
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          isAdmin={isAdmin}
        />

        {/* Tab Navigation and Content */}
        <SettingsLayout
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        >
          {/* Render active tab content */}
          {activeSection === "user" && (
            <>
              {activeTab === "theme" && <ThemeTab />}
              {activeTab === "playback" && <PlaybackTab />}
              {activeTab === "customization" && <CustomizationTab />}
              {activeTab === "content" && <ContentTab />}
              {activeTab === "account" && <AccountTab />}
              {activeTab === "navigation" && <NavigationTab />}
            </>
          )}

          {activeSection === "server" && (
            <>
              {activeTab === "server-config" && <ServerConfigTab />}
              {activeTab === "user-management" && <UserManagementTab />}
            </>
          )}
        </SettingsLayout>
      </div>
    </PageLayout>
  );
};

export default SettingsPage;
