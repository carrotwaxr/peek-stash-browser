import { useState, useEffect } from "react";
import axios from "axios";
import Paper from "../ui/Paper.jsx";
import Button from "../ui/Button.jsx";
import { Server, Database, HardDrive, Cpu, Clock, RefreshCw } from "lucide-react";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const ServerStatsSection = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingCache, setRefreshingCache] = useState(false);

  const loadStats = async () => {
    try {
      setRefreshing(true);
      const response = await api.get("/stats");
      setStats(response.data);
    } catch (err) {
      console.error("Failed to load server stats:", err);
      // Silently fail - stats are not critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshCache = async () => {
    try {
      setRefreshingCache(true);
      await api.post("/stats/refresh-cache");
      // Wait a moment then reload stats to show refreshing status
      setTimeout(loadStats, 500);
    } catch (err) {
      console.error("Failed to refresh cache:", err);
      // Silently fail - will show error in console
    } finally {
      setRefreshingCache(false);
    }
  };

  useEffect(() => {
    loadStats();
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return null; // Don't show anything while initial load
  }

  if (!stats) {
    return null; // Silently fail if stats unavailable
  }

  return (
    <Paper className="mb-6">
      <Paper.Header>
        <div className="flex items-center justify-between">
          <div>
            <Paper.Title>Server Statistics</Paper.Title>
            <Paper.Subtitle className="mt-1">
              Real-time performance and resource usage
            </Paper.Subtitle>
          </div>
          <Button
            onClick={loadStats}
            disabled={refreshing}
            variant="secondary"
            icon={<RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />}
          />
        </div>
      </Paper.Header>
      <Paper.Body>
        {/* System Resources */}
        <div>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            System Resources
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Uptime"
              value={stats.system?.uptime || "N/A"}
              icon={<Clock className="w-4 h-4" />}
            />
            <StatCard
              label="CPU Cores"
              value={stats.system?.cpuCount || "N/A"}
              icon={<Cpu className="w-4 h-4" />}
            />
            <StatCard
              label="System Memory"
              value={stats.system?.usedMemory || "N/A"}
              subtitle={stats.system?.memoryUsagePercent ? `${stats.system.memoryUsagePercent}%` : null}
              icon={<HardDrive className="w-4 h-4" />}
              progress={parseFloat(stats.system?.memoryUsagePercent || 0)}
            />
            <StatCard
              label="Process Memory"
              value={stats.process?.heapUsed || "N/A"}
              subtitle={stats.process?.heapUsedPercent ? `${stats.process.heapUsedPercent}%` : null}
              icon={<HardDrive className="w-4 h-4" />}
              progress={parseFloat(stats.process?.heapUsedPercent || 0)}
            />
          </div>
        </div>

        <hr className="my-6" style={{ borderColor: "var(--border-color)" }} />

        {/* Cache Statistics */}
        <div>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            Cache Statistics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <StatCard
              label="Scenes"
              value={(stats.cache?.counts?.scenes || 0).toLocaleString()}
              valueColor="var(--accent-primary)"
              compact
            />
            <StatCard
              label="Performers"
              value={(stats.cache?.counts?.performers || 0).toLocaleString()}
              valueColor="var(--accent-primary)"
              compact
            />
            <StatCard
              label="Studios"
              value={(stats.cache?.counts?.studios || 0).toLocaleString()}
              valueColor="var(--accent-primary)"
              compact
            />
            <StatCard
              label="Tags"
              value={(stats.cache?.counts?.tags || 0).toLocaleString()}
              valueColor="var(--accent-primary)"
              compact
            />
          </div>
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
            <span>
              Cache size: {stats.cache?.estimatedSize || "N/A"} |{" "}
              Status: {stats.cache?.isInitialized ? "Ready" : "Initializing"}
              {stats.cache?.isRefreshing && " (Refreshing...)"}
            </span>
            {stats.cache?.lastRefreshed && (
              <div className="flex items-center gap-2">
                <span>
                  Last refreshed: {new Date(stats.cache.lastRefreshed).toLocaleTimeString()}
                </span>
                <button
                  onClick={refreshCache}
                  disabled={refreshingCache || stats.cache?.isRefreshing}
                  className="p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: refreshingCache || stats.cache?.isRefreshing ? 'transparent' : 'transparent',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-info)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="Refresh cache now"
                  aria-label="Refresh cache"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${refreshingCache || stats.cache?.isRefreshing ? "animate-spin" : ""}`}
                    style={{ color: "var(--status-info)" }}
                  />
                </button>
              </div>
            )}
          </div>
        </div>

        <hr className="my-6" style={{ borderColor: "var(--border-color)" }} />

        {/* Database & Transcoding */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Database */}
          <div>
            <h3
              className="text-sm font-semibold mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              Database
            </h3>
            <StatCard
              label="Database Size"
              value={stats.database?.size || "N/A"}
              icon={<Database className="w-4 h-4" />}
            />
          </div>

          {/* Transcoding */}
          <div>
            <h3
              className="text-sm font-semibold mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              Transcoding
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label="Active"
                value={stats.transcoding?.activeSessions || 0}
                valueColor={
                  stats.transcoding?.activeSessions > 0
                    ? "var(--status-success)"
                    : "var(--text-secondary)"
                }
                compact
              />
              <StatCard
                label="Cache"
                value={stats.transcoding?.cacheSize || "0 B"}
                valueColor="var(--text-secondary)"
                compact
              />
            </div>
          </div>
        </div>

        {/* Active Transcoding Sessions */}
        {stats.transcoding?.sessions?.length > 0 && (
          <div>
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              Active Transcoding Sessions
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <th className="text-left p-2" style={{ color: "var(--text-secondary)" }}>
                      Scene
                    </th>
                    <th className="text-left p-2" style={{ color: "var(--text-secondary)" }}>
                      Quality
                    </th>
                    <th className="text-left p-2" style={{ color: "var(--text-secondary)" }}>
                      Age
                    </th>
                    <th className="text-left p-2" style={{ color: "var(--text-secondary)" }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.transcoding.sessions.map((session, idx) => (
                    <tr
                      key={session.sessionId}
                      style={{
                        borderBottom:
                          idx < stats.transcoding.sessions.length - 1
                            ? "1px solid var(--border-color)"
                            : "none",
                      }}
                    >
                      <td
                        className="p-2 font-mono text-xs"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {session.sceneId?.substring(0, 8)}...
                      </td>
                      <td className="p-2" style={{ color: "var(--text-primary)" }}>
                        {session.quality}
                      </td>
                      <td className="p-2" style={{ color: "var(--text-muted)" }}>
                        {session.age}
                      </td>
                      <td className="p-2">
                        <span
                          className="px-2 py-1 rounded text-xs"
                          style={{
                            backgroundColor: session.isActive
                              ? "var(--bg-success)"
                              : "var(--bg-secondary)",
                            color: session.isActive
                              ? "var(--text-success)"
                              : "var(--text-secondary)",
                          }}
                        >
                          {session.isActive ? "Active" : "Idle"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Paper.Body>
    </Paper>
  );
};

// Reusable stat card component
const StatCard = ({ label, value, subtitle, icon, valueColor, progress, compact }) => {
  return (
    <div
      className={`rounded-lg ${compact ? "p-3" : "p-4"}`}
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {icon && !compact && (
        <div className="mb-2" style={{ color: "var(--text-secondary)" }}>
          {icon}
        </div>
      )}
      <div className={`${compact ? "text-xs" : "text-sm"} mb-1`} style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      <div
        className={`${compact ? "text-lg" : "text-2xl"} font-bold mb-1`}
        style={{ color: valueColor || "var(--text-primary)" }}
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      )}
      {progress !== undefined && (
        <div
          className="w-full h-2 rounded-full mt-2 overflow-hidden"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(progress, 100)}%`,
              backgroundColor:
                progress > 90
                  ? "var(--status-error)"
                  : progress > 70
                  ? "var(--status-warning)"
                  : "var(--status-success)",
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ServerStatsSection;
