import { useEffect, useRef, useState } from "react";

/**
 * Hook to detect if text content is truncated (via CSS line-clamp or overflow)
 * @returns {[React.RefObject, boolean]} - [ref to attach to element, whether content is truncated]
 */
export const useTruncationDetection = () => {
  const ref = useRef(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const checkTruncation = () => {
      // Element is truncated if scrollHeight > clientHeight
      const truncated = element.scrollHeight > element.clientHeight;
      setIsTruncated(truncated);
    };

    // Check on mount
    checkTruncation();

    // Re-check on resize
    const resizeObserver = new ResizeObserver(checkTruncation);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return [ref, isTruncated];
};
