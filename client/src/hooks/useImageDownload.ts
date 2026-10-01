import { useCallback, useState } from "react";
import { apiPost } from "../api";
import { useInvalidateDownloads } from "../api/hooks/useDownloads";
import { useMyPermissions } from "../api/hooks/useMyPermissions";
import { showError, showSuccess } from "../utils/toast";

interface DownloadableImage {
  id: string;
  instanceId: string;
}

interface DownloadResponse {
  download: { id: number | string; status: string };
}

/**
 * Download an image from the lightbox, as PlaybackControls downloads a scene:
 * ask for a download on the image's own instance, then open its file route
 * (the server answers with Content-Disposition: attachment).
 *
 * The server decides who may download what (Can Download Files, and the user's
 * exclusions); `canDownload` only decides whether to show the button.
 *
 * @param enabled - fetch the permission only while the lightbox is open
 */
export function useImageDownload(enabled: boolean) {
  const [downloading, setDownloading] = useState(false);
  const invalidateDownloads = useInvalidateDownloads();

  // Without the permission (or while it loads) the button stays hidden
  const { data: permissions } = useMyPermissions(enabled);
  const canDownload = !!permissions?.canDownloadFiles;

  const download = useCallback(
    async (image: DownloadableImage) => {
      setDownloading(true);
      try {
        const response = await apiPost<DownloadResponse>(
          `/downloads/image/${encodeURIComponent(image.id)}`,
          { instanceId: image.instanceId }
        );
        void invalidateDownloads();
        window.location.href = `/api/downloads/${response.download.id}/file`;
        showSuccess("Download started");
      } catch (error) {
        const err = error as { data?: { error?: string }; message?: string };
        showError(err.data?.error ?? err.message ?? "Download failed");
      } finally {
        setDownloading(false);
      }
    },
    [invalidateDownloads]
  );

  return { canDownload, downloading, download };
}
