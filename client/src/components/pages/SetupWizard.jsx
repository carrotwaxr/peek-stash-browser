import React, { useState } from "react";
import { setupApi } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useTheme } from "../../themes/useTheme.js";
import { Button } from "../ui/index.js";

// Step 1: Welcome screen - defined outside to avoid recreation on re-render
const WelcomeStep = ({ theme, onNext }) => (
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
        <li>Create an admin account to manage Peek</li>
        <li>Complete setup and start browsing your Stash library</li>
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
          style={{
            color: theme?.properties?.["--text-primary"] || "#ffffff",
          }}
        >
          Before you begin:
        </p>
        <p
          className="text-sm"
          style={{
            color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
          }}
        >
          Make sure your Stash server is running and accessible. Peek connects
          to Stash via the STASH_URL and STASH_API_KEY environment variables.
        </p>
      </div>
    </div>

    <Button onClick={onNext} variant="primary" fullWidth size="lg">
      Get Started
    </Button>
  </div>
);

// Step 2: Create Admin Account - defined outside to avoid recreation on re-render
const AdminPasswordStep = ({
  theme,
  error,
  loading,
  adminPassword,
  confirmPassword,
  onAdminPasswordChange,
  onConfirmPasswordChange,
  onBack,
  onSubmit,
}) => (
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
            backgroundColor: theme?.properties?.["--bg-secondary"] || "#0a0a0a",
            borderColor: theme?.properties?.["--border-color"] || "#404040",
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
        <p
          className="text-xs mb-1"
          style={{
            color: theme?.properties?.["--text-muted"] || "#666666",
          }}
        >
          8+ characters with at least one letter and one number
        </p>
        <input
          type="password"
          value={adminPassword}
          onChange={onAdminPasswordChange}
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
          onChange={onConfirmPasswordChange}
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
      <Button onClick={onBack} variant="tertiary" fullWidth>
        Back
      </Button>
      <Button
        onClick={onSubmit}
        disabled={loading || !adminPassword || !confirmPassword}
        variant="primary"
        fullWidth
        size="lg"
        loading={loading}
      >
        Create Admin User
      </Button>
    </div>
  </div>
);

