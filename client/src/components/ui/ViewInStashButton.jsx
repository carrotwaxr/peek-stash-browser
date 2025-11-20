import { useAuth } from "../../hooks/useAuth";

/**
 * Button that opens the entity in Stash in a new tab
 * Only visible to admin users
 *
 * @param {Object} props
 * @param {string} props.stashUrl - Full URL to entity in Stash
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.size] - Icon size (default: 20)
 */
export default function ViewInStashButton({ stashUrl, className = "", size = 20 }) {
  const { user } = useAuth();

  // Only show button to admin users
  if (!user || user.role !== "ADMIN") {
    return null;
  }

  // Don't render if no stashUrl provided
  if (!stashUrl) {
    return null;
  }

  return (
    <a
      href={stashUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors ${className}`}
      title="View in Stash"
      aria-label="View in Stash"
    >
      <img
        src="/assets/stash-logo.svg"
        alt="Stash"
        width={size}
        height={size}
        className="opacity-80 hover:opacity-100 transition-opacity"
      />
    </a>
  );
}
