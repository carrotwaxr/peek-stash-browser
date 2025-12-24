import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Button from "./Button.jsx";
import SceneCard from "./SceneCard.jsx";
import SkeletonSceneCard from "./SkeletonSceneCard.jsx";

const SceneCarousel = ({
  title,
  titleIcon,
  scenes,
  loading = false,
  onSceneClick,
  selectedScenes = [],
  onToggleSelect,
  seeMoreUrl,
}) => {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef(null);

  // Check scroll position and update button states
  const checkScrollButtons = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth
    );
  };

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollButtons);
      return () => container.removeEventListener("scroll", checkScrollButtons);
    }
  }, [scenes]);

  const scrollLeft = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const cardWidth = 280; // Approximate card width + gap
      const scrollAmount = cardWidth * 3; // Scroll 3 cards at a time
      container.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const cardWidth = 280;
      const scrollAmount = cardWidth * 3;
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="mb-8">
        <h2
          className="text-2xl font-bold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
        <div className="flex gap-4 overflow-hidden py-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0"
              style={{ width: "280px", minWidth: "280px" }}
            >
              <SkeletonSceneCard />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!scenes || scenes.length === 0) {
    return (
      <div className="mb-8">
        <h2
          className="text-2xl font-bold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
        <div
          className="flex items-center justify-center py-16 rounded-lg"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-color)",
          }}
        >
          <p style={{ color: "var(--text-muted)" }}>No scenes available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 overflow-hidden">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-2xl font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          {titleIcon && <span className="flex items-center">{titleIcon}</span>}
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {/* Scroll buttons */}
          <Button
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            variant="secondary"
            className="rounded-full w-10 h-10 !p-0 flex items-center justify-center"
            style={{
              backgroundColor: canScrollLeft
                ? "var(--bg-card)"
                : "var(--bg-tertiary)",
              opacity: canScrollLeft ? 1 : 0.5,
            }}
            icon={
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            }
          />
          <Button
            onClick={scrollRight}
            disabled={!canScrollRight}
            variant="secondary"
            className="rounded-full w-10 h-10 !p-0 flex items-center justify-center"
            style={{
              backgroundColor: canScrollRight
                ? "var(--bg-card)"
                : "var(--bg-tertiary)",
              opacity: canScrollRight ? 1 : 0.5,
            }}
            icon={
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            }
          />
          {seeMoreUrl && (
            <Link to={seeMoreUrl}>
              <Button variant="secondary" size="sm" className="ml-2 h-10">
                More
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Carousel Container */}
      <div className="relative overflow-visible">
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide py-4"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            overflowY: "visible",
          }}
          onScroll={checkScrollButtons}
        >
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className="flex-shrink-0"
              style={{ width: "280px", minWidth: "280px" }}
            >
              <SceneCard
                scene={scene}
                onClick={onSceneClick}
                enableKeyboard={false}
                isSelected={selectedScenes.some((s) => s.id === scene.id)}
                onToggleSelect={onToggleSelect}
                selectionMode={selectedScenes.length > 0}
              />
            </div>
          ))}
        </div>

        {/* Fade gradients for visual effect */}
        <div
          className="absolute top-0 left-0 w-8 h-full pointer-events-none"
          style={{
            background: `linear-gradient(to right, var(--bg-primary), transparent)`,
            opacity: canScrollLeft ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
        />
        <div
          className="absolute top-0 right-0 w-8 h-full pointer-events-none"
          style={{
            background: `linear-gradient(to left, var(--bg-primary), transparent)`,
            opacity: canScrollRight ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
        />
      </div>
    </div>
  );
};

export default SceneCarousel;