// Step 3: Stash Configuration - defined outside to avoid recreation on re-render
const StashConfigStep = ({
  theme,
  error,
  loading,
  testing,
  testSuccess,
  stashUrl,
  stashApiKey,
  onStashUrlChange,
  onStashApiKeyChange,
  onTestConnection,
  onBack,
  onSubmit,
}) => (
  <div className="space-y-6">
    <div>
      <h2
        className="text-2xl font-bold mb-2"
        style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}
      >
        Connect to Stash
      </h2>
      <p
        style={{
          color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
        }}
      >
        Enter your Stash server details to connect Peek to your library
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

    {testSuccess && (
      <div
        className="p-4 rounded border-l-4"
        style={{
          backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
          borderColor: "#22c55e",
        }}
      >
        <p style={{ color: "#22c55e" }}>Connection successful!</p>
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
          Stash URL
        </label>
        <input
          type="text"
          value={stashUrl}
          onChange={onStashUrlChange}
          className="w-full px-3 py-2 rounded border focus:outline-none focus:ring-2"
          style={{
            backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
            borderColor: theme?.properties?.["--border-color"] || "#404040",
            color: theme?.properties?.["--text-primary"] || "#ffffff",
          }}
          placeholder="http://localhost:9999/graphql"
        />
        <p
          className="text-xs mt-1"
          style={{ color: theme?.properties?.["--text-secondary"] || "#b3b3b3" }}
        >
          The full URL to your Stash GraphQL endpoint (usually ends with /graphql)
        </p>
      </div>

      <div>
        <label
          className="block text-sm font-semibold mb-1"
          style={{
            color: theme?.properties?.["--text-primary"] || "#ffffff",
          }}
        >
          API Key
        </label>
        <input
          type="password"
          value={stashApiKey}
          onChange={onStashApiKeyChange}
          className="w-full px-3 py-2 rounded border focus:outline-none focus:ring-2"
          style={{
            backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
            borderColor: theme?.properties?.["--border-color"] || "#404040",
            color: theme?.properties?.["--text-primary"] || "#ffffff",
          }}
          placeholder="Your Stash API key"
        />
        <p
          className="text-xs mt-1"
          style={{ color: theme?.properties?.["--text-secondary"] || "#b3b3b3" }}
        >
          Found in Stash Settings → Security → API Key
        </p>
      </div>
    </div>

    <div className="flex gap-4">
      <Button onClick={onBack} variant="tertiary" fullWidth>
        Back
      </Button>
      <Button
        onClick={onTestConnection}
        disabled={testing || !stashUrl || !stashApiKey}
        variant="secondary"
        fullWidth
        loading={testing}
      >
        Test Connection
      </Button>
    </div>

    <Button
      onClick={onSubmit}
      disabled={loading || !testSuccess}
      variant="primary"
      fullWidth
      size="lg"
      loading={loading}
    >
      Save & Continue
    </Button>
  </div>
);

// Step 4: Complete - defined outside to avoid recreation on re-render
const CompleteStep = ({ theme, onComplete }) => (
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

    <Button onClick={onComplete} variant="primary" fullWidth size="lg">
      Start Browsing
    </Button>
  </div>
);

const SetupWizard = ({ onSetupComplete, setupStatus }) => {
  const { theme } = useTheme();
  const { login } = useAuth();
  const [currentStep, setCurrentStep] = useState(() => {
    // If both users and stash instance exist, go straight to complete
    if (setupStatus?.hasUsers && setupStatus?.hasStashInstance) {
      return 3; // Skip to Complete
    }
    // If users exist but no stash instance, skip to Stash config
    if (setupStatus?.hasUsers && !setupStatus?.hasStashInstance) {
      return 2; // Skip to Stash config
    }
    return 0; // Start from beginning
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Admin credentials
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Stash configuration
  const [stashUrl, setStashUrl] = useState("");
  const [stashApiKey, setStashApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  const steps = ["Welcome", "Create Admin User", "Connect to Stash", "Complete"];

  const createAdminUser = async () => {
    if (adminPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (adminPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[a-zA-Z]/.test(adminPassword)) {
      setError("Password must contain at least one letter");
      return;
    }
    if (!/[0-9]/.test(adminPassword)) {
      setError("Password must contain at least one number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await setupApi.createFirstAdmin("admin", adminPassword);

      if (response.success) {
        // Auto-login with the just-created credentials using AuthContext
        // This properly updates the authentication state to prevent redirect loops
        try {
          const loginResult = await login({
            username: "admin",
            password: adminPassword,
          });
          if (!loginResult.success) {
            console.warn("Auto-login failed, user will need to log in manually");
          }
        } catch (loginErr) {
          console.warn("Auto-login failed:", loginErr);
        }
        // Clear password from memory immediately for security
        setAdminPassword("");
        setConfirmPassword("");
        // Skip Stash config step if instance already exists (e.g., from env vars)
        if (setupStatus?.hasStashInstance) {
          setCurrentStep(3); // Go to Complete
        } else {
          setCurrentStep(2); // Go to Stash config
        }
      } else {
        setError(response.error || "Failed to create admin user");
      }
    } catch (err) {
      setError(
        "Failed to create admin user: " + (err.message || "Unknown error")
      );
    } finally {
      setLoading(false);
    }
  };

  const testStashConnection = async () => {
    setTesting(true);
    setError("");
    setTestSuccess(false);

    try {
      const response = await setupApi.testStashConnection(stashUrl, stashApiKey);

      if (response.success) {
        setTestSuccess(true);
      } else {
        setError(response.error || "Connection test failed");
      }
    } catch (err) {
      setError(err.data?.error || err.message || "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const createStashInstance = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await setupApi.createFirstStashInstance(
        stashUrl,
        stashApiKey
      );

      if (response.success) {
        setCurrentStep(3);
      } else {
        setError(response.error || "Failed to save Stash configuration");
      }
    } catch (err) {
      setError(
        err.data?.error ||
          err.message ||
          "Failed to save Stash configuration"
      );
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep theme={theme} onNext={() => setCurrentStep(1)} />;
      case 1:
        return (
          <AdminPasswordStep
            theme={theme}
            error={error}
            loading={loading}
            adminPassword={adminPassword}
            confirmPassword={confirmPassword}
            onAdminPasswordChange={(e) => setAdminPassword(e.target.value)}
            onConfirmPasswordChange={(e) => setConfirmPassword(e.target.value)}
            onBack={() => setCurrentStep(0)}
            onSubmit={createAdminUser}
          />
        );
      case 2:
        return (
          <StashConfigStep
            theme={theme}
            error={error}
            loading={loading}
            testing={testing}
            testSuccess={testSuccess}
            stashUrl={stashUrl}
            stashApiKey={stashApiKey}
            onStashUrlChange={(e) => {
              setStashUrl(e.target.value);
              setTestSuccess(false); // Reset test status when URL changes
            }}
            onStashApiKeyChange={(e) => {
              setStashApiKey(e.target.value);
              setTestSuccess(false); // Reset test status when API key changes
            }}
            onTestConnection={testStashConnection}
            onBack={() => {
              setCurrentStep(1);
              setError("");
              setTestSuccess(false);
            }}
            onSubmit={createStashInstance}
          />
        );
      case 3:
        return <CompleteStep theme={theme} onComplete={onSetupComplete} />;
      default:
        return <WelcomeStep theme={theme} onNext={() => setCurrentStep(1)} />;
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"
      style={{
        backgroundColor: theme?.properties?.["--bg-primary"] || "#0f0f0f",
      }}
    >
      <div className="max-w-2xl w-full">
        {/* Resume setup message */}
        {setupStatus?.hasUsers && currentStep === 2 && (
          <div className="mb-4 p-4 rounded border-l-4" style={{
            backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
            borderColor: theme?.properties?.["--accent-color"] || "#3b82f6",
          }}>
            <p style={{ color: theme?.properties?.["--text-primary"] || "#ffffff" }}>
              Resuming setup - admin account already exists
            </p>
          </div>
        )}

        {/* Progress indicator */}
        {currentStep < 3 && (
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
                backgroundColor: theme?.properties?.["--bg-card"] || "#1f1f1f",
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
