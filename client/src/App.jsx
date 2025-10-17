import { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Layout from "./components/ui/Layout.jsx";
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
              <Layout>
                <Home />
              </Layout>
            }
          />
          <Route
            path="/scenes"
            element={
              <Layout>
                <Scenes />
              </Layout>
            }
          />
          <Route
            path="/performers"
            element={
              <Layout>
                <Performers />
              </Layout>
            }
          />
          <Route
            path="/studios"
            element={
              <Layout>
                <Studios />
              </Layout>
            }
          />
          <Route
            path="/tags"
            element={
              <Layout>
                <Tags />
              </Layout>
            }
          />
          <Route
            path="/performer/:performerId"
            element={
              <Layout>
                <PerformerDetail />
              </Layout>
            }
          />
          <Route
            path="/studio/:studioId"
            element={
              <Layout>
                <StudioDetail />
              </Layout>
            }
          />
          <Route
            path="/tag/:tagId"
            element={
              <Layout>
                <TagDetail />
              </Layout>
            }
          />
          <Route
            path="/my-settings"
            element={
              <Layout>
                <Settings />
              </Layout>
            }
          />
          <Route
            path="/server-settings"
            element={
              <Layout>
                <ServerSettings />
              </Layout>
            }
          />
          <Route
            path="/playlists"
            element={
              <Layout>
                <Playlists />
              </Layout>
            }
          />
          <Route
            path="/playlist/:playlistId"
            element={
              <Layout>
                <PlaylistDetail />
              </Layout>
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
