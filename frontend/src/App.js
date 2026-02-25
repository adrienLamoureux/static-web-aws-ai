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
import "./themes/pixnovel.css";

const mergeCognitoConfig = (base = {}, override = {}) => ({
  domain: override.domain || base.domain || "",
  clientId: override.clientId || base.clientId || "",
  userPoolId: override.userPoolId || base.userPoolId || "",
  region: override.region || base.region || "",
});

const PIXNOVEL_PANE_META = {
  whisk: {
    label: "Generator",
    route: "/",
    subtitle: "Realtime visual prompt studio",
  },
  story: {
    label: "Director",
    route: "/story",
    subtitle: "Scene composition and story rhythm",
  },
  music: {
    label: "Sound Lab",
    route: "/music-library",
    subtitle: "Track curation and atmosphere cues",
  },
  about: {
    label: "Core",
    route: "/about",
    subtitle: "Project profile and architecture brief",
  },
};

const PIXNOVEL_MODEL_OPTIONS = [
  "NOVA Anime XL",
  "MoeFlux V3",
  "Cinematic Mix",
];

const PIXNOVEL_SAMPLER_OPTIONS = ["Euler a", "DPM++ 2M", "Heun"];

const PIXNOVEL_STYLE_TAGS = [
  "#dreamwave",
  "#portrait",
  "#lighting",
  "#storyframe",
];

const PIXNOVEL_MASONRY_BASE_IMAGES = [
  {
    id: "ea7018c3",
    src: "https://images-ng.pixai.art/images/orig/ea7018c3-eb73-41f7-aae6-0080cc2ef6b3",
  },
  {
    id: "9067cc18",
    src: "https://images-ng.pixai.art/images/orig/9067cc18-7378-4499-9da2-38c30d1ee560",
  },
  {
    id: "2c9d0346",
    src: "https://images-ng.pixai.art/images/orig/2c9d0346-8b5b-4486-94b7-f862c9ceb74d",
  },
  {
    id: "c47362e0",
    src: "https://images-ng.pixai.art/images/orig/c47362e0-18ff-4703-9352-95b2164154d4",
  },
];

const PIXNOVEL_MASONRY_COLUMNS = [
  {
    id: "column-a",
    durationSeconds: 54,
    startOffset: "0%",
  },
  {
    id: "column-b",
    durationSeconds: 58,
    startOffset: "-11%",
  },
  {
    id: "column-c",
    durationSeconds: 63,
    startOffset: "-22%",
  },
];

const PIXNOVEL_MASONRY_REPEAT_COUNT = 3;

const buildLoopedMasonryImages = (images, repeatCount) => {
  const safeRepeatCount = Math.max(1, repeatCount);
  return Array.from({ length: safeRepeatCount }, (_, repeatIndex) => repeatIndex).reduce(
    (accumulator, repeatIndex) =>
      accumulator.concat(
        images.map((image) => ({
          ...image,
          loopId: `${image.id}-${repeatIndex}`,
        }))
      ),
    []
  );
};

const PIXNOVEL_REFERENCE_MODES = [
  "Character reference",
  "Style reference",
  "Vibe transfer",
];

const PIXNOVEL_GUIDANCE_METERS = [
  {
    label: "Steps",
    value: "32",
    progress: "64%",
  },
  {
    label: "CFG",
    value: "7.5",
    progress: "58%",
  },
];

const PIXNOVEL_QUEUE_ITEMS = [
  {
    title: "Hero close-up",
    detail: "Queued by director",
  },
  {
    title: "Rainy alley frame",
    detail: "Seed locked",
  },
  {
    title: "Band promo splash",
    detail: "Upscale pending",
  },
];

const PIXNOVEL_MASONRY_IMAGES = buildLoopedMasonryImages(
  PIXNOVEL_MASONRY_BASE_IMAGES,
  PIXNOVEL_MASONRY_REPEAT_COUNT
);

const resolveActivePane = (pathname) => {
  if (pathname === "/" || pathname === "/whisk") {
    return "whisk";
  }
  if (pathname === "/story") {
    return "story";
  }
  if (pathname === "/music-library") {
    return "music";
  }
  if (pathname === "/about") {
    return "about";
  }
  return "whisk";
};

