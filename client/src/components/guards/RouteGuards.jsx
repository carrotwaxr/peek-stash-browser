import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { REDIRECT_STORAGE_KEY } from '../../services/api.js';
import UserSetupModal from '../modals/UserSetupModal.jsx';

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
 * - If user is NOT authenticated → redirect to "/login"
 * - If user hasn't completed first-login setup → show UserSetupModal
 * - Otherwise → render children
 */
export const ProtectedRoute = ({ children, setupStatus, checkingSetup }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const [setupComplete, setSetupComplete] = useState(false);

  if (isLoading || checkingSetup) {
    return <LoadingSpinner />;
  }

  if (!setupStatus.setupComplete) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    const currentUrl = location.pathname + location.search;
    if (currentUrl !== "/" && currentUrl !== "/?") {
      sessionStorage.setItem(REDIRECT_STORAGE_KEY, currentUrl);
    }
    return <Navigate to="/login" replace />;
  }

  // Show first-login setup modal if user hasn't completed it
  if (user && !user.setupCompleted && !setupComplete) {
    return (
      <>
        {children}
        <UserSetupModal onComplete={() => setSetupComplete(true)} />
      </>
    );
  }

  return children;
};
