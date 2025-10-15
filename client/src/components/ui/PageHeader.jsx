/**
 * Reusable page header component
 */
const PageHeader = ({ title, subtitle, className = "" }) => {
  if (!title) return null;

  return (
    <div className={`mb-8 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h1>
          {subtitle && <p style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
