import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { REDIRECT_STORAGE_KEY } from '../../services/api.js';

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-xl">Loading...</div>
  </div>
);

/**
 * SetupGuard - Wraps the setup wizard route
 * - If setup is complete AND user is authenticated → redirect to "/"
 * - If setup is complete AND user is NOT authenticated → redirect to "/login"
 * - Otherwise → render children (show setup wizard)
 */
export const SetupGuard = ({ children, setupStatus, checkingSetup }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || checkingSetup) {
    return <LoadingSpinner />;
  }

  if (setupStatus.setupComplete) {
    if (isAuthenticated) {
      return <Navigate to="/" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return children;
};

/**
 * LoginGuard - Wraps the login route
 * - If setup is NOT complete → redirect to "/setup"
 * - If user is authenticated → redirect to "/"
 * - Otherwise → render children (show login)
 */
export const LoginGuard = ({ children, setupStatus, checkingSetup }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || checkingSetup) {
    return <LoadingSpinner />;
  }

  if (!setupStatus.setupComplete) {
    return <Navigate to="/setup" replace />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

/**
 * ProtectedRoute - Wraps all authenticated app routes
 * - If setup is NOT complete → redirect to "/setup"
 * - If user is NOT authenticated → redirect to "/login" (saves current URL for redirect after login)
 * - Otherwise → render children
 */
export const ProtectedRoute = ({ children, setupStatus, checkingSetup }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading || checkingSetup) {
    return <LoadingSpinner />;
  }

  if (!setupStatus.setupComplete) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    // Save current URL for redirect after login (but not "/" since that's the default)
    const currentUrl = location.pathname + location.search;
    if (currentUrl !== "/" && currentUrl !== "/?") {
      sessionStorage.setItem(REDIRECT_STORAGE_KEY, currentUrl);
    }
    return <Navigate to="/login" replace />;
  }

  return children;
};
