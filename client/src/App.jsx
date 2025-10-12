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
import { ThemeProvider } from "./themes/ThemeProvider.jsx";
import "./themes/base.css";

function App() {
  return (
    <ThemeProvider>
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
