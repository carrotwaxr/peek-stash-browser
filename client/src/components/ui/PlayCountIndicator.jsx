export default function PlayCountIndicator({ playCount, size = "base" }) {
  return (
    <span className={`text-${size}`}>
      <span style={{ color: "var(--status-success)" }}>▶</span> {playCount || 0}
    </span>
  );
}
