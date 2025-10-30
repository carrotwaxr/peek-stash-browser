import OCounterButton from "./OCounterButton";
import PlayCountIndicator from "./PlayCountIndicator";

export default function CardStatusIcons({
  className = "",
  isReadOnly = false,
  oCount,
  playCount,
  sceneId,
  size = "base",
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-4 w-full text-${size} mb-2 ${className}`}
      style={{ color: "var(--text-muted)" }}
    >
      <OCounterButton
        initialCount={oCount}
        isReadOnly={isReadOnly}
        sceneId={sceneId}
        size={size}
      />
      <PlayCountIndicator playCount={playCount} size={size} />
    </div>
  );
}
