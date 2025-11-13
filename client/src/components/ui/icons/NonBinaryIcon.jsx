/**
 * Non-binary symbol - Variation of androgynous symbol
 * Represents gender identities outside the male/female binary
 * Using a combination that represents gender fluidity
 *
 * @param {number} size - Icon size in pixels
 * @param {string} color - Icon color
 * @param {string} className - Optional CSS classes
 */
const NonBinaryIcon = ({ size, color, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Central circle */}
    <circle cx="12" cy="12" r="5" />
    {/* Arrow up-right */}
    <path d="M15.5 8.5 L19 5 M19 5 L19 9 M19 5 L15 5" />
    {/* Arrow down-left */}
    <path d="M8.5 15.5 L5 19 M5 19 L5 15 M5 19 L9 19" />
    {/* Additional arms for fluidity */}
    <path d="M12 7 L12 4" />
    <path d="M12 17 L12 20" />
  </svg>
);

export default NonBinaryIcon;
