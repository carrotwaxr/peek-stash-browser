/**
 * Reusable empty state component
 */
const EmptyState = ({ icon, title, description, action, className = "" }) => {
  const defaultIcon = (
    <svg
      className="w-16 h-16 mx-auto mb-4"
      style={{ color: "var(--text-muted)" }}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );

  return (
    <div
      className={`flex items-center justify-center py-24 rounded-lg border ${className}`}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="text-center">
        {icon || defaultIcon}
        <h3
          className="text-xl font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        {description && (
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
        {action}
      </div>
    </div>
  );
};

export default EmptyState;
