import { Suspense, lazy } from "react";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";
import type { GetSetupStatusResponse } from "@peek/shared-types";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "react-hot-toast";
import { queryClient, queryKeys } from "./api";
import {
  LoginGuard,
  ProtectedRoute,
  SetupGuard,
} from "./components/guards/RouteGuards";
import { SetupStatusGate } from "./components/guards/SetupStatusGate";
import ForgotPasswordPage from "./components/pages/ForgotPasswordPage";
import Login from "./components/pages/Login";
import SetupWizard from "./components/pages/SetupWizard";
import { GlobalLayout } from "./components/ui/index";
import { PUBLIC_ROUTES } from "./constants/navigation";
import { AuthProvider } from "./contexts/AuthContext";
import { CardDisplaySettingsProvider } from "./contexts/CardDisplaySettingsContext";
import { ConfigProvider } from "./contexts/ConfigContext";
import { TVModeProvider } from "./contexts/TVModeProvider";
import { UnitPreferenceProvider } from "./contexts/UnitPreferenceProvider";
import { ThemeProvider } from "./themes/ThemeProvider";
import "./themes/base.css";

// Lazy load page components for code splitting
const Home = lazy(() => import("./components/pages/Home"));
const Scenes = lazy(() => import("./components/pages/Scenes"));
const Recommended = lazy(() => import("./components/pages/Recommended"));
const Performers = lazy(() => import("./components/pages/Performers"));
const Studios = lazy(() => import("./components/pages/Studios"));
const Tags = lazy(() => import("./components/pages/Tags"));
const Groups = lazy(() => import("./components/pages/Groups"));
const Galleries = lazy(() => import("./components/pages/Galleries"));
const Images = lazy(() => import("./components/pages/Images"));
const GalleryDetail = lazy(() => import("./components/pages/GalleryDetail"));
const GroupDetail = lazy(() => import("./components/pages/GroupDetail"));
const Scene = lazy(() => import("./components/pages/Scene"));
const PerformerDetail = lazy(
  () => import("./components/pages/PerformerDetail")
);
const StudioDetail = lazy(() => import("./components/pages/StudioDetail"));
const TagDetail = lazy(() => import("./components/pages/TagDetail"));
const Playlists = lazy(() => import("./components/pages/Playlists"));
const PlaylistDetail = lazy(() => import("./components/pages/PlaylistDetail"));
const SettingsPage = lazy(() => import("./components/pages/SettingsPage"));
const WatchHistory = lazy(() => import("./components/pages/WatchHistory"));
const UserStats = lazy(() => import("./components/pages/UserStats"));
const HiddenItemsPage = lazy(
  () => import("./components/pages/HiddenItemsPage")
);
const Downloads = lazy(() => import("./components/pages/Downloads"));
const Clips = lazy(() => import("./components/pages/Clips"));
const CarouselBuilder = lazy(
  () => import("./components/carousel-builder/CarouselBuilder")
);

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-xl">Loading...</div>
  </div>
);

// Main app component with authentication and routing
const AppContent = () => {
  const client = useQueryClient();

  // Setup has just completed: the wizard is done, so the next load goes to
  // Home (the user is already logged in via auto-login)
  const handleSetupComplete = () => {
    client.setQueryData<GetSetupStatusResponse>(
      queryKeys.setup.status(),
      (status) => status && { ...status, setupComplete: true }
    );
    window.location.href = "/";
  };

  return (
    <SetupStatusGate>
      {(setupStatus) => (
        <AppRoutes
          setupStatus={setupStatus}
          onSetupComplete={handleSetupComplete}
        />
      )}
    </SetupStatusGate>
  );
};

/** The routes, given the loaded setup status */
const AppRoutes = ({
  setupStatus,
  onSetupComplete,
}: {
  setupStatus: GetSetupStatusResponse;
  onSetupComplete: () => void;
}) => {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Setup wizard route */}
          <Route
            path={PUBLIC_ROUTES.setup}
            element={
              <SetupGuard setupStatus={setupStatus}>
                <SetupWizard
                  setupStatus={setupStatus}
                  onSetupComplete={onSetupComplete}
                />
              </SetupGuard>
            }
          />

          {/* Login route */}
          <Route
            path={PUBLIC_ROUTES.login}
            element={
              <LoginGuard setupStatus={setupStatus}>
                <Login />
              </LoginGuard>
            }
          />

          {/* Forgot password route */}
          <Route
            path={PUBLIC_ROUTES.forgotPassword}
            element={<ForgotPasswordPage />}
          />

          {/* Protected app routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Home />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/scenes"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Scenes />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/recommended"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Recommended />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/performers"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Performers />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studios"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Studios />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tags"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Tags />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/collections"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Groups />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/galleries"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Galleries />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/images"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Images />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/gallery/:galleryId"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <GalleryDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/performer/:performerId"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <PerformerDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/:studioId"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <StudioDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tag/:tagId"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <TagDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/collection/:groupId"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <GroupDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/watch-history"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <WatchHistory />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-stats"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <UserStats />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/hidden-items"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <HiddenItemsPage />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/downloads"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Downloads />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
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
            element={
              <Navigate
                to="/settings?section=server&tab=user-management"
                replace
              />
            }
          />
          <Route
            path="/playlists"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Playlists />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clips"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Clips />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/playlist/:playlistId"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <PlaylistDetail />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/scene/:sceneId"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <Scene />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/carousels/new"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
                <GlobalLayout>
                  <CarouselBuilder />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/carousels/:id/edit"
            element={
              <ProtectedRoute setupStatus={setupStatus}>
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
    <AuthProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
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
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