const PixnovelGenerationMenu = () => {
  return (
    <aside className="pixnovel-generator-panel" aria-label="Generation controls">
      <header className="pixnovel-generator-head">
        <p className="pixnovel-generator-kicker">Generation Menu</p>
        <h3>Compose Render Settings</h3>
      </header>

      <section className="pixnovel-control-group">
        <p className="pixnovel-control-label">Model</p>
        <div className="pixnovel-option-grid">
          {PIXNOVEL_MODEL_OPTIONS.map((model, index) => (
            <button
              key={model}
              type="button"
              className={`pixnovel-option-pill${index === 0 ? " is-active" : ""}`}
            >
              {model}
            </button>
          ))}
        </div>
      </section>

      <section className="pixnovel-control-group">
        <p className="pixnovel-control-label">Sampler</p>
        <div className="pixnovel-option-grid pixnovel-option-grid--compact">
          {PIXNOVEL_SAMPLER_OPTIONS.map((sampler, index) => (
            <button
              key={sampler}
              type="button"
              className={`pixnovel-option-pill${index === 0 ? " is-active" : ""}`}
            >
              {sampler}
            </button>
          ))}
        </div>
      </section>

      <section className="pixnovel-control-group">
        <p className="pixnovel-control-label">Guidance</p>
        {PIXNOVEL_GUIDANCE_METERS.map((meter) => (
          <div key={meter.label} className="pixnovel-meter-block">
            <div className="pixnovel-meter-row">
              <span>{meter.label}</span>
              <span>{meter.value}</span>
            </div>
            <div className="pixnovel-meter-track">
              <span style={{ width: meter.progress }} />
            </div>
          </div>
        ))}
      </section>

      <section className="pixnovel-control-group">
        <p className="pixnovel-control-label">Reference modes</p>
        <div className="pixnovel-reference-list">
          {PIXNOVEL_REFERENCE_MODES.map((item, index) => (
            <label key={item} className="pixnovel-reference-item">
              <input type="checkbox" defaultChecked={index === 0} />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </section>

      <button type="button" className="pixnovel-generate-button">
        Generate 1 Image
      </button>
    </aside>
  );
};

const PixnovelHeroMasonry = () => {
  return (
    <div className="pixnovel-hero-masonry" aria-hidden="true">
      <div className="pixnovel-masonry-grid">
        {PIXNOVEL_MASONRY_COLUMNS.map((column) => (
          <div
            key={column.id}
            className="pixnovel-masonry-column"
            style={{
              "--pix-masonry-duration": `${column.durationSeconds}s`,
              "--pix-masonry-start-offset": column.startOffset,
            }}
          >
            {PIXNOVEL_MASONRY_IMAGES.map((image) => (
              <figure key={`${column.id}-${image.loopId}`} className="pixnovel-masonry-card">
                <img src={image.src} alt="" loading="lazy" decoding="async" />
              </figure>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const PixnovelHero = ({ activePane, userEmail, onLogout }) => {
  return (
    <section className="pixnovel-hero" aria-label="Creative hero section">
      <PixnovelHeroMasonry />
      <div className="pixnovel-hero-copy">
        <div className="pixnovel-hero-topbar">
          <Link to="/" className="pixnovel-brand">
            Whisk Studio
          </Link>
          <nav className="pixnovel-top-nav">
            {Object.entries(PIXNOVEL_PANE_META).map(([key, item]) => (
              <Link
                key={key}
                to={item.route}
                className={`pixnovel-top-link${activePane === key ? " is-active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="pixnovel-user-chip">
            <span>{userEmail || "Signed in"}</span>
            <button type="button" className="btn-ghost px-4 py-1 text-xs" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>

        <p className="pixnovel-hero-kicker">PixNovel Studio</p>
        <h1 className="pixnovel-hero-title">
          Anime-first creation cockpit with cinematic flow controls
        </h1>
        <p className="pixnovel-hero-subtitle">
          Blend PixAI-style visual impact with NovelAI-style generation depth while
          keeping your existing Whisk, Story, and Music workflows in one place.
        </p>
        <div className="pixnovel-tag-row">
          {PIXNOVEL_STYLE_TAGS.map((tag) => (
            <span key={tag} className="pixnovel-tag-chip">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

const PixnovelWorkspace = ({ apiBaseUrl, activePane, userEmail, onLogout }) => {
  const paneByKey = {
    whisk: <Whisk apiBaseUrl={apiBaseUrl} />,
    story: <Story apiBaseUrl={apiBaseUrl} />,
    music: <StoryMusicLibrary apiBaseUrl={apiBaseUrl} />,
    about: <About />,
  };

  return (
    <div className="pixnovel-workspace">
      <PixnovelHero activePane={activePane} userEmail={userEmail} onLogout={onLogout} />

      <div className="pixnovel-grid">
        <PixnovelGenerationMenu />

        <section className="pixnovel-stage" key={activePane}>
          <header className="pixnovel-stage-head">
            <p className="pixnovel-stage-kicker">{PIXNOVEL_PANE_META[activePane].label}</p>
            <h2>{PIXNOVEL_PANE_META[activePane].subtitle}</h2>
          </header>
          <div className="pixnovel-stage-body">{paneByKey[activePane]}</div>
        </section>

        <aside className="pixnovel-feed-panel">
          <section className="pixnovel-feed-card">
            <p className="pixnovel-feed-title">Render Queue</p>
            <div className="pixnovel-queue-list">
              {PIXNOVEL_QUEUE_ITEMS.map((item) => (
                <div key={item.title} className="pixnovel-queue-item">
                  <p>{item.title}</p>
                  <span>{item.detail}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="pixnovel-feed-card">
            <p className="pixnovel-feed-title">Creation Signals</p>
            <div className="pixnovel-signal-list">
              <span>Realtime: online</span>
              <span>Character memory: synced</span>
              <span>Audio cues: attached</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

const AppShell = ({ apiBaseUrl }) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const activePane = resolveActivePane(location.pathname);

  return (
    <div className="pixnovel-shell relative min-h-screen overflow-hidden">
      <div className="pixnovel-atmosphere" aria-hidden="true">
        <span className="pixnovel-orb pixnovel-orb--one" />
        <span className="pixnovel-orb pixnovel-orb--two" />
        <span className="pixnovel-grid-shimmer" />
      </div>

      <main className="pixnovel-main relative z-10">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="whisk"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/whisk"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="whisk"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/story"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="story"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/music-library"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="music"
                  userEmail={user?.email}
                  onLogout={logout}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/about"
            element={
              <RequireAuth>
                <PixnovelWorkspace
                  apiBaseUrl={apiBaseUrl}
                  activePane="about"
                  userEmail={user?.email}
                  onLogout={logout}
                />
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
