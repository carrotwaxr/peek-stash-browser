/**
 * Reusable page header component
 */
const PageHeader = ({ title, subtitle, className = "" }) => {
  if (!title) return null;

  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1
            className="text-3xl sm:text-4xl font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h1>
          {subtitle && <div style={{ color: "var(--text-muted)" }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
