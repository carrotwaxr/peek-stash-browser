const Tags = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1
          className="text-4xl font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Tags
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Browse and manage tags in your library
        </p>
      </div>

      <div
        className="flex items-center justify-center py-24 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4"
            style={{ color: "var(--text-muted)" }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <h3
            className="text-xl font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Coming Soon
          </h3>
          <p style={{ color: "var(--text-muted)" }}>
            Tag management features will be available in a future update
          </p>
        </div>
      </div>
    </div>
  );
};

export default Tags;
