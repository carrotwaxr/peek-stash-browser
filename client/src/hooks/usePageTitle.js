import { useEffect } from 'react';

/**
 * Custom hook to set the document title for a page.
 *
 * @param {string} title - The page title. Pass empty string or null for just "Peek"
 * @param {Object} options - Optional configuration
 * @param {string} options.suffix - Custom suffix (default: "Peek")
 *
 * @example
 * // Homepage
 * usePageTitle();  // Sets "Peek"
 *
 * // List pages
 * usePageTitle("Scenes");  // Sets "Scenes - Peek"
 *
 * // Detail pages
 * usePageTitle(sceneName);  // Sets "Scene Name - Peek"
 */
export const usePageTitle = (title = '', options = {}) => {
  const suffix = options.suffix || 'Peek';

  useEffect(() => {
    if (!title || title.trim() === '') {
      document.title = suffix;
    } else {
      document.title = `${title} - ${suffix}`;
    }

    // Cleanup: reset to default on unmount
    return () => {
      document.title = suffix;
    };
  }, [title, suffix]);
};

export default usePageTitle;
