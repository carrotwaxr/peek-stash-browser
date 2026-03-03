import OCounterButton from "./OCounterButton";
import PlayCountIndicator from "./PlayCountIndicator";

interface Props {
  className?: string;
  isReadOnly?: boolean;
  oCount: number;
  playCount: number;
  sceneId: string;
  size?: "small" | "medium" | "large";
}

export default function CardStatusIcons({
  className = "",
  isReadOnly = false,
  oCount,
  playCount,
  sceneId,
  size = "small",
}: Props) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-4 w-full text-${size} mb-2 ${className}`}
      style={{ color: "var(--text-muted)" }}
    >
      <OCounterButton
        initialCount={oCount}
        interactive={!isReadOnly}
        sceneId={sceneId}
        size={size}
      />
      <PlayCountIndicator playCount={playCount} size={size} />
    </div>
  );
}
