/**
 * Intersex symbol - Circle with combined elements
 * Based on intersex pride flag (purple circle with yellow background)
 * Represents those born with variations in sex characteristics
 *
 * @param {number} size - Icon size in pixels
 * @param {string} color - Icon color
 * @param {string} className - Optional CSS classes
 */
const IntersexIcon = ({ size, color, className = "" }) => (
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
    {/* Outer circle */}
    <circle cx="12" cy="12" r="9" />
    {/* Inner circle */}
    <circle cx="12" cy="12" r="5" />
  </svg>
);

export default IntersexIcon;
