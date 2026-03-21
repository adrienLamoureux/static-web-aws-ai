import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  BrowserRouter as Router,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ConfigProvider, useConfig } from "./contexts/ConfigContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { MusicProvider } from "./contexts/MusicContext";
import YokaiMusicBar from "./components/yokai/YokaiMusicBar";

// Pages
import HomePage from "./pages/HomePage";
import SharedLibrary from "./pages/SharedLibrary";
import Forge from "./pages/Forge";
import LoraManagement from "./pages/LoraManagement";
import Director from "./pages/Director";
import Story from "./pages/Story";
import StoryMusicLibrary from "./pages/StoryMusicLibrary";
import AuthCallback from "./pages/AuthCallback";

/* ─── Navigation ─── */

const NAV_ITEMS = [
  { label: "Terminal", path: "/", icon: ">" },
  { label: "Foundry", path: "/create", icon: "◈" },
  { label: "Codex", path: "/stories", icon: "▤" },
  { label: "Archive", path: "/browse", icon: "◻" },
  { label: "Control", path: "/system", icon: "⚙" },
  { label: "Audio", path: "/system/audio", icon: "♫" },
  { label: "Models", path: "/system/lora", icon: "◐" },
];

/* ─── Protected Route ─── */

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

/* ─── ASCII Logo ─── */

function YokaiASCIILogo() {
  const chars = "WHISK";
  const [display, setDisplay] = useState(chars);
  const intervalRef = useRef(null);

  const scramble = useCallback(() => {
    const glyphSet = "!@#$%^&*<>{}[]|/\\?";
    let frame = 0;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      frame++;
      if (frame > 12) {
        setDisplay(chars);
        clearInterval(intervalRef.current);
        return;
      }
      setDisplay(
        chars
          .split("")
          .map((c, i) =>
            Math.random() > frame / 14
              ? glyphSet[Math.floor(Math.random() * glyphSet.length)]
              : c
          )
          .join("")
      );
    }, 40);
  }, []);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return (
    <span className="yk-ascii-logo" onMouseEnter={scramble}>
      {display}
    </span>
  );
}

/* ─── About Page ─── */

function AboutPage() {
  return (
    <div>
      <div className="yk-page-banner">
        <h2 className="yk-banner-title">SYS::ABOUT</h2>
        <div className="yk-banner-line" />
      </div>
      <div className="yk-card" style={{ padding: 24 }}>
        <p className="yk-mono" style={{ color: "var(--yk-text-secondary)" }}>
          &gt; Whisk Studio — static web app
        </p>
        <p className="yk-mono" style={{ color: "var(--yk-accent)", marginTop: 8 }}>
          &gt; design-yokai — NERV-inspired retro-futuristic terminal shell
        </p>
      </div>
    </div>
  );
}

/* ─── Login Page ─── */

