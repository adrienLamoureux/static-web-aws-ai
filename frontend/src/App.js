import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import About from "./pages/About";
import Whisk from "./pages/Whisk";
import Story from "./pages/Story";
import StoryMusicLibrary from "./pages/StoryMusicLibrary";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import RequireAuth from "./components/auth/RequireAuth";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import "./themes/moescape.css";

const mergeCognitoConfig = (base = {}, override = {}) => ({
  domain: override.domain || base.domain || "",
  clientId: override.clientId || base.clientId || "",
  userPoolId: override.userPoolId || base.userPoolId || "",
  region: override.region || base.region || "",
});

const MOESCAPE_PANE_META = {
  whisk: {
    label: "Image Dock",
    route: "/",
    subtitle: "Visual generation cockpit",
  },
  story: {
    label: "Story Tavern",
    route: "/story",
    subtitle: "Narrative and scene direction",
  },
  music: {
    label: "Sound Mixer",
    route: "/music-library",
    subtitle: "Music library and curation",
  },
  about: {
    label: "Project Profile",
    route: "/about",
    subtitle: "Platform overview and intent",
  },
};

const MoescapeHubPage = ({ apiBaseUrl, activePane }) => {
  const paneByKey = {
    whisk: <Whisk apiBaseUrl={apiBaseUrl} />,
    story: <Story apiBaseUrl={apiBaseUrl} />,
    music: <StoryMusicLibrary apiBaseUrl={apiBaseUrl} />,
    about: <About />,
  };

  return (
    <div className="moescape-hub-layout">
      <aside className="moescape-hub-nav">
        <p className="moescape-hub-eyebrow">Creative Routes</p>
        <div className="moescape-hub-links">
          {Object.entries(MOESCAPE_PANE_META).map(([key, item]) => (
            <Link
              key={key}
              to={item.route}
              className={`moescape-hub-link${activePane === key ? " is-active" : ""}`}
            >
              <span className="moescape-hub-link-title">{item.label}</span>
              <span className="moescape-hub-link-copy">{item.subtitle}</span>
            </Link>
          ))}
        </div>
        <div className="moescape-hub-chip-grid">
          <span className="moescape-hub-chip">Moechan Beta</span>
          <span className="moescape-hub-chip">Live Reactions</span>
          <span className="moescape-hub-chip">Prompt Remix</span>
        </div>
      </aside>

      <section className="moescape-hub-stage" key={activePane}>
        <div className="moescape-hub-stage-head">
          <p className="moescape-hub-stage-tag">
            {MOESCAPE_PANE_META[activePane].label}
          </p>
          <h2>{MOESCAPE_PANE_META[activePane].subtitle}</h2>
        </div>
        <div className="moescape-hub-stage-body">{paneByKey[activePane]}</div>
      </section>

      <aside className="moescape-hub-side">
        <div className="moescape-side-card">
          <p className="moescape-side-card-title">Daily Mochi</p>
          <p className="moescape-side-card-value">50</p>
          <p className="moescape-side-card-copy">Refreshes in 06:22:19</p>
        </div>
        <div className="moescape-side-card">
          <p className="moescape-side-card-title">Trending Tags</p>
          <div className="moescape-side-tags">
            <span>#neon-city</span>
            <span>#hero-poster</span>
            <span>#slice-of-life</span>
            <span>#cyber-yokai</span>
          </div>
        </div>
      </aside>
    </div>
  );
};

