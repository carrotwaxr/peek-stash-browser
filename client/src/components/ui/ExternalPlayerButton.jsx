import { ExternalLink, ChevronDown, Copy } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { showSuccess, showError } from "../../utils/toast.jsx";

/**
 * Button to open the current scene in an external media player.
 *
 * Mobile (Android/iOS): Opens directly in external player using platform-specific URL schemes
 * - Android: Uses Intent URIs to launch any video player
 * - iOS: Uses VLC's x-callback-url scheme
 *
 * Desktop: Combo button with dropdown
 * - Primary action: Open in VLC (requires vlc:// protocol handler)
 * - Dropdown: Copy Stream URL option
 *
 * Implementation based on Stash's ExternalPlayerButton:
 * https://github.com/stashapp/stash/blob/develop/ui/v2.5/src/components/Scenes/SceneDetails/ExternalPlayerButton.tsx
 *
 * @param {Object} props
 * @param {string} props.sceneId - The scene ID to build the stream URL
 * @param {string} props.instanceId - The instance ID for multi-instance support
 * @param {string} props.title - The scene title (used for Android intent)
 * @param {string} [props.className] - Additional CSS classes
 */
export default function ExternalPlayerButton({
  sceneId,
  instanceId,
  title,
  className = "",
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const isAndroid = /(android)/i.test(navigator.userAgent);
  const isAppleDevice = /(ipod|iphone|ipad)/i.test(navigator.userAgent);
  const isMobile = isAndroid || isAppleDevice;

  // Build the direct stream URL (original file, no transcoding)
  // This needs to be an absolute URL for external players
  const streamUrl = sceneId
    ? `${window.location.origin}/api/scene/${sceneId}/proxy-stream/stream${instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : ''}`
    : null;

  /**
   * Build the external player URL based on platform
   */
  const getExternalPlayerUrl = () => {
    if (!streamUrl) return null;

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
      return url
        .toString()
        .replace(new RegExp(`^${url.protocol}`), "intent:");
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
      return url
        .toString()
        .replace(new RegExp(`^${url.protocol}`), "vlc-x-callback:");
    } else {
      // Desktop: Use vlc:// protocol
      // Requires protocol handler to be installed (e.g., player-protocol, vlc-protocol)
      // Format: vlc://https://example.com/video.mp4
      // Reference: https://github.com/tgdrive/player-protocol
      return `vlc://${streamUrl}`;
    }
  };

  /**
   * Copy stream URL to clipboard
   */
  const handleCopyUrl = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropdownOpen(false);

    if (!streamUrl) return;

    try {
      await navigator.clipboard.writeText(streamUrl);
      showSuccess("Stream URL copied to clipboard");
    } catch (err) {
      console.error("Failed to copy URL:", err);
      showError("Failed to copy URL to clipboard");
    }
  };

  // Update menu position when opening (useLayoutEffect prevents position flicker)
  useLayoutEffect(() => {
    if (isDropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4, // 4px gap below button
        left: rect.left,
      });
    }
  }, [isDropdownOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Close dropdown on scroll
  useEffect(() => {
    if (isDropdownOpen) {
      const handleScroll = () => setIsDropdownOpen(false);
      window.addEventListener("scroll", handleScroll, true);
      return () => window.removeEventListener("scroll", handleScroll, true);
    }
  }, [isDropdownOpen]);

  // Don't render if no sceneId provided
  if (!sceneId) {
    return null;
  }

  const externalUrl = getExternalPlayerUrl();

  // Mobile: Simple button (no dropdown needed)
  if (isMobile) {
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

  // Desktop: Combo button with dropdown
  return (
    <div ref={buttonRef} className={`inline-flex ${className}`}>
      {/* Primary button: Open in VLC */}
      <a
        href={externalUrl}
        className="inline-flex items-center justify-center p-2 rounded-l-lg transition-colors"
        style={{
          backgroundColor: "var(--bg-tertiary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
        }}
        title="Open in VLC"
        aria-label="Open in VLC"
      >
        <ExternalLink
          size={20}
          style={{ color: "var(--text-secondary)" }}
          className="hover:opacity-100 transition-opacity opacity-80"
        />
      </a>

      {/* Dropdown toggle */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDropdownOpen(!isDropdownOpen);
        }}
        className="inline-flex items-center justify-center px-1 rounded-r-lg transition-colors border-l"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          borderColor: "var(--border-color)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
        }}
        title="More options"
        aria-label="More options"
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
      >
        <ChevronDown
          size={16}
          style={{ color: "var(--text-secondary)" }}
          className={`transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown menu */}
      {isDropdownOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed rounded-lg shadow-lg min-w-[180px] py-1"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
              borderWidth: "1px",
              zIndex: 9999,
            }}
          >
            {/* Copy Stream URL option */}
            <button
              onClick={handleCopyUrl}
              className="w-full text-left px-4 py-2 hover:bg-opacity-10 hover:bg-white transition-colors text-sm flex items-center gap-2"
              style={{ color: "var(--text-primary)" }}
            >
              <Copy size={16} style={{ color: "var(--text-secondary)" }} />
              Copy Stream URL
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
