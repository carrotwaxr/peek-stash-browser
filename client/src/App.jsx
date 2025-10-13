import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  useParams,
} from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./components/Home.jsx";
import Scenes from "./components/Scenes.jsx";
import Performers from "./components/Performers.jsx";
import Studios from "./components/Studios.jsx";
import Tags from "./components/Tags.jsx";
import VideoPlayer from "./components/VideoPlayer.jsx";
import PerformerDetail from "./components/PerformerDetail.jsx";
import StudioDetail from "./components/StudioDetail.jsx";
import TagDetail from "./components/TagDetail.jsx";
import Login from "./components/Login.jsx";
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
