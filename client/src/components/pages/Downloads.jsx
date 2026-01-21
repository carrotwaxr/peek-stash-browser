import { useEffect, useState, useCallback, useRef } from "react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { showError, showSuccess } from "../../utils/toast.jsx";
import { apiGet, apiPost, apiDelete } from "../../services/api.js";
import { Button, PageHeader, PageLayout } from "../ui/index.js";

/**
 * Format bytes to human readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
const formatSize = (bytes) => {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
};

/**
 * Format ISO date string to locale string
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date string
 */
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleString();
};

/**
 * Get display name from fileName (strip extension for cleaner display)
 * @param {string} fileName - File name with extension
 * @returns {string} Display name without extension
 */
const getDisplayName = (fileName) => {
  if (!fileName) return "Untitled";
  // Remove extension for display
  return fileName.replace(/\.[^/.]+$/, "") || "Untitled";
};

/**
 * Get colored badge for download status
 * @param {string} status - Download status
 * @returns {JSX.Element} Status badge
 */
const getStatusBadge = (status) => {
  const statusStyles = {
    PENDING: {
      backgroundColor: "rgba(59, 130, 246, 0.2)",
      color: "rgb(59, 130, 246)",
      text: "Pending",
    },
    PROCESSING: {
      backgroundColor: "rgba(234, 179, 8, 0.2)",
      color: "rgb(234, 179, 8)",
      text: "Processing",
    },
    COMPLETED: {
      backgroundColor: "rgba(34, 197, 94, 0.2)",
      color: "rgb(34, 197, 94)",
      text: "Completed",
    },
    FAILED: {
      backgroundColor: "rgba(239, 68, 68, 0.2)",
      color: "rgb(239, 68, 68)",
      text: "Failed",
    },
  };

  const style = statusStyles[status] || statusStyles.PENDING;

  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
      }}
    >
      {style.text}
    </span>
  );
};

/**
 * Get thumbnail or icon for download
 * @param {Object} download - Download object
 * @returns {JSX.Element} Thumbnail or type icon
 */
const getDownloadThumbnail = (download) => {
  // For scenes and images, show actual thumbnail
  if (download.type === "SCENE" && download.entityId) {
    return (
      <div className="flex-shrink-0 w-16 h-10 rounded overflow-hidden bg-black">
        <img
          src={`/api/proxy/stash?path=${encodeURIComponent(`/scene/${download.entityId}/screenshot`)}`}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.style.display = "none";
            e.target.parentElement.classList.add("flex", "items-center", "justify-center");
            e.target.parentElement.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--text-muted)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>`;
          }}
        />
      </div>
    );
  }

  if (download.type === "IMAGE" && download.entityId) {
    return (
      <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-black">
        <img
          src={`/api/proxy/image/${download.entityId}/thumbnail`}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.style.display = "none";
            e.target.parentElement.classList.add("flex", "items-center", "justify-center");
            e.target.parentElement.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--text-muted)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>`;
          }}
        />
      </div>
    );
  }

  // Fallback icons for playlists and unknown types
  const icons = {
    PLAYLIST: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 10h16M4 14h16M4 18h16"
        />
      </svg>
    ),
    SCENE: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    ),
  };

  return (
    <div
      className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
      style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
    >
      {icons[download.type] || icons.SCENE}
    </div>
  );
};

const Downloads = () => {
  usePageTitle("Downloads");
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const pollIntervalRef = useRef(null);

  const loadDownloads = useCallback(async () => {
    try {
      const response = await apiGet("/downloads");
      setDownloads(response.downloads || []);
    } catch {
      showError("Failed to load downloads");
    } finally {
      setLoading(false);
    }
  }, []);

  // Check if there are active downloads
  const hasActiveDownloads = downloads.some(
    (d) => d.status === "PENDING" || d.status === "PROCESSING"
  );

  // Set up polling when there are active downloads
  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  useEffect(() => {
    if (hasActiveDownloads) {
      pollIntervalRef.current = setInterval(loadDownloads, 3000);
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [hasActiveDownloads, loadDownloads]);

  const handleDelete = async (id) => {
    try {
      await apiDelete(`/downloads/${id}`);
      showSuccess("Download removed");
      loadDownloads();
    } catch {
      showError("Failed to delete download");
    }
  };

  const handleRetry = async (id) => {
    try {
      await apiPost(`/downloads/${id}/retry`);
      showSuccess("Download queued for retry");
      loadDownloads();
    } catch {
      showError("Failed to retry download");
    }
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <PageHeader
          title="Downloads"
          subtitle="Manage your offline downloads"
        />
      </div>

      {/* Downloads List */}
      {downloads.length === 0 ? (
        <div className="text-center py-16">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "var(--text-muted)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </div>
          <h3
            className="text-xl font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            No downloads yet
          </h3>
          <p style={{ color: "var(--text-secondary)" }}>
            Downloads you create will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {downloads.map((download) => (
            <div
              key={download.id}
              className="p-4 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div className="flex items-start gap-4">
                {/* Thumbnail or Type Icon */}
                {getDownloadThumbnail(download)}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {getDisplayName(download.fileName)}
                    </span>
                    {getStatusBadge(download.status)}
                  </div>

                  <div
                    className="text-sm flex items-center gap-3 flex-wrap"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {download.fileSize && (
                      <span>{formatSize(download.fileSize)}</span>
                    )}
                    <span>{formatDate(download.createdAt)}</span>
                  </div>

                  {/* Progress bar for active downloads */}
                  {(download.status === "PENDING" ||
                    download.status === "PROCESSING") &&
                    download.progress !== undefined && (
                      <div className="mt-2">
                        <div
                          className="h-2 rounded-full overflow-hidden"
                          style={{ backgroundColor: "var(--bg-tertiary)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${download.progress || 0}%`,
                              backgroundColor: "var(--accent-primary)",
                            }}
                          />
                        </div>
                        <div
                          className="text-xs mt-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {download.progress || 0}%
                        </div>
                      </div>
                    )}

                  {/* Error message for failed downloads */}
                  {download.status === "FAILED" && download.error && (
                    <div
                      className="mt-2 text-sm p-2 rounded"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        color: "rgb(239, 68, 68)",
                      }}
                    >
                      {download.error}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Download button for completed */}
                  {download.status === "COMPLETED" && (
                    <a
                      href={`/api/downloads/${download.id}/file`}
                      download={download.fileName}
                      className="inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg font-medium transition-all"
                      style={{
                        backgroundColor: "var(--accent-primary)",
                        color: "white",
                      }}
                    >
                      Download
                    </a>
                  )}

                  {/* Retry button for failed */}
                  {download.status === "FAILED" && (
                    <Button
                      onClick={() => handleRetry(download.id)}
                      variant="secondary"
                      size="sm"
                    >
                      Retry
                    </Button>
                  )}

                  {/* Delete button for all */}
                  <Button
                    onClick={() => handleDelete(download.id)}
                    variant="destructive"
                    size="sm"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
};

export default Downloads;
