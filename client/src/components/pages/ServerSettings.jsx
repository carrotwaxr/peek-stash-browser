import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import packageJson from "../../../package.json";
import { useAuth } from "../../hooks/useAuth.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import ServerStatsSection from "../settings/ServerStatsSection.jsx";
import StashInstanceSection from "../settings/StashInstanceSection.jsx";
import UserManagementSection from "../settings/UserManagementSection.jsx";
import VersionInfoSection from "../settings/VersionInfoSection.jsx";
import { PageHeader, PageLayout } from "../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const ServerSettings = () => {
  usePageTitle("Server Settings");
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const CLIENT_VERSION = packageJson.version;

  useEffect(() => {
    // Redirect if not admin
    if (currentUser && currentUser.role !== "ADMIN") {
      navigate("/");
      return;
    }

    loadUsers();
  }, [currentUser, navigate]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/user/all");
      setUsers(response.data.users || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const showError = (err) => {
    setError(err);
    setTimeout(() => setError(null), 5000);
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <PageHeader
          title="Server Settings"
          subtitle="Manage server configuration and user accounts"
        />

        {/* Messages */}
        {message && (
          <div
            className="mb-6 p-4 rounded-lg"
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "rgb(34, 197, 94)",
            }}
          >
            {message}
          </div>
        )}

        {error && (
          <div
            className="mb-6 p-4 rounded-lg"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "rgb(239, 68, 68)",
            }}
          >
            {error}
          </div>
        )}

        {/* User Management Section */}
        <UserManagementSection
          users={users}
          currentUser={currentUser}
          onUsersChanged={loadUsers}
          onMessage={showMessage}
          onError={showError}
          api={api}
        />

        {/* Stash Instance Section */}
        <StashInstanceSection api={api} />

        {/* Server Statistics Section */}
        <ServerStatsSection />

        {/* Version Information Section */}
        <VersionInfoSection clientVersion={CLIENT_VERSION} api={api} />
      </div>
    </PageLayout>
  );
};

export default ServerSettings;
