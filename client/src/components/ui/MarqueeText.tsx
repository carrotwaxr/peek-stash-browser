import { type CSSProperties, type ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  useHoverCapable,
  useSharedMediaQuery,
} from "../../hooks/useHoverCapable";
import { useInView } from "../../hooks/useInView";

interface Props {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  autoplayOnScroll?: boolean;
}

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
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [overflowAmount, setOverflowAmount] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const hasHoverCapability = useHoverCapable();
  const prefersReducedMotion = useSharedMediaQuery(
    "(prefers-reduced-motion: reduce)"
  );
  // On a touch device the text scrolls while it is in view
  const scrollsInView = autoplayOnScroll && !hasHoverCapability;
  const isInView = useInView(containerRef, {
    rootMargin: "-5% 0px",
    threshold: [0, 0.5, 0.9, 1.0],
    minRatio: 0.9,
    skip: !scrollsInView,
  });
  const wantsToScroll =
    !prefersReducedMotion && (scrollsInView ? isInView : isHovering);

  // Measure the overflow (and follow resizes) only while the text would
  // scroll: a grid of idle cards measures nothing
  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!wantsToScroll || !container || !text) return;

    const checkOverflow = () => {
      const overflow = text.scrollWidth - container.offsetWidth;
      setIsOverflowing(overflow > 0);
      setOverflowAmount(overflow > 0 ? overflow : 0);
    };

    checkOverflow();
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [wantsToScroll, children]);

  const isAnimating = wantsToScroll && isOverflowing;

  // Calculate animation duration based on overflow amount
  // Target: ~30 pixels/second for comfortable, relaxed reading
  const pixelsPerSecond = 30;
  const scrollDuration = overflowAmount / pixelsPerSecond;
  // Add delays: 1s initial pause + 1s end pause
  const totalDuration = scrollDuration + 2;

  // Animation uses keyframes defined in index.css
  // CSS variable --marquee-distance is set per-instance for the scroll amount
  const animationStyle = isAnimating
    ? {
        animation: `marquee-scroll ${totalDuration}s ease-in-out infinite`,
        "--marquee-distance": `-${overflowAmount}px`,
      }
    : {};

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
