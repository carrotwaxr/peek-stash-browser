import React, { useState } from "react";
import { setupApi } from "../../services/api.js";
import { useTheme } from "../../themes/useTheme.js";
import { Button } from "../ui/index.js";

const SetupWizard = ({ onSetupComplete }) => {
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Admin credentials
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const steps = ["Welcome", "Create Admin User", "Complete"];

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

      <Button
        onClick={() => setCurrentStep(1)}
        variant="primary"
        fullWidth
        size="lg"
      >
        Get Started
      </Button>
    </div>
  );

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
      const response = await setupApi.createFirstAdmin("admin", adminPassword);

      if (response.success) {
        setCurrentStep(2);
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

  // Step 2: Create Admin Account
  const AdminPasswordStep = () => (
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
        <Button onClick={() => setCurrentStep(0)} variant="tertiary" fullWidth>
          Back
        </Button>
        <Button
          onClick={createAdminUser}
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

  // Step 3: Complete
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

      <Button onClick={onSetupComplete} variant="primary" fullWidth size="lg">
        Go to Login
      </Button>
    </div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep />;
      case 1:
        return <AdminPasswordStep />;
      case 2:
        return <CompleteStep />;
      default:
        return <WelcomeStep />;
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
        {/* Progress indicator */}
        {currentStep < 2 && (
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
