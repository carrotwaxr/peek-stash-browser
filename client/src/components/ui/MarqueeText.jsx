import { useEffect, useRef, useState } from "react";

/**
 * MarqueeText - Auto-scrolling text for overflowing content
 *
 * Scrolls text horizontally when it overflows its container.
 * Triggered by hover (desktop) or scroll into view (mobile).
 *
 * Animation timing (based on UX best practices):
 * - Speed: ~30 pixels/second for relaxed reading
 * - Initial pause: ~15% of animation duration
 * - End pause: ~20% of animation duration
 *
 * Accessibility:
 * - Respects prefers-reduced-motion
 * - Uses GPU-accelerated translate3d()
 *
 * @param {string} children - Text content to display
 * @param {string} className - Additional CSS classes for the text element
 * @param {Object} style - Additional inline styles for the text element
 * @param {boolean} autoplayOnScroll - Enable scroll-based autoplay for mobile (default: true)
 */
const MarqueeText = ({
  children,
  className = "",
  style = {},
  autoplayOnScroll = true,
}) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [overflowAmount, setOverflowAmount] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasHoverCapability, setHasHoverCapability] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Detect hover capability
  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover)");
    setHasHoverCapability(mediaQuery.matches);

    const handleChange = (e) => setHasHoverCapability(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Detect reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Measure overflow on mount and when children change
  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const checkOverflow = () => {
      const containerWidth = container.offsetWidth;
      const textWidth = text.scrollWidth;
      const overflow = textWidth - containerWidth;

      setIsOverflowing(overflow > 0);
      setOverflowAmount(overflow > 0 ? overflow : 0);
    };

    checkOverflow();

    // Re-check on resize
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [children]);

  // IntersectionObserver for scroll-based autoplay
  useEffect(() => {
    if (!autoplayOnScroll || !containerRef.current || hasHoverCapability) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.9);
      },
      {
        threshold: [0, 0.5, 0.9, 1.0],
        rootMargin: "-5% 0px",
      }
    );
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [autoplayOnScroll, hasHoverCapability]);

  // Determine if animation should play
  useEffect(() => {
    if (prefersReducedMotion || !isOverflowing) {
      setIsAnimating(false);
      return;
    }

    const shouldAnimate = autoplayOnScroll && !hasHoverCapability
      ? isInView
      : isHovering;

    setIsAnimating(shouldAnimate);
  }, [isHovering, isInView, isOverflowing, hasHoverCapability, autoplayOnScroll, prefersReducedMotion]);

  // Calculate animation duration based on overflow amount
  // Target: ~30 pixels/second for comfortable, relaxed reading
  const pixelsPerSecond = 30;
  const scrollDuration = overflowAmount / pixelsPerSecond;
  // Add delays: 1s initial pause + 1s end pause
  const totalDuration = scrollDuration + 2;

  // Animation uses keyframes defined in index.css
  // CSS variable --marquee-distance is set per-instance for the scroll amount
  const animationStyle = isAnimating && isOverflowing ? {
    animation: `marquee-scroll ${totalDuration}s ease-in-out infinite`,
    "--marquee-distance": `-${overflowAmount}px`,
  } : {};

  return (
    <div
      ref={containerRef}
      className="overflow-hidden whitespace-nowrap"
      onMouseEnter={() => hasHoverCapability && setIsHovering(true)}
      onMouseLeave={() => hasHoverCapability && setIsHovering(false)}
    >
      <span
        ref={textRef}
        className={`inline-block ${className}`}
        style={{
          ...style,
          ...animationStyle,
        }}
      >
        {children}
      </span>
    </div>
  );
};

export default MarqueeText;
