import { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import GlobalLayout from "./components/ui/GlobalLayout.jsx";
import Login from "./components/pages/Login.jsx";
import { ThemeProvider } from "./themes/ThemeProvider.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { useAuth } from "./hooks/useAuth.js";
import "./themes/base.css";

// Lazy load page components for code splitting
const Home = lazy(() => import("./components/pages/Home.jsx"));
const Scenes = lazy(() => import("./components/pages/Scenes.jsx"));
const Performers = lazy(() => import("./components/pages/Performers.jsx"));
const Studios = lazy(() => import("./components/pages/Studios.jsx"));
const Tags = lazy(() => import("./components/pages/Tags.jsx"));
const Scene = lazy(() => import("./components/pages/Scene.jsx"));
const PerformerDetail = lazy(() => import("./components/pages/PerformerDetail.jsx"));
const StudioDetail = lazy(() => import("./components/pages/StudioDetail.jsx"));
const TagDetail = lazy(() => import("./components/pages/TagDetail.jsx"));
const Settings = lazy(() => import("./components/pages/Settings.jsx"));
const Playlists = lazy(() => import("./components/pages/Playlists.jsx"));
const PlaylistDetail = lazy(() => import("./components/pages/PlaylistDetail.jsx"));
const ServerSettings = lazy(() => import("./components/pages/ServerSettings.jsx"));
const WatchHistory = lazy(() => import("./components/pages/WatchHistory.jsx"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-xl">Loading...</div>
  </div>
);

// Main app component with authentication
const AppContent = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
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
          <Route path="/scene/:sceneId" element={<Scene />} />
          {/* Legacy routes for backwards compatibility */}
          <Route path="/player/:sceneId" element={<Scene />} />
          <Route path="/video/:sceneId" element={<Scene />} />
        </Routes>
      </Suspense>
    </Router>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <Toaster
          position="bottom-center"
          toastOptions={{
            duration: 3000,
            style: {
              padding: '0',
            },
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
