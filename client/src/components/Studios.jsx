const Studios = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1
          className="text-4xl font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Studios
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Browse and manage studios in your library
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
              d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
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
            Studio management features will be available in a future update
          </p>
        </div>
      </div>
    </div>
  );
};

export default Studios;
