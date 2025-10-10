const Performers = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1
          className="text-4xl font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Performers
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Browse and manage performers in your library
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
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
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
            Performer management features will be available in a future update
          </p>
        </div>
      </div>
    </div>
  );
};

export default Performers;
