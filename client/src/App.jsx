import { lazy, Suspense, useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import GlobalLayout from "./components/ui/GlobalLayout.jsx";
import Login from "./components/pages/Login.jsx";
import SetupWizard from "./components/pages/SetupWizard.jsx";
import { ThemeProvider } from "./themes/ThemeProvider.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { TVModeProvider } from "./contexts/TVModeProvider.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { setupApi } from "./services/api.js";
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
const GalleryDetail = lazy(() =>
  import("./components/pages/GalleryDetail.jsx")
);
const GroupDetail = lazy(() => import("./components/pages/GroupDetail.jsx"));
const Scene = lazy(() => import("./components/pages/Scene.jsx"));
const PerformerDetail = lazy(() =>
  import("./components/pages/PerformerDetail.jsx")
);
const StudioDetail = lazy(() => import("./components/pages/StudioDetail.jsx"));
const TagDetail = lazy(() => import("./components/pages/TagDetail.jsx"));
const Settings = lazy(() => import("./components/pages/Settings.jsx"));
const Playlists = lazy(() => import("./components/pages/Playlists.jsx"));
const PlaylistDetail = lazy(() =>
  import("./components/pages/PlaylistDetail.jsx")
);
const ServerSettings = lazy(() =>
  import("./components/pages/ServerSettings.jsx")
);
const WatchHistory = lazy(() => import("./components/pages/WatchHistory.jsx"));
const GenderIconTest = lazy(() => import("./components/pages/GenderIconTest.jsx")); // TODO: Remove after gender icon review

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-xl">Loading...</div>
  </div>
);

// Main app component with authentication
const AppContent = () => {
  const { isAuthenticated, isLoading } = useAuth();
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
        setSetupStatus({ setupComplete: false });
      } finally {
        setCheckingSetup(false);
      }
    };

    checkSetup();
  }, []);

  if (isLoading || checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // Show setup wizard if setup is not complete
  if (!setupStatus?.setupComplete) {
    return (
      <SetupWizard
        onSetupComplete={() => {
          setSetupStatus({ setupComplete: true });
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => window.location.reload()} />;
  }

  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/"
            element={
              <GlobalLayout>
                <Home />
              </GlobalLayout>
            }
          />
          <Route
            path="/scenes"
            element={
              <GlobalLayout>
                <Scenes />
              </GlobalLayout>
            }
          />
          <Route
            path="/recommended"
            element={
              <GlobalLayout>
                <Recommended />
              </GlobalLayout>
            }
          />
          <Route
            path="/performers"
            element={
              <GlobalLayout>
                <Performers />
              </GlobalLayout>
            }
          />
          <Route
            path="/studios"
            element={
              <GlobalLayout>
                <Studios />
              </GlobalLayout>
            }
          />
          <Route
            path="/tags"
            element={
              <GlobalLayout>
                <Tags />
              </GlobalLayout>
            }
          />
          <Route
            path="/collections"
            element={
              <GlobalLayout>
                <Groups />
              </GlobalLayout>
            }
          />
          <Route
            path="/galleries"
            element={
              <GlobalLayout>
                <Galleries />
              </GlobalLayout>
            }
          />
          <Route
            path="/gallery/:galleryId"
            element={
              <GlobalLayout>
                <GalleryDetail />
              </GlobalLayout>
            }
          />
          <Route
            path="/performer/:performerId"
            element={
              <GlobalLayout>
                <PerformerDetail />
              </GlobalLayout>
            }
          />
          <Route
            path="/studio/:studioId"
            element={
              <GlobalLayout>
                <StudioDetail />
              </GlobalLayout>
            }
          />
          <Route
            path="/tag/:tagId"
            element={
              <GlobalLayout>
                <TagDetail />
              </GlobalLayout>
            }
          />
          <Route
            path="/collection/:groupId"
            element={
              <GlobalLayout>
                <GroupDetail />
              </GlobalLayout>
            }
          />
          <Route
            path="/my-settings"
            element={
              <GlobalLayout>
                <Settings />
              </GlobalLayout>
            }
          />
          <Route
            path="/watch-history"
            element={
              <GlobalLayout>
                <WatchHistory />
              </GlobalLayout>
            }
          />
          <Route
            path="/server-settings"
            element={
              <GlobalLayout>
                <ServerSettings />
              </GlobalLayout>
            }
          />
          <Route
            path="/gender-icon-test"
            element={
              <GlobalLayout>
                <GenderIconTest />
              </GlobalLayout>
            }
          />
          <Route
            path="/playlists"
            element={
              <GlobalLayout>
                <Playlists />
              </GlobalLayout>
            }
          />
          <Route
            path="/playlist/:playlistId"
            element={
              <GlobalLayout>
                <PlaylistDetail />
              </GlobalLayout>
            }
          />
          <Route
            path="/scene/:sceneId"
            element={
              <GlobalLayout>
                <Scene />
              </GlobalLayout>
            }
          />
        </Routes>
      </Suspense>
    </Router>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TVModeProvider>
          <AppContent />
          <Toaster
            position="bottom-center"
            toastOptions={{
              duration: 3000,
              style: {
                padding: "0",
              },
            }}
          />
        </TVModeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