const AppShell = ({ apiBaseUrl }) => {
  const { isAuthenticated, logout, user } = useAuth();
  const location = useLocation();
  const activePath = location.pathname;
  const isWhiskPath = activePath === "/" || activePath === "/whisk";

  return (
    <div className="app-shell relative min-h-screen overflow-hidden">
      <div className="moescape-atmosphere" aria-hidden="true">
        <span className="moescape-bloom moescape-bloom--one" />
        <span className="moescape-bloom moescape-bloom--two" />
        <span className="moescape-bloom moescape-bloom--three" />
        <span className="moescape-stars" />
      </div>
      <div className="pointer-events-none absolute inset-0 noise-layer opacity-60" />
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_center,_rgba(196,178,141,0.24),_transparent_70%)] blur-3xl" />
      {isAuthenticated && (
        <header className="app-shell-header relative z-10 mx-auto flex w-full max-w-[1240px] items-center justify-between px-6 py-6 md:px-10">
          <Link
            to="/"
            className="app-shell-brand text-lg font-semibold tracking-tight text-ink font-display"
          >
            Whisk Studio
          </Link>
          <nav className="app-shell-nav flex items-center gap-5 text-sm font-medium">
            <Link to="/" className={`nav-link${isWhiskPath ? " is-active" : ""}`}>
              Whisk
            </Link>
            <Link
              to="/story"
              className={`nav-link${activePath === "/story" ? " is-active" : ""}`}
            >
              Story
            </Link>
            <Link
              to="/music-library"
              className={`nav-link${activePath === "/music-library" ? " is-active" : ""}`}
            >
              Music
            </Link>
            <Link
              to="/about"
              className={`nav-link${activePath === "/about" ? " is-active" : ""}`}
            >
              About
            </Link>
          </nav>
          <div className="app-shell-user nav-user">
            <span className="nav-user-email">{user?.email || "Signed in"}</span>
            <button type="button" className="btn-ghost px-4 py-1 text-xs" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
      )}
      <main className="app-shell-main relative z-10">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <MoescapeHubPage apiBaseUrl={apiBaseUrl} activePane="whisk" />
              </RequireAuth>
            }
          />
          <Route
            path="/whisk"
            element={
              <RequireAuth>
                <MoescapeHubPage apiBaseUrl={apiBaseUrl} activePane="whisk" />
              </RequireAuth>
            }
          />
          <Route
            path="/story"
            element={
              <RequireAuth>
                <MoescapeHubPage apiBaseUrl={apiBaseUrl} activePane="story" />
              </RequireAuth>
            }
          />
          <Route
            path="/music-library"
            element={
              <RequireAuth>
                <MoescapeHubPage apiBaseUrl={apiBaseUrl} activePane="music" />
              </RequireAuth>
            }
          />
          <Route
            path="/about"
            element={
              <RequireAuth>
                <MoescapeHubPage apiBaseUrl={apiBaseUrl} activePane="about" />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  const [runtimeConfig, setRuntimeConfig] = useState({
    apiBaseUrl: "",
    cognito: {},
  });
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch("/config.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setRuntimeConfig({
          apiBaseUrl: data.apiBaseUrl || "",
          cognito: data.cognito || {},
        });
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setConfigReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const envApiUrl = process.env.REACT_APP_API_URL || "";
  const envCognito = {
    domain: process.env.REACT_APP_COGNITO_DOMAIN || "",
    clientId: process.env.REACT_APP_COGNITO_CLIENT_ID || "",
    userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || "",
    region: process.env.REACT_APP_COGNITO_REGION || "",
  };

  const resolvedApiBaseUrl = useMemo(() => {
    if (envApiUrl && typeof window !== "undefined") {
      if (window.location.hostname === "localhost") {
        return envApiUrl;
      }
    }
    return runtimeConfig.apiBaseUrl || envApiUrl || "";
  }, [envApiUrl, runtimeConfig.apiBaseUrl]);

  const resolvedCognito = useMemo(
    () => mergeCognitoConfig(runtimeConfig.cognito, envCognito),
    [envCognito, runtimeConfig.cognito]
  );

  const hasEnvConfig = Boolean(envCognito.domain && envCognito.clientId);
  const isReady = configReady || hasEnvConfig;

  if (!isReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card glass-panel">
          <p className="auth-loading">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider cognito={resolvedCognito}>
      <Router>
        <AppShell apiBaseUrl={resolvedApiBaseUrl} />
      </Router>
    </AuthProvider>
  );
}

export default App;
