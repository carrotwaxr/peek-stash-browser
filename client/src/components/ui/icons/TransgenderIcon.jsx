/**
 * Transgender symbol (⚧) - Custom SVG based on Unicode U+26A7
 * Combines elements of male, female, and androgynous symbols
 *
 * @param {number} size - Icon size in pixels
 * @param {string} color - Icon color
 * @param {string} className - Optional CSS classes
 */
const TransgenderIcon = ({ size, color, className = "" }) => (
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
    {/* Circle */}
    <circle cx="12" cy="14" r="5" />
    {/* Arrow pointing up-right (male element) */}
    <path d="M12 9 L12 4 M12 4 L15 7 M12 4 L9 7" />
    {/* Arrow pointing down (additional arm) */}
    <path d="M12 19 L12 22" />
    {/* Cross extending left (female element) */}
    <path d="M7 14 L4 14" />
  </svg>
);

export default TransgenderIcon;