function LoginPage() {
  const { isAuthenticated, isLoading, startLogin, isConfigured } = useAuth();
  const navigate = useNavigate();

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleContinue = async () => {
    if (!isConfigured) {
      navigate("/");
      return;
    }
    try {
      await startLogin("/");
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  return (
    <div className="yk-login-page">
      <div className="yk-login-scanlines" />
      <div className="yk-login-card">
        <pre className="yk-login-ascii">{`
 █ █ █ █ █ █ █ █ █ █
 ╔═══════════════════╗
 ║   W H I S K   ║
 ║   S T U D I O ║
 ╚═══════════════════╝
`}</pre>
        <p className="yk-login-prompt">&gt; AUTHENTICATION_REQUIRED</p>
        <p className="yk-login-sub">
          &gt; Retro-futuristic creative workspace. Powered by AI.
        </p>
        <button
          type="button"
          className="yk-btn-primary"
          style={{ width: "100%", marginTop: 16 }}
          onClick={handleContinue}
          disabled={isLoading}
        >
          <span className="yk-btn-cursor">&gt;</span> Continue to login
        </button>
      </div>
    </div>
  );
}

/* ─── Yokai Shell ─── */

function YokaiShell({ children }) {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();

  const isActive = useCallback(
    (path) => {
      if (path === "/") return location.pathname === "/";
      return location.pathname === path || location.pathname.startsWith(path + "/");
    },
    [location.pathname]
  );

  const currentPage = NAV_ITEMS.find((n) => isActive(n.path));

  return (
    <div className="yk-shell">
      {/* Scanline overlay */}
      <div className="yk-scanline-overlay" aria-hidden="true" />

      {/* Edge rail */}
      <aside className="yk-edge-rail">
        <div className="yk-rail-brand">
          <YokaiASCIILogo />
        </div>

        <nav className="yk-rail-nav">
          {isAuthenticated &&
            NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`yk-rail-link${isActive(item.path) ? " is-active" : ""}`}
                title={item.label}
              >
                <span className="yk-rail-icon">{item.icon}</span>
              </Link>
            ))}
        </nav>

        {isAuthenticated && (
          <button
            type="button"
            className="yk-rail-link yk-rail-logout"
            onClick={logout}
            title="Sign out"
          >
            <span className="yk-rail-icon">⏻</span>
          </button>
        )}
      </aside>

      {/* Main content */}
      <div className="yk-main">
        {currentPage && isAuthenticated && (
          <div className="yk-page-banner">
            <h2 className="yk-banner-title">{currentPage.label.toUpperCase()}</h2>
            <div className="yk-banner-line" />
          </div>
        )}

        <div className="yk-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
              animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
              exit={{ opacity: 0, clipPath: "inset(100% 0 0 0)" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        <YokaiMusicBar />
      </div>
    </div>
  );
}

/* ─── Routes ─── */

function AppRoutes() {
  return (
    <YokaiShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Primary routes */}
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><Forge /></ProtectedRoute>} />
        <Route path="/stories" element={<ProtectedRoute><Story /></ProtectedRoute>} />
        <Route path="/browse" element={<ProtectedRoute><SharedLibrary /></ProtectedRoute>} />
        <Route path="/system" element={<ProtectedRoute><Director /></ProtectedRoute>} />
        <Route path="/system/audio" element={<ProtectedRoute><StoryMusicLibrary /></ProtectedRoute>} />
        <Route path="/system/lora" element={<ProtectedRoute><LoraManagement /></ProtectedRoute>} />
        <Route path="/about" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
        {/* Legacy redirects */}
        <Route path="/whisk" element={<Navigate to="/create" replace />} />
        <Route path="/forge" element={<Navigate to="/create" replace />} />
        <Route path="/studio" element={<Navigate to="/create" replace />} />
        <Route path="/videos" element={<Navigate to="/create?tab=videos" replace />} />
        <Route path="/story" element={<Navigate to="/stories" replace />} />
        <Route path="/storyboard" element={<Navigate to="/stories" replace />} />
        <Route path="/shared" element={<Navigate to="/browse" replace />} />
        <Route path="/showcase" element={<Navigate to="/browse" replace />} />
        <Route path="/lora" element={<Navigate to="/system/lora" replace />} />
        <Route path="/director" element={<Navigate to="/system" replace />} />
        <Route path="/director/sounds" element={<Navigate to="/system/audio" replace />} />
        <Route path="/director/lora" element={<Navigate to="/system/lora" replace />} />
        <Route path="/music-library" element={<Navigate to="/system/audio" replace />} />
        <Route path="/admin" element={<Navigate to="/system" replace />} />
        <Route path="/admin/sounds" element={<Navigate to="/system/audio" replace />} />
        <Route path="/admin/lora" element={<Navigate to="/system/lora" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </YokaiShell>
  );
}

/* ─── App root ─── */

function ConfiguredApp() {
  const { cognito, configReady } = useConfig();

  if (!configReady) {
    return (
      <div className="yk-loading-screen">
        <div className="yk-loading-dots">
          <span>&gt; INITIALIZING</span>
          <span className="yk-loading-cursor">_</span>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider cognito={cognito}>
      <MusicProvider>
        <Router>
          <AppRoutes />
        </Router>
      </MusicProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <ConfiguredApp />
    </ConfigProvider>
  );
}
