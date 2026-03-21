import React, { useState, useEffect, useCallback } from "react";
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
import KitsuneMusicBar from "./components/kitsune/KitsuneMusicBar";
import KitsuneCommandPalette from "./components/kitsune/KitsuneCommandPalette";

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

const NAV_SECTIONS = [
  { header: null, items: [{ label: "Home", path: "/", icon: "⌂" }] },
  {
    header: "Create",
    items: [
      { label: "Studio", path: "/studio", icon: "◎" },
      { label: "Stories", path: "/stories", icon: "▤" },
    ],
  },
  {
    header: "Discover",
    items: [{ label: "Browse", path: "/browse", icon: "◈" }],
  },
  {
    header: "Manage",
    items: [
      { label: "Admin", path: "/admin", icon: "⚙" },
      { label: "Sound Vault", path: "/admin/sounds", icon: "♫" },
      { label: "LoRA", path: "/admin/lora", icon: "◐" },
    ],
  },
  { header: null, items: [{ label: "About", path: "/about", icon: "ℹ" }] },
];

const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

/* ─── Protected Route ─── */

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

/* ─── About Page ─── */

function AboutPage() {
  return (
    <div>
      <div className="kit-page-header">
        <h2 className="kit-page-title">About</h2>
        <p className="kit-page-subtitle">Whisk Studio — static web app</p>
      </div>
      <div className="kit-card" style={{ padding: 24 }}>
        <p style={{ color: "var(--kit-text-secondary)", fontSize: 14 }}>
          design-kitsune — AniList-inspired dark shell with modern clean anime identity.
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
    <div className="kit-auth-page">
      <div className="kit-auth-visual" />
      <div className="kit-auth-panel">
        <div className="kit-auth-card">
          <p className="kit-auth-kicker">whisk studio</p>
          <h1 className="kit-auth-title">Sign in to continue</h1>
          <p className="kit-auth-subtitle">
            Anime-first creative workspace — powered by AI.
          </p>
          <button
            type="button"
            className="kit-btn-primary"
            style={{ width: "100%" }}
            onClick={handleContinue}
            disabled={isLoading}
          >
            Continue to login
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Kitsune Shell ─── */

function KitsuneShell({ children }) {
  const location = useLocation();
  const { isAuthenticated, logout, user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);

  // Cmd+K / Ctrl+K handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdkOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isActive = useCallback(
    (path) => {
      if (path === "/") return location.pathname === "/";
      return location.pathname === path || location.pathname.startsWith(path + "/");
    },
    [location.pathname]
  );

  return (
    <div className="kit-shell">
      {/* Sidebar */}
      <aside className={`kit-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="kit-sidebar-brand">
          <span className="kit-brand-mark">W</span>
          {!sidebarCollapsed && <span className="kit-brand-name">Whisk</span>}
        </div>

        <nav className="kit-sidebar-nav">
          {isAuthenticated &&
            NAV_SECTIONS.map((section, si) => (
              <React.Fragment key={si}>
                {section.header && !sidebarCollapsed && (
                  <p className="kit-nav-section-header">{section.header}</p>
                )}
                {section.items.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`kit-nav-link${isActive(item.path) ? " is-active" : ""}`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <span className="kit-nav-icon">{item.icon}</span>
                    {!sidebarCollapsed && (
                      <span className="kit-nav-label">{item.label}</span>
                    )}
                  </Link>
                ))}
              </React.Fragment>
            ))}
        </nav>

        {isAuthenticated && (
          <button
            type="button"
            className="kit-nav-link kit-sign-out"
            onClick={logout}
          >
            <span className="kit-nav-icon">⏻</span>
            {!sidebarCollapsed && <span className="kit-nav-label">Sign out</span>}
          </button>
        )}
      </aside>

      {/* Main content */}
      <div className="kit-main">
        <header className="kit-topbar">
          <button
            type="button"
            className="kit-topbar-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <span className="kit-topbar-title">
            {ALL_NAV_ITEMS.find((n) => isActive(n.path))?.label || "Whisk Studio"}
          </span>
          <div className="kit-topbar-actions">
            {isAuthenticated && (
              <button
                type="button"
                className="kit-search-trigger"
                onClick={() => setCmdkOpen(true)}
              >
                <span>Search…</span>
                <kbd>⌘K</kbd>
              </button>
            )}
            {isAuthenticated && user?.email && (
              <span className="kit-topbar-user">{user.email.split("@")[0]}</span>
            )}
          </div>
        </header>

        <div className="kit-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
        <KitsuneMusicBar />
      </div>

      {/* Command palette */}
      {cmdkOpen && (
        <KitsuneCommandPalette onClose={() => setCmdkOpen(false)} />
      )}
    </div>
  );
}

/* ─── Routes ─── */

function AppRoutes() {
  return (
    <KitsuneShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Primary routes */}
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/studio" element={<ProtectedRoute><Forge /></ProtectedRoute>} />
        <Route path="/stories" element={<ProtectedRoute><Story /></ProtectedRoute>} />
        <Route path="/browse" element={<ProtectedRoute><SharedLibrary /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Director /></ProtectedRoute>} />
        <Route path="/admin/sounds" element={<ProtectedRoute><StoryMusicLibrary /></ProtectedRoute>} />
        <Route path="/admin/lora" element={<ProtectedRoute><LoraManagement /></ProtectedRoute>} />
        <Route path="/about" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
        {/* Legacy redirects */}
        <Route path="/whisk" element={<Navigate to="/studio" replace />} />
        <Route path="/forge" element={<Navigate to="/studio" replace />} />
        <Route path="/videos" element={<Navigate to="/studio?tab=videos" replace />} />
        <Route path="/story" element={<Navigate to="/stories" replace />} />
        <Route path="/storyboard" element={<Navigate to="/stories" replace />} />
        <Route path="/shared" element={<Navigate to="/browse" replace />} />
        <Route path="/showcase" element={<Navigate to="/browse" replace />} />
        <Route path="/lora" element={<Navigate to="/admin/lora" replace />} />
        <Route path="/director" element={<Navigate to="/admin" replace />} />
        <Route path="/director/sounds" element={<Navigate to="/admin/sounds" replace />} />
        <Route path="/director/lora" element={<Navigate to="/admin/lora" replace />} />
        <Route path="/music-library" element={<Navigate to="/admin/sounds" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </KitsuneShell>
  );
}

/* ─── App root ─── */

function ConfiguredApp() {
  const { cognito, configReady } = useConfig();

  if (!configReady) {
    return (
      <div className="kit-loading-screen">
        <div className="kit-loading-spinner" />
        <p>Loading…</p>
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
