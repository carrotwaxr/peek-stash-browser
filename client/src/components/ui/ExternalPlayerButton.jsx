import { ExternalLink } from "lucide-react";

/**
 * Button to open the current scene in an external media player.
 *
 * Mobile (Android/iOS): Opens directly in external player using platform-specific URL schemes
 * - Android: Uses Intent URIs to launch any video player
 * - iOS: Uses VLC's x-callback-url scheme
 *
 * Desktop: Uses vlc:// protocol (requires protocol handler to be installed)
 *
 * Implementation based on Stash's ExternalPlayerButton:
 * https://github.com/stashapp/stash/blob/develop/ui/v2.5/src/components/Scenes/SceneDetails/ExternalPlayerButton.tsx
 *
 * @param {Object} props
 * @param {string} props.sceneId - The scene ID to build the stream URL
 * @param {string} props.title - The scene title (used for Android intent)
 * @param {string} [props.className] - Additional CSS classes
 */
export default function ExternalPlayerButton({ sceneId, title, className = "" }) {
  const isAndroid = /(android)/i.test(navigator.userAgent);
  const isAppleDevice = /(ipod|iphone|ipad)/i.test(navigator.userAgent);
  const isMobile = isAndroid || isAppleDevice;

  // Only show on mobile devices for now (Commit 1)
  // Desktop support will be added in Commit 2
  if (!isMobile) {
    return null;
  }

  // Don't render if no sceneId provided
  if (!sceneId) {
    return null;
  }

  // Build the direct stream URL (original file, no transcoding)
  // This needs to be an absolute URL for external players
  const streamUrl = `${window.location.origin}/api/scene/${sceneId}/proxy-stream/stream`;

  let externalUrl;

  if (isAndroid) {
    // Android: Use Intent URI to open in any video player
    // Format: intent://host#Intent;action=...;scheme=...;type=...;S.title=...;end
    // Reference: https://developer.chrome.com/docs/android/intents
    const url = new URL(streamUrl);
    const scheme = url.protocol.slice(0, -1); // Remove trailing colon (https: -> https)

    // Build Intent URI
    // S.title passes the scene title as an extra string parameter
    url.hash = `Intent;action=android.intent.action.VIEW;scheme=${scheme};type=video/mp4;S.title=${encodeURIComponent(title || "Video")};end`;

    // Replace protocol with intent:
    // Note: Can't use url.protocol = "intent:" due to browser security restrictions
    // on changing from "special" protocols (http/https) to non-special ones
    externalUrl = url.toString().replace(new RegExp(`^${url.protocol}`), "intent:");
  } else if (isAppleDevice) {
    // iOS: Use VLC's x-callback-url scheme
    // Format: vlc-x-callback://x-callback-url/stream?url=<encoded-url>
    // Reference: https://wiki.videolan.org/Documentation:IOS/#x-callback-url
    const url = new URL(streamUrl);
    url.host = "x-callback-url";
    url.port = "";
    url.pathname = "stream";
    url.search = `url=${encodeURIComponent(streamUrl)}`;

    // Replace protocol with vlc-x-callback:
    externalUrl = url.toString().replace(new RegExp(`^${url.protocol}`), "vlc-x-callback:");
  }

  return (
    <a
      href={externalUrl}
      className={`inline-flex items-center justify-center p-2 rounded-lg transition-colors ${className}`}
      style={{
        backgroundColor: "var(--bg-tertiary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
      }}
      title="Open in external player"
      aria-label="Open in external player"
    >
      <ExternalLink
        size={20}
        style={{ color: "var(--text-secondary)" }}
        className="hover:opacity-100 transition-opacity opacity-80"
      />
    </a>
  );
}
