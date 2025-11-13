import GenderIcon from "../ui/GenderIcon.jsx";
import PageHeader from "../ui/PageHeader.jsx";

/**
 * Temporary test page to showcase all gender icon variations
 * TODO: Remove this file after gender icon review is complete
 */
const GenderIconTest = () => {
  const genderTypes = [
    { value: "MALE", label: "Male" },
    { value: "FEMALE", label: "Female" },
    { value: "TRANSGENDER_MALE", label: "Trans Male" },
    { value: "TRANSGENDER_FEMALE", label: "Trans Female" },
    { value: "INTERSEX", label: "Intersex" },
    { value: "NON_BINARY", label: "Non-Binary" },
    { value: null, label: "Unknown/Null" },
  ];

  const sizes = [
    { size: 16, label: "Small (16px) - Card Size" },
    { size: 24, label: "Medium (24px) - Default" },
    { size: 32, label: "Large (32px) - Detail Page" },
  ];

  return (
    <div className="container mx-auto p-8">
      <PageHeader
        title="Gender Icon Test Page"
        subtitle="Temporary page to review all gender icon variations - TODO: Remove after review"
      />

      {/* All Sizes Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
          All Gender Types at Different Sizes
        </h2>

        {sizes.map(({ size, label }) => (
          <div key={size} className="mb-8">
            <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>
              {label}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {genderTypes.map(({ value, label }) => (
                <div
                  key={value || "null"}
                  className="flex flex-col items-center p-4 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <GenderIcon gender={value} size={size} />
                  <span
                    className="mt-3 text-sm font-medium text-center"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {label}
                  </span>
                  <span
                    className="mt-1 text-xs text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {value || "null"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Simulated Performer Cards Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
          As They Appear on Performer Cards
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {genderTypes.map(({ value, label }) => (
            <div
              key={value || "null"}
              className="flex flex-col items-center p-4 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              {/* Simulated card title with icon */}
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  Sample Name
                </span>
                <GenderIcon gender={value} size={16} />
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Page Header Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
          As They Appear on Detail Pages
        </h2>

        <div className="space-y-4">
          {genderTypes.map(({ value, label }) => (
            <div
              key={value || "null"}
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              {/* Simulated detail page header */}
              <div className="flex gap-4 items-center">
                <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                  Performer Name
                </span>
                <GenderIcon gender={value} size={32} />
              </div>
              <span className="text-sm mt-2 inline-block" style={{ color: "var(--text-muted)" }}>
                Gender: {label} ({value || "null"})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Color Reference */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
          Color Reference (Pride Flag Inspired)
        </h2>

        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-24 h-8 rounded" style={{ backgroundColor: "#0561fa" }}></div>
            <span style={{ color: "var(--text-primary)" }}>Male - Traditional Blue (#0561fa)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-24 h-8 rounded" style={{ backgroundColor: "#ff0080" }}></div>
            <span style={{ color: "var(--text-primary)" }}>Female - Traditional Pink (#ff0080)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-24 h-8 rounded" style={{ backgroundColor: "#5BCEFA" }}></div>
            <span style={{ color: "var(--text-primary)" }}>Trans Male - Trans Flag Light Blue (#5BCEFA)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-24 h-8 rounded" style={{ backgroundColor: "#F5A9B8" }}></div>
            <span style={{ color: "var(--text-primary)" }}>Trans Female - Trans Flag Light Pink (#F5A9B8)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-24 h-8 rounded" style={{ backgroundColor: "#FFD800" }}></div>
            <span style={{ color: "var(--text-primary)" }}>Intersex - Intersex Flag Yellow (#FFD800)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-24 h-8 rounded" style={{ backgroundColor: "#FFF430" }}></div>
            <span style={{ color: "var(--text-primary)" }}>Non-Binary - Non-Binary Flag Yellow (#FFF430)</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-24 h-8 rounded" style={{ backgroundColor: "#6c757d" }}></div>
            <span style={{ color: "var(--text-primary)" }}>Unknown - Neutral Gray (#6c757d)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenderIconTest;
