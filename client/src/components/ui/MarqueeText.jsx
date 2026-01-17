import { useEffect, useRef, useState } from "react";

/**
 * MarqueeText - Auto-scrolling text for overflowing content
 *
 * Scrolls text horizontally when it overflows its container.
 * Triggered by hover (desktop) or scroll into view (mobile).
 *
 * Animation timing (based on UX best practices):
 * - Speed: ~40 pixels/second for comfortable reading
 * - Initial delay: 0.5s before scrolling starts
 * - End pause: 0.5s before resetting
 *
 * Accessibility:
 * - Respects prefers-reduced-motion
 * - Uses GPU-accelerated translate3d()
 *
 * @param {string} children - Text content to display
 * @param {string} className - Additional CSS classes for the text element
 * @param {Object} style - Additional inline styles for the text element
 * @param {string} as - HTML element to render (default: "span")
 * @param {boolean} autoplayOnScroll - Enable scroll-based autoplay for mobile (default: true)
 */
const MarqueeText = ({
  children,
  className = "",
  style = {},
  as: Component = "span",
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
  // Target: ~40 pixels/second for comfortable reading
  const pixelsPerSecond = 40;
  const scrollDuration = overflowAmount / pixelsPerSecond;
  // Add delays: 0.5s initial + 0.5s at end
  const totalDuration = scrollDuration + 1;

  // Animation keyframes as inline style
  // Scroll left by overflow amount, pause at each end
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
      <Component
        ref={textRef}
        className={`inline-block ${className}`}
        style={{
          ...style,
          ...animationStyle,
        }}
      >
        {children}
      </Component>

      {/* CSS keyframes injected via style tag */}
      <style>{`
        @keyframes marquee-scroll {
          0%, 10% {
            transform: translate3d(0, 0, 0);
          }
          45%, 55% {
            transform: translate3d(var(--marquee-distance), 0, 0);
          }
          90%, 100% {
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </div>
  );
};

export default MarqueeText;
