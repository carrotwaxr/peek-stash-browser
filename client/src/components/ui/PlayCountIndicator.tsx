interface Props {
  playCount: number;
  size?: string;
}

export default function PlayCountIndicator({ playCount, size = "base" }: Props) {
  return (
    <span className={`text-${size}`}>
      <span style={{ color: "var(--status-success)" }}>▶</span>{" "}
      {playCount || 0}
    </span>
  );
}
