import { useEffect, useState } from "react";
import { Paper } from "../ui/index.js";

const StashInstanceSection = ({ api }) => {
  const [instance, setInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStashInstance();
  }, []);

  const loadStashInstance = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/setup/stash-instance");
      setInstance(response.data.instance);
    } catch (err) {
      console.error("Failed to load Stash instance:", err);
      setError(err.response?.data?.error || "Failed to load Stash instance");
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  // Extract hostname from URL for display
  const getDisplayUrl = (url) => {
    if (!url) return "N/A";
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
    } catch {
      return url;
    }
  };

  return (
    <Paper className="mb-6">
      <Paper.Header>
        <div>
          <Paper.Title>Stash Connection</Paper.Title>
          <Paper.Subtitle className="mt-1">
            Connected Stash server configuration
          </Paper.Subtitle>
        </div>
      </Paper.Header>
      <Paper.Body>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : error ? (
          <div
            className="p-3 rounded-lg text-sm"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "rgb(239, 68, 68)",
            }}
          >
            {error}
          </div>
        ) : instance ? (
          <div className="space-y-4">
            {/* Instance Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Instance Name
                </p>
                <p
                  className="text-lg"
                  style={{ color: "var(--text-primary)" }}
                >
                  {instance.name}
                </p>
              </div>
              <div>
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Server
                </p>
                <p
                  className="text-lg font-mono"
                  style={{ color: "var(--text-primary)" }}
                >
                  {getDisplayUrl(instance.url)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Status
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      instance.enabled ? "bg-green-500" : "bg-red-500"
                    }`}
                  ></span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {instance.enabled ? "Connected" : "Disabled"}
                  </span>
                </div>
              </div>
              <div>
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Connected Since
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatDate(instance.createdAt)}
                </p>
              </div>
            </div>

            {/* Info Note */}
            <div
              className="p-3 rounded-lg text-sm mt-4"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                color: "var(--text-secondary)",
              }}
            >
              Stash connection is configured. Multi-instance support coming in a
              future update.
            </div>
          </div>
        ) : (
          <div
            className="p-4 rounded-lg text-center"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "rgb(239, 68, 68)",
            }}
          >
            <p className="font-medium">No Stash Instance Configured</p>
            <p className="text-sm mt-1 opacity-80">
              Please complete the setup wizard to connect to a Stash server.
            </p>
          </div>
        )}
      </Paper.Body>
    </Paper>
  );
};

export default StashInstanceSection;
