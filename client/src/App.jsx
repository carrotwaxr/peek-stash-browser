import { Suspense, lazy, useEffect, useState } from "react";
import { Route, BrowserRouter as Router, Routes, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Login from "./components/pages/Login.jsx";
import ForgotPasswordPage from "./components/pages/ForgotPasswordPage.jsx";
import SetupWizard from "./components/pages/SetupWizard.jsx";
import { GlobalLayout } from "./components/ui/index.js";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { ConfigProvider } from "./contexts/ConfigContext.jsx";
import { TVModeProvider } from "./contexts/TVModeProvider.jsx";
import { UnitPreferenceProvider } from "./contexts/UnitPreferenceProvider.jsx";
import { CardDisplaySettingsProvider } from "./contexts/CardDisplaySettingsContext.jsx";
import { SetupGuard, LoginGuard, ProtectedRoute } from "./components/guards/RouteGuards.jsx";
import { setupApi } from "./services/api.js";
import { ThemeProvider } from "./themes/ThemeProvider.jsx";
import "./themes/base.css";

// Lazy load page components for code splitting
const Home = lazy(() => import("./components/pages/Home.jsx"));
const Scenes = lazy(() => import("./components/pages/Scenes.jsx"));
const Recommended = lazy(() => import("./components/pages/Recommended.jsx"));
const Performers = lazy(() => import("./components/pages/Performers.jsx"));
const Studios = lazy(() => import("./components/pages/Studios.jsx"));
const Tags = lazy(() => import("./components/pages/Tags.jsx"));
const Groups = lazy(() => import("./components/pages/Groups.jsx"));
const Galleries = lazy(() => import("./components/pages/Galleries.jsx"));
const Images = lazy(() => import("./components/pages/Images.jsx"));
const GalleryDetail = lazy(
  () => import("./components/pages/GalleryDetail.jsx")
);
const GroupDetail = lazy(() => import("./components/pages/GroupDetail.jsx"));
const Scene = lazy(() => import("./components/pages/Scene.jsx"));
const PerformerDetail = lazy(
  () => import("./components/pages/PerformerDetail.jsx")
);
const StudioDetail = lazy(() => import("./components/pages/StudioDetail.jsx"));
const TagDetail = lazy(() => import("./components/pages/TagDetail.jsx"));
const Playlists = lazy(() => import("./components/pages/Playlists.jsx"));
const PlaylistDetail = lazy(
  () => import("./components/pages/PlaylistDetail.jsx")
);
const SettingsPage = lazy(() => import("./components/pages/SettingsPage.jsx"));
const WatchHistory = lazy(() => import("./components/pages/WatchHistory.jsx"));
const UserStats = lazy(() => import("./components/pages/UserStats/index.js"));
const HiddenItemsPage = lazy(
  () => import("./components/pages/HiddenItemsPage.jsx")
);
const Downloads = lazy(() => import("./components/pages/Downloads.jsx"));
const Clips = lazy(() => import("./components/pages/Clips.jsx"));
const CarouselBuilder = lazy(
  () => import("./components/carousel-builder/CarouselBuilder.jsx")
);

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-xl">Loading...</div>
  </div>
);

// Main app component with authentication and routing
const AppContent = () => {
  const [setupStatus, setSetupStatus] = useState(null);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const status = await setupApi.getSetupStatus();
        setSetupStatus(status);
      } catch (error) {
        console.error("Failed to check setup status:", error);
        // If check fails, assume setup is not complete
        setSetupStatus({ setupComplete: false, hasUsers: false, hasStashInstance: false });
      } finally {
        setCheckingSetup(false);
      }
    };

    checkSetup();
  }, []);

  // Handler for when setup completes - triggers re-check and navigation
  const handleSetupComplete = () => {
    setSetupStatus({ ...setupStatus, setupComplete: true });
    // Navigate to home after setup (user is already logged in via auto-login)
    window.location.href = "/";
  };

  // Ensure setupStatus has defaults to prevent null access in guards
  const safeSetupStatus = setupStatus || { setupComplete: false, hasUsers: false, hasStashInstance: false };

  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Setup wizard route */}
          <Route
            path="/setup"
            element={
              <SetupGuard setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <SetupWizard
                  setupStatus={safeSetupStatus}
                  onSetupComplete={handleSetupComplete}
                />
              </SetupGuard>
            }
          />

          {/* Login route */}
          <Route
            path="/login"
            element={
              <LoginGuard setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <Login />
              </LoginGuard>
            }
          />

          {/* Forgot password route */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Protected app routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Home />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/scenes"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Scenes />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/recommended"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Recommended />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/performers"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Performers />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studios"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Studios />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tags"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Tags />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/collections"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Groups />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/galleries"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Galleries />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/images"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Images />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/gallery/:galleryId"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <GalleryDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/performer/:performerId"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <PerformerDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/:studioId"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <StudioDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tag/:tagId"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <TagDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/collection/:groupId"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <GroupDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/watch-history"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <WatchHistory />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-stats"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <UserStats />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/hidden-items"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <HiddenItemsPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/downloads"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Downloads />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <SettingsPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          {/* Redirects from legacy routes */}
          <Route
            path="/my-settings"
            element={<Navigate to="/settings?section=user&tab=theme" replace />}
          />
          <Route
            path="/server-settings"
            element={<Navigate to="/settings?section=server&tab=user-management" replace />}
          />
          <Route
            path="/playlists"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Playlists />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clips"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Clips />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/playlist/:playlistId"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <PlaylistDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/scene/:sceneId"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <Scene />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/carousels/new"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <CarouselBuilder />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/carousels/:id/edit"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <CarouselBuilder />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect - send unknown routes to home (guards will handle auth) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ConfigProvider>
          <UnitPreferenceProvider>
            <TVModeProvider>
              <CardDisplaySettingsProvider>
                <AppContent />
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 3000,
                    style: {
                      padding: "0",
                    },
                  }}
                />
              </CardDisplaySettingsProvider>
            </TVModeProvider>
          </UnitPreferenceProvider>
        </ConfigProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
