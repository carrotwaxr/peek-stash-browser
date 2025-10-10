import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./components/Home.jsx";
import Scenes from "./components/Scenes.jsx";
import Performers from "./components/Performers.jsx";
import Studios from "./components/Studios.jsx";
import Tags from "./components/Tags.jsx";
import VideoPlayer from "./components/VideoPlayer.jsx";
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
          <Route path="/player/:sceneId" element={<VideoPlayerWrapper />} />
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

export default App;
