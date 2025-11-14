import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Button } from "./index.js";

/**
 * Help Modal - Shows context-aware help documentation
 * Currently displays keyboard shortcuts for the current page
 */
const HelpModal = ({ onClose }) => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("hotkeys");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Determine current page from URL
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path.startsWith("/scene/")) return "scene";
    if (path.startsWith("/scenes")) return "scenes";
    if (path.startsWith("/performers")) return "performers";
    if (path.startsWith("/playlists")) return "playlists";
    if (path.startsWith("/galleries")) return "galleries";
    if (path.startsWith("/groups")) return "groups";
    if (path.startsWith("/tags")) return "tags";
    if (path.startsWith("/studios")) return "studios";
    return "global";
  };

  const currentPage = getCurrentPage();

  // Keyboard shortcuts organized by page
  const shortcuts = {
    scene: [
      {
        category: "Playback Control",
        items: [
          { keys: ["Space", "K"], description: "Play / Pause" },
          { keys: ["J"], description: "Jump back 10 seconds" },
          { keys: ["L"], description: "Jump forward 10 seconds" },
          { keys: ["←"], description: "Jump back 5 seconds" },
          { keys: ["→"], description: "Jump forward 5 seconds" },
          { keys: ["Home"], description: "Jump to start" },
          { keys: ["End"], description: "Jump to end" },
        ],
      },
      {
        category: "Seeking",
        items: [
          {
            keys: ["0-9"],
            description: "Jump to 0%, 10%, 20%... 90% of video",
          },
        ],
      },
      {
        category: "Volume Control",
        items: [
          { keys: ["↑"], description: "Volume up 5%" },
          { keys: ["↓"], description: "Volume down 5%" },
          { keys: ["M"], description: "Mute / Unmute" },
        ],
      },
      {
        category: "Playback Speed",
        items: [
          { keys: ["Shift+>"], description: "Increase speed" },
          { keys: ["Shift+<"], description: "Decrease speed" },
        ],
      },
      {
        category: "Display",
        items: [{ keys: ["F"], description: "Toggle fullscreen" }],
      },
    ],
    global: [
      {
        category: "General",
        items: [
          {
            keys: ["?"],
            description: "Show this help dialog (coming soon)",
          },
        ],
      },
    ],
  };

  // Get shortcuts for current page (fall back to global if page has no specific shortcuts)
  const pageShortcuts = shortcuts[currentPage] || shortcuts.global;

  const renderShortcutKey = (key) => {
    return (
      <kbd
        className="px-2 py-1 text-xs font-semibold rounded"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
          fontFamily: "monospace",
        }}
      >
        {key}
      </kbd>
    );
  };

  const renderShortcutRow = ({ keys, description }) => {
    return (
      <div
        key={keys.join("+")}
        className="flex items-center justify-between py-2 px-3 rounded hover:bg-opacity-50"
        style={{
          backgroundColor: "transparent",
        }}
      >
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {description}
        </span>
        <div className="flex items-center gap-1">
          {keys.map((keyCombo, index) => {
            // Check if this is a key combination (e.g., "Shift+>")
            const isCombo = keyCombo.includes("+");
            const parts = isCombo ? keyCombo.split("+") : [keyCombo];

            return (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && (
                  <span
                    className="text-xs mx-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    or
                  </span>
                )}
                {/* Render each part of the combination */}
                {parts.map((part, partIndex) => (
                  <span key={partIndex} className="flex items-center gap-1">
                    {partIndex > 0 && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        +
                      </span>
                    )}
                    {renderShortcutKey(part)}
                  </span>
                ))}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const renderShortcutCategory = ({ category, items }) => {
    return (
      <div key={category} className="mb-6">
        <h4
          className="text-sm font-semibold mb-3 uppercase tracking-wide"
          style={{ color: "var(--text-muted)" }}
        >
          {category}
        </h4>
        <div className="space-y-1">
          {items.map((item) => renderShortcutRow(item))}
        </div>
      </div>
    );
  };

  const getPageTitle = () => {
    const titles = {
      scene: "Video Player Shortcuts",
      scenes: "Scenes Page Shortcuts",
      performers: "Performers Page Shortcuts",
      playlists: "Playlists Page Shortcuts",
      galleries: "Galleries Page Shortcuts",
      groups: "Collections Page Shortcuts",
      tags: "Tags Page Shortcuts",
      studios: "Studios Page Shortcuts",
      global: "Keyboard Shortcuts",
    };
    return titles[currentPage] || "Keyboard Shortcuts";
  };

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col lg:flex-row rounded-lg overflow-hidden relative"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button (X) in top right - desktop only */}
        <button
          onClick={onClose}
          className="hidden lg:block absolute top-4 right-4 p-2 rounded-lg hover:bg-opacity-80 transition-colors z-10"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            color: "var(--text-primary)",
          }}
          aria-label="Close"
        >
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Left sidebar with tabs - hidden on mobile, shown as tabs on desktop */}
        <div
          className="hidden lg:block lg:w-48 lg:border-r"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="p-4">
            <h3
              className="text-lg font-semibold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Help
            </h3>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab("hotkeys")}
                className="w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors"
                style={{
                  backgroundColor:
                    activeTab === "hotkeys"
                      ? "rgba(59, 130, 246, 0.1)"
                      : "transparent",
                  color:
                    activeTab === "hotkeys"
                      ? "rgb(59, 130, 246)"
                      : "var(--text-secondary)",
                }}
              >
                Keyboard Shortcuts
              </button>
              {/* Future tabs can be added here */}
            </nav>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile header with hamburger menu */}
          <div
            className="lg:hidden flex items-center justify-between p-4 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Help
            </h3>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-opacity-80 transition-colors"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
              aria-label="Toggle menu"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile menu dropdown */}
          {isMobileMenuOpen && (
            <div
              className="lg:hidden border-b"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
              }}
            >
              <nav className="p-2">
                <button
                  onClick={() => {
                    setActiveTab("hotkeys");
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      activeTab === "hotkeys"
                        ? "rgba(59, 130, 246, 0.1)"
                        : "transparent",
                    color:
                      activeTab === "hotkeys"
                        ? "rgb(59, 130, 246)"
                        : "var(--text-secondary)",
                  }}
                >
                  Keyboard Shortcuts
                </button>
                {/* Future tabs can be added here */}
              </nav>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "hotkeys" && (
              <div>
                <div className="mb-6">
                  <h2
                    className="text-xl font-bold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {getPageTitle()}
                  </h2>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {currentPage === "scene"
                      ? "Control video playback and navigation with these keyboard shortcuts"
                      : "No page-specific shortcuts available yet"}
                  </p>
                </div>

                <div>
                  {pageShortcuts.map((category) =>
                    renderShortcutCategory(category)
                  )}
                </div>

                {currentPage !== "scene" && (
                  <div
                    className="mt-6 p-4 rounded-lg text-sm"
                    style={{
                      backgroundColor: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <p>
                      More page-specific shortcuts coming soon! Video player
                      shortcuts are currently available on scene pages.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer with close button */}
          <div
            className="p-4 border-t"
            style={{
              borderColor: "var(--border-color)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <Button onClick={onClose} variant="secondary" fullWidth>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default HelpModal;
