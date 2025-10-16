import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  useParams,
} from "react-router-dom";
import Layout from "./components/ui/Layout.jsx";
import Home from "./components/pages/Home.jsx";
import Scenes from "./components/pages/Scenes.jsx";
import Performers from "./components/pages/Performers.jsx";
import Studios from "./components/pages/Studios.jsx";
import Tags from "./components/pages/Tags.jsx";
import VideoPlayer from "./components/pages/VideoPlayer.jsx";
import PerformerDetail from "./components/pages/PerformerDetail.jsx";
import StudioDetail from "./components/pages/StudioDetail.jsx";
import TagDetail from "./components/pages/TagDetail.jsx";
import Login from "./components/pages/Login.jsx";
import Settings from "./components/pages/Settings.jsx";
import Playlists from "./components/pages/Playlists.jsx";
import PlaylistDetail from "./components/pages/PlaylistDetail.jsx";
import { ThemeProvider } from "./themes/ThemeProvider.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { useAuth } from "./hooks/useAuth.js";
import "./themes/base.css";

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
          path="/settings"
          element={
            <Layout>
              <Settings />
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
        <Route path="/player/:sceneId" element={<VideoPlayerWrapper />} />
        <Route path="/video/:sceneId" element={<VideoPlayerRouteWrapper />} />
      </Routes>
    </Router>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

// Wrapper to extract scene object from state
function VideoPlayerWrapper() {
  const location = useLocation();
  const scene = location.state?.scene;

  return <VideoPlayer scene={scene} />;
}

// Wrapper that gets scene data from navigation state
function VideoPlayerRouteWrapper() {
  const location = useLocation();
  const { sceneId } = useParams();
  const scene = location.state?.scene;

  if (!scene) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl mb-2">Scene not found</h2>
          <p className="text-gray-600">Scene ID: {sceneId}</p>
          <p className="text-sm text-gray-500 mt-2">
            Try navigating from the scenes or home page
          </p>
        </div>
      </div>
    );
  }

  return <VideoPlayer scene={scene} />;
}

export default App;
