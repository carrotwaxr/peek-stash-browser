import { useEffect, useRef } from "react";

/**
 * Reusable keyboard shortcut hook for the entire application
 *
 * Provides context-aware keyboard shortcut registration with proper event handling,
 * input field detection, modifier key support, and cleanup.
 *
 * @param {Object} shortcuts - Map of key combinations to handler functions
 *   Format: { "key": handler, "ctrl+key": handler, "shift+>": handler }
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether shortcuts are enabled
 * @param {string} options.context - Optional context name for debugging
 * @param {number} options.priority - Priority level (higher = executed first)
 * @param {Function} options.shouldHandle - Custom function to determine if shortcut should be handled
 *
 * @example
 * useKeyboardShortcuts({
 *   'k': () => player.play(),
 *   'space': () => player.play(),
 *   'shift+>': () => increaseSpeed(),
 *   'ctrl+left': () => seekBackward(),
 * }, {
 *   enabled: true,
 *   context: 'video-player',
 *   shouldHandle: (event) => !event.target.closest('.no-shortcuts')
 * });
 */
export const useKeyboardShortcuts = (
  shortcuts = {},
  { enabled = true, context = "global", priority = 0, shouldHandle = null } = {}
) => {
  // Use ref to avoid recreating handler on every render
  const shortcutsRef = useRef(shortcuts);
  const shouldHandleRef = useRef(shouldHandle);

  // Update refs when props change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
    shouldHandleRef.current = shouldHandle;
  }, [shortcuts, shouldHandle]);

  useEffect(() => {
    if (!enabled) {
      console.log(`[useKeyboardShortcuts:${context}] NOT registering (enabled=false)`);
      return;
    }

    console.log(`[useKeyboardShortcuts:${context}] Registering keyboard shortcuts`);

    const handleKeyDown = (event) => {
      // Skip if user is typing in an input field
      if (isTypingInInput(event.target)) {
        return;
      }

      // Skip if custom shouldHandle returns false
      if (shouldHandleRef.current && !shouldHandleRef.current(event)) {
        console.log(`[useKeyboardShortcuts:${context}] shouldHandle returned false for ${event.key}`);
        return;
      }

      // Build key combination string
      const keyCombo = buildKeyCombo(event);

      // Check if we have a handler for this combination
      const handler = shortcutsRef.current[keyCombo];

      if (handler) {
        console.log(`[useKeyboardShortcuts:${context}] Handling "${keyCombo}"`);
        // Prevent default browser behavior for this shortcut
        event.preventDefault();
        event.stopPropagation();

        // Execute the handler
        try {
          handler(event);
        } catch (error) {
          console.error(
            `[useKeyboardShortcuts:${context}] Error handling "${keyCombo}":`,
            error
          );
        }
      } else {
        console.log(`[useKeyboardShortcuts:${context}] No handler for "${keyCombo}"`);
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup
    return () => {
      console.log(`[useKeyboardShortcuts:${context}] Removing keyboard shortcuts`);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, context, priority]);
};

/**
 * Check if user is currently typing in an input field
 * @param {HTMLElement} target - Event target element
 * @returns {boolean} True if typing in input
 */
function isTypingInInput(target) {
  if (!target) return false;

  const tagName = target.tagName;
  const isInput = tagName === "INPUT" || tagName === "TEXTAREA";
  const isContentEditable = target.isContentEditable;
  const isButton = tagName === "BUTTON";

  // Allow Space on buttons (for activation)
  // All other inputs should block shortcuts
  return (isInput || isContentEditable) && !isButton;
}

/**
 * Build key combination string from keyboard event
 * Handles modifiers (ctrl, shift, alt, meta) and normalizes key names
 *
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {string} Key combination string (e.g., "ctrl+shift+a", "space", "shift+>")
 */
function buildKeyCombo(event) {
  const parts = [];

  // Normalize key name first
  let key = normalizeKey(event.key);

  // Add modifiers in consistent order
  if (event.ctrlKey || event.metaKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");

  // Only add shift for special characters and non-letter keys
  // Letters should ignore shift (K and k both become "k")
  const isLetter = /^[a-z]$/i.test(event.key);
  if (event.shiftKey && !isLetter) {
    parts.push("shift");
    // For shifted symbols, use the actual character (e.g., ">" instead of ".")
    if (event.key.length === 1) {
      key = event.key;
    }
  }

  parts.push(key);

  return parts.join("+");
}

/**
 * Normalize key names for consistency
 * @param {string} key - Raw key from event.key
 * @returns {string} Normalized key name
 */
function normalizeKey(key) {
  // Map of special keys to normalized names
  const keyMap = {
    " ": "space",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Escape: "esc",
    Enter: "enter",
    Tab: "tab",
    Backspace: "backspace",
    Delete: "del",
    Home: "home",
    End: "end",
    PageUp: "pageup",
    PageDown: "pagedown",
  };

  // Use mapped name if available, otherwise lowercase the key
  return keyMap[key] || key.toLowerCase();
}

/**
 * Hook for video player-specific keyboard shortcuts
 * Wraps useKeyboardShortcuts with video player context
 *
 * @param {Object} playerRef - Ref to Video.js player instance
 * @param {Object} shortcuts - Additional shortcuts to register
 * @param {Object} options - Configuration options
 */
export const useVideoPlayerShortcuts = (
  playerRef,
  shortcuts = {},
  options = {}
) => {
  useKeyboardShortcuts(shortcuts, {
    ...options,
    context: "video-player",
    shouldHandle: (event) => {
      // Only handle if player exists and is ready
      if (!playerRef.current) return false;

      // Don't handle if custom shouldHandle returns false
      if (options.shouldHandle && !options.shouldHandle(event)) {
        return false;
      }

      return true;
    },
  });
};

export default useKeyboardShortcuts;
