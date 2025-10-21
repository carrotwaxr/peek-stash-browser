import React, { useState, useEffect } from "react";
import { useTheme } from "../../themes/useTheme.js";
import { setupApi } from "../../services/api.js";

const SetupWizard = ({ onSetupComplete }) => {
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 2: Discovered libraries
  const [stashLibraries, setStashLibraries] = useState([]);

  // Step 3: Path mappings
  const [pathMappings, setPathMappings] = useState([]);
  const [validationResults, setValidationResults] = useState({});

  // Step 4: Admin password
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const steps = [
    "Welcome",
    "Discover Libraries",
    "Configure Paths",
    "Create Admin User",
    "Complete",
  ];

  // Step 1: Welcome screen
  const WelcomeStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2
          className="text-3xl font-bold mb-4"
          style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}
        >
          Welcome to Peek Stash Browser
        </h2>
        <p
          className="text-lg mb-6"
          style={{
            color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
          }}
        >
          Let's get your system configured
        </p>
      </div>

      <div
        className="p-6 rounded-lg space-y-4"
        style={{
          backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
          borderColor: theme?.properties?.["--border-color"] || "#404040",
        }}
      >
        <h3
          className="text-xl font-semibold mb-3"
          style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}
        >
          What we'll do:
        </h3>
        <ul
          className="space-y-2 list-disc list-inside"
          style={{
            color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
          }}
        >
          <li>Discover your Stash library paths automatically</li>
          <li>Map Stash paths to Peek's Docker container paths</li>
          <li>Create an admin account</li>
          <li>Complete setup and start browsing</li>
        </ul>

        <div
          className="mt-6 p-4 rounded border-l-4"
          style={{
            backgroundColor: theme?.properties?.["--bg-secondary"] || "#0a0a0a",
            borderColor: theme?.properties?.["--accent-color"] || "#3b82f6",
          }}
        >
          <p
            className="text-sm font-semibold mb-2"
            style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}
          >
            Before you begin:
          </p>
          <p
            className="text-sm"
            style={{
              color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
            }}
          >
            Make sure you have set up Docker volume mounts for your Stash media
            directories. Peek needs to access the same files that Stash uses.
          </p>
        </div>
      </div>

      <button
        onClick={() => setCurrentStep(1)}
        className="w-full py-3 px-4 rounded-lg font-semibold transition-colors"
        style={{
          backgroundColor: theme?.properties?.["--accent-color"] || "#3b82f6",
          color: "#ffffff",
        }}
      >
        Get Started
      </button>
    </div>
  );

  // Step 2: Discover libraries
  const discoverLibraries = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await setupApi.discoverStashLibraries();

      if (response.success) {
        setStashLibraries(response.libraries || []);

        // Initialize path mappings with discovered libraries
        const initialMappings = (response.libraries || []).map((lib) => ({
          stashPath: lib.path,
          peekPath: "", // User needs to fill this in
          excludeVideo: lib.excludeVideo,
        }));
        setPathMappings(initialMappings);

        setCurrentStep(2);
      } else {
        setError("Failed to discover libraries");
      }
    } catch (err) {
      setError("Failed to connect to Stash server. Check STASH_URL and STASH_API_KEY.");
    } finally {
      setLoading(false);
    }
  };

  const DiscoverStep = () => (
    <div className="space-y-6">
      <div>
        <h2
          className="text-2xl font-bold mb-2"
          style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}
        >
          Discover Libraries
        </h2>
        <p
          style={{
            color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
          }}
        >
          We'll query your Stash server to find configured library paths
        </p>
      </div>

      {error && (
        <div
          className="p-4 rounded border-l-4"
          style={{
            backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
            borderColor: "#ef4444",
          }}
        >
          <p style={{ color: "#ef4444" }}>{error}</p>
        </div>
      )}

      <button
        onClick={discoverLibraries}
        disabled={loading}
        className="w-full py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50"
        style={{
          backgroundColor: theme?.properties?.["--accent-color"] || "#3b82f6",
          color: "#ffffff",
        }}
      >
        {loading ? "Discovering..." : "Discover Stash Libraries"}
      </button>

      <button
        onClick={() => setCurrentStep(0)}
        className="w-full py-2 px-4 rounded-lg transition-colors"
        style={{
          color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
        }}
      >
        Back
      </button>
    </div>
  );

  // Step 3: Configure path mappings
  const testPath = async (index) => {
    const mapping = pathMappings[index];
    if (!mapping.peekPath) return;

    setLoading(true);
    try {
      const result = await setupApi.testPath(mapping.peekPath);
      setValidationResults({
        ...validationResults,
        [index]: result,
      });
    } catch (err) {
      setValidationResults({
        ...validationResults,
        [index]: { success: false, message: "Failed to test path" },
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePeekPath = (index, value) => {
    const updated = [...pathMappings];
    updated[index].peekPath = value;
    setPathMappings(updated);

    // Clear validation when path changes
    if (validationResults[index]) {
      const updated = { ...validationResults };
      delete updated[index];
      setValidationResults(updated);
    }
  };

  const savePathMappings = async () => {
    setLoading(true);
    setError("");

    try {
      // Save each mapping that has a peek path configured
      for (const mapping of pathMappings) {
        if (mapping.peekPath) {
          await setupApi.addPathMapping(mapping.stashPath, mapping.peekPath);
        }
      }

      setCurrentStep(3);
    } catch (err) {
      setError("Failed to save path mappings: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const createAdminUser = async () => {
    if (adminPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (adminPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Create first admin user via setup API
      const response = await fetch("/api/setup/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "admin",
          password: adminPassword,
        }),
      });

      if (response.ok) {
        setCurrentStep(4);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create admin user");
      }
    } catch (err) {
      setError("Failed to create admin user: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // Step 5: Complete
  const CompleteStep = () => (
    <div className="space-y-6 text-center">
      <div
        className="text-6xl mb-4"
        style={{ color: theme?.properties?.["--accent-color"] || "#3b82f6" }}
      >
        ✓
      </div>
      <h2
        className="text-3xl font-bold mb-4"
        style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}
      >
        Setup Complete!
      </h2>
      <p
        className="text-lg"
        style={{
          color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
        }}
      >
        Your Peek Stash Browser is now configured and ready to use
      </p>

      <button
        onClick={onSetupComplete}
        className="w-full py-3 px-4 rounded-lg font-semibold transition-colors"
        style={{
          backgroundColor: theme?.properties?.["--accent-color"] || "#3b82f6",
          color: "#ffffff",
        }}
      >
        Go to Login
      </button>
    </div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep />;
      case 1:
        return <DiscoverStep />;
      case 2:
        return renderPathMappingStep();
      case 3:
        return renderAdminPasswordStep();
      case 4:
        return <CompleteStep />;
      default:
        return <WelcomeStep />;
    }
  };

  const renderAdminPasswordStep = () => (
    <div className="space-y-6">
      <div>
        <h2
          className="text-2xl font-bold mb-2"
          style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}
        >
          Create Admin Account
        </h2>
        <p
          style={{
            color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
          }}
        >
          Set a secure password for the admin account
        </p>
      </div>

      {error && (
        <div
          className="p-4 rounded border-l-4"
          style={{
            backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
            borderColor: "#ef4444",
          }}
        >
          <p style={{ color: "#ef4444" }}>{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            className="block text-sm font-semibold mb-1"
            style={{
              color: theme?.properties?.["--text-primary"] || "#ffffff",
            }}
          >
            Username
          </label>
          <input
            type="text"
            value="admin"
            disabled
            className="w-full px-3 py-2 rounded opacity-60"
            style={{
              backgroundColor:
                theme?.properties?.["--bg-secondary"] || "#0a0a0a",
              borderColor:
                theme?.properties?.["--border-color"] || "#404040",
              color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
            }}
          />
        </div>

        <div>
          <label
            className="block text-sm font-semibold mb-1"
            style={{
              color: theme?.properties?.["--text-primary"] || "#ffffff",
            }}
          >
            Password
          </label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="w-full px-3 py-2 rounded border focus:outline-none focus:ring-2"
            style={{
              backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
              borderColor: theme?.properties?.["--border-color"] || "#404040",
              color: theme?.properties?.["--text-primary"] || "#ffffff",
            }}
            placeholder="Enter password"
          />
        </div>

        <div>
          <label
            className="block text-sm font-semibold mb-1"
            style={{
              color: theme?.properties?.["--text-primary"] || "#ffffff",
            }}
          >
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 rounded border focus:outline-none focus:ring-2"
            style={{
              backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
              borderColor: theme?.properties?.["--border-color"] || "#404040",
              color: theme?.properties?.["--text-primary"] || "#ffffff",
            }}
            placeholder="Confirm password"
          />
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setCurrentStep(2)}
          className="flex-1 py-2 px-4 rounded-lg transition-colors"
          style={{
            color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
          }}
        >
          Back
        </button>
        <button
          onClick={createAdminUser}
          disabled={loading || !adminPassword || !confirmPassword}
          className="flex-1 py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50"
          style={{
            backgroundColor: theme?.properties?.["--accent-color"] || "#3b82f6",
            color: "#ffffff",
          }}
        >
          {loading ? "Creating..." : "Create Admin User"}
        </button>
      </div>
    </div>
  );

  const renderPathMappingStep = () => {
    const hasLibraries = pathMappings.length > 0;
    const allMapped = pathMappings.every((m) => m.peekPath);

    return (
      <div className="space-y-6">
        <div>
          <h2
            className="text-2xl font-bold mb-2"
            style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}
          >
            Configure Path Mappings
          </h2>
          <p
            style={{
              color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
            }}
          >
            Map each Stash library path to where Peek can access it
          </p>
        </div>

        {!hasLibraries && (
          <div
            className="p-4 rounded border-l-4"
            style={{
              backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
              borderColor: "#f59e0b",
            }}
          >
            <p style={{ color: "#f59e0b" }}>
              No libraries found. You can skip this step and configure
              paths later in Settings.
            </p>
          </div>
        )}

        {error && (
          <div
            className="p-4 rounded border-l-4"
            style={{
              backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
              borderColor: "#ef4444",
            }}
          >
            <p style={{ color: "#ef4444" }}>{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {pathMappings.map((mapping, index) => {
            const validation = validationResults[index];
            const libraryType = !mapping.excludeVideo && !mapping.excludeImage
              ? "Video & Image"
              : !mapping.excludeVideo
                ? "Video"
                : !mapping.excludeImage
                  ? "Image"
                  : "Unknown";

            return (
              <div
                key={mapping.stashPath}
                className="p-4 rounded-lg space-y-3"
                style={{
                  backgroundColor:
                    theme?.properties?.["--bg-card"] || "#1f1f1f",
                  borderColor:
                    theme?.properties?.["--border-color"] || "#404040",
                }}
              >
                <div>
                  <label
                    className="block text-sm font-semibold mb-1"
                    style={{
                      color: theme?.properties?.["--text-primary"] || "#ffffff",
                    }}
                  >
                    Stash Path{" "}
                    <span
                      className="text-xs font-normal px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: theme?.properties?.["--bg-secondary"] || "#0a0a0a",
                        color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
                      }}
                    >
                      {libraryType}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={mapping.stashPath}
                    disabled
                    className="w-full px-3 py-2 rounded opacity-60"
                    style={{
                      backgroundColor:
                        theme?.properties?.["--bg-secondary"] || "#0a0a0a",
                      borderColor:
                        theme?.properties?.["--border-color"] || "#404040",
                      color:
                        theme?.properties?.["--text-secondary"] || "#b3b3b3",
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-semibold mb-1"
                    style={{
                      color: theme?.properties?.["--text-primary"] || "#ffffff",
                    }}
                  >
                    Peek Path (Docker mount point)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mapping.peekPath}
                      onChange={(e) => updatePeekPath(index, e.target.value)}
                      placeholder="/app/media"
                      className="flex-1 px-3 py-2 rounded border focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor:
                          theme?.properties?.["--bg-card"] || "#1f1f1f",
                        borderColor:
                          theme?.properties?.["--border-color"] || "#404040",
                        color: theme?.properties?.["--text-primary"] || "#ffffff",
                      }}
                    />
                    <button
                      onClick={() => testPath(index)}
                      disabled={!mapping.peekPath || loading}
                      className="px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50"
                      style={{
                        backgroundColor:
                          theme?.properties?.["--accent-color"] || "#3b82f6",
                        color: "#ffffff",
                      }}
                    >
                      Test
                    </button>
                  </div>

                  {validation && (
                    <p
                      className="text-sm mt-1"
                      style={{
                        color: validation.exists
                          ? validation.readable
                            ? "#10b981"
                            : "#f59e0b"
                          : "#ef4444",
                      }}
                    >
                      {validation.message}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-4 mt-6">
          <button
            onClick={() => setCurrentStep(1)}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-lg font-semibold transition-colors"
            style={{
              backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
              color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
            }}
          >
            Back
          </button>
          <button
            onClick={savePathMappings}
            disabled={loading || (!hasLibraries ? false : !allMapped)}
            className="flex-1 py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50"
            style={{
              backgroundColor:
                theme?.properties?.["--accent-color"] || "#3b82f6",
              color: "#ffffff",
            }}
          >
            {loading ? "Saving..." : hasLibraries ? "Continue" : "Skip"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"
      style={{
        backgroundColor: theme?.properties?.["--bg-primary"] || "#0f0f0f",
      }}
    >
      <div className="max-w-2xl w-full">
        {/* Progress indicator */}
        {currentStep < 4 && (
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`text-xs ${index === currentStep ? "font-semibold" : ""}`}
                  style={{
                    color:
                      index === currentStep
                        ? theme?.properties?.["--accent-color"] || "#3b82f6"
                        : theme?.properties?.["--text-secondary"] || "#b3b3b3",
                  }}
                >
                  {step}
                </div>
              ))}
            </div>
            <div
              className="h-2 rounded-full"
              style={{
                backgroundColor:
                  theme?.properties?.["--bg-card"] || "#1f1f1f",
              }}
            >
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(currentStep / (steps.length - 1)) * 100}%`,
                  backgroundColor:
                    theme?.properties?.["--accent-color"] || "#3b82f6",
                }}
              />
            </div>
          </div>
        )}

        {/* Current step content */}
        {renderStep()}
      </div>
    </div>
  );
};

export default SetupWizard;
