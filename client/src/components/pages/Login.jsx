import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { useTheme } from "../../themes/useTheme.js";
import { Button } from "../ui/index.js";
import { REDIRECT_STORAGE_KEY } from "../../services/api.js";
import { getLandingPage } from "../../constants/navigation.js";

const Login = () => {
  const { login } = useAuth();
  const { theme } = useTheme();
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await login(credentials);

      if (result.success) {
        // Check for saved redirect URL (takes priority over preference)
        const redirectUrl = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
        if (redirectUrl) {
          sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
          window.location.href = redirectUrl;
        } else {
          // Use landing page preference if available
          const destination = getLandingPage(result.user?.landingPagePreference);
          window.location.href = destination;
        }
      } else {
        setError(result.error || "Login failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"
      style={{
        backgroundColor: theme?.properties?.["--bg-primary"] || "#0f0f0f",
      }}
    >
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1
            className="mt-6 text-center text-3xl font-extrabold"
            style={{
              color: theme?.properties?.["--text-primary"] || "#ffffff",
            }}
          >
            Peek Stash Browser
          </h1>
          <p
            className="mt-2 text-center text-sm"
            style={{
              color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
            }}
          >
            Sign in to your account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={credentials.username}
                onChange={handleChange}
                className="relative block w-full px-3 py-2 border rounded-t-md placeholder-gray-500 focus:outline-none focus:ring-2 focus:z-10 sm:text-sm"
                style={{
                  backgroundColor:
                    theme?.properties?.["--bg-card"] || "#1f1f1f",
                  borderColor:
                    theme?.properties?.["--border-color"] || "#404040",
                  color: theme?.properties?.["--text-primary"] || "#ffffff",
                }}
                placeholder="Username"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={credentials.password}
                onChange={handleChange}
                className="relative block w-full px-3 py-2 border rounded-b-md placeholder-gray-500 focus:outline-none focus:ring-2 focus:z-10 sm:text-sm"
                style={{
                  backgroundColor:
                    theme?.properties?.["--bg-card"] || "#1f1f1f",
                  borderColor:
                    theme?.properties?.["--border-color"] || "#404040",
                  color: theme?.properties?.["--text-primary"] || "#ffffff",
                }}
                placeholder="Password"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <div>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isLoading}
            >
              Sign in
            </Button>
          </div>

          <div className="text-center">
            <Link
              to="/forgot-password"
              className="text-sm hover:underline"
              style={{
                color: theme?.properties?.["--text-muted"] || "#808080",
              }}
            >
              Forgot your password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
