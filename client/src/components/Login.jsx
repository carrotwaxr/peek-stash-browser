import React, { useState } from "react";
import { useTheme } from "../themes/useTheme";
import { useAuth } from "../hooks/useAuth.js";

const Login = ({ onLoginSuccess }) => {
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
        onLoginSuccess();
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
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
              style={{
                backgroundColor:
                  theme?.properties?.["--accent-primary"] || "#3b82f6",
                borderColor:
                  theme?.properties?.["--accent-primary"] || "#3b82f6",
              }}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </div>

          <div
            className="text-center text-sm"
            style={{
              color: theme?.properties?.["--text-secondary"] || "#b3b3b3",
            }}
          >
            <p>Default credentials:</p>
            <p>
              <strong>Username:</strong> admin
            </p>
            <p>
              <strong>Password:</strong> admin
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
