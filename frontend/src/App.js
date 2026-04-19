import React, { useState, useCallback, useEffect } from "react";
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
import { ThemeProvider } from "./contexts/ThemeContext";
import SakuraMusicBar from "./components/sakura/SakuraMusicBar";
import Sidebar from "./components/sakura/Sidebar";
import CompanionPanel from "./components/sakura/companion/CompanionPanel";
import LoginModal from "./components/auth/LoginModal";
import {
  CompanionProvider,
  useCompanion,
  CompanionActions,
} from "./lib/companion/CompanionContext";
import { NotificationProvider } from "./components/sakura/NotificationStack";
import { getAuthToken } from "./utils/authTokens";

// Pages
import HomePage from "./pages/HomePage";
import Forge from "./pages/Forge";
import LoraManagement from "./pages/LoraManagement";
import Director from "./pages/Director";
import Story from "./pages/Story";
import StoryMusicLibrary from "./pages/StoryMusicLibrary";
import AuthCallback from "./pages/AuthCallback";
/* ─── Navigation (Bottom HUD) ─── */

const NAV_ITEMS = [
  { label: "Realm", path: "/", icon: "✦", isPublic: true },
  { label: "Atelier", path: "/atelier", icon: "◈", isPublic: false },
  { label: "Chronicle", path: "/chronicle", icon: "▤", isPublic: false },
  { label: "Sanctum", path: "/sanctum", icon: "⚙", requiredRole: "admin" },
];

/* ─── Protected Route ─── */

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated || !getAuthToken()) {
    return (
      <>
        <div style={{ minHeight: "60vh" }} />
        <LoginModal
          isOpen
          message="Sign in to access this feature"
          onClose={() => window.history.back()}
        />
      </>
    );
  }
  return children;
}

function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated || !getAuthToken()) return <Navigate to="/login" replace />;
  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return children;
}

/* ─── About Page ─── */

function AboutPage() {
  return (
    <div>
      <div className="skr-page-header">
        <h2 className="skr-page-title">About</h2>
        <p className="skr-page-subtitle">Whisk Studio — Sakura Bloom variant</p>
      </div>
      <div className="skr-card" style={{ padding: 24 }}>
        <p style={{ color: "var(--skr-text-secondary)" }}>
          A maximalist immersive creative workspace inspired by visual novel aesthetics.
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
    <div className="skr-login-page">
      <div className="skr-login-petals" aria-hidden="true" />
      <div className="skr-login-card">
        <div className="skr-login-emblem">✦</div>
        <h1 className="skr-login-title">Whisk Studio</h1>
        <p className="skr-login-subtitle">Creative workspace awaits</p>
        <button
          type="button"
          className="skr-btn-primary"
          style={{ width: "100%", marginTop: 20 }}
          onClick={handleContinue}
          disabled={isLoading}
        >
          Continue to login
        </button>
      </div>
    </div>
  );
}

/* ─── Sakura Shell ─── */

function SakuraShell({ children }) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { dispatch } = useCompanion();
  const [hudExpanded, setHudExpanded] = useState(false);

  const isActive = useCallback(
    (path) => {
      if (path === "/") return location.pathname === "/";
      return location.pathname === path || location.pathname.startsWith(path + "/");
    },
    [location.pathname]
  );

  // Dispatch PAGE_NAVIGATE whenever the route changes
  const prevPathRef = React.useRef(location.pathname);
  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      dispatch(CompanionActions.PAGE_NAVIGATE, { page: location.pathname });
    }
  }, [location.pathname, dispatch]);

  return (
    <div className="skr-shell">
      {/* Gradient backdrop */}
      <div className="skr-backdrop" aria-hidden="true" />

      {/* Left sidebar — desktop only (CSS hides on mobile) */}
      <Sidebar />

      {/* Main content */}
      <main className="skr-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            style={{ width: "100%" }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Music bar */}
      <SakuraMusicBar />

      {/* Live2D companion panel */}
      <CompanionPanel />

      {/* Bottom HUD navigation — always visible, filtered by role */}
      <nav className="skr-hud">
        <div className="skr-hud-pill">
          {NAV_ITEMS.filter((item) => {
            if (item.requiredRole === "admin" && !user?.isAdmin) return false;
            if (!item.isPublic && !isAuthenticated) return false;
            return true;
          }).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`skr-hud-item${isActive(item.path) ? " is-active" : ""}`}
            >
              <span className="skr-hud-icon">{item.icon}</span>
              <span className="skr-hud-label">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ─── Routes ─── */

function AppRoutes() {
  return (
    <SakuraShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Primary routes */}
        <Route path="/" element={<HomePage />} />
        <Route
          path="/atelier"
          element={
            <ProtectedRoute>
              <Forge />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chronicle"
          element={
            <ProtectedRoute>
              <Story />
            </ProtectedRoute>
          }
        />
        <Route path="/gallery" element={<Navigate to="/" replace />} />
        <Route
          path="/sanctum"
          element={
            <AdminRoute>
              <Director />
            </AdminRoute>
          }
        />
        <Route
          path="/sanctum/sounds"
          element={
            <AdminRoute>
              <StoryMusicLibrary />
            </AdminRoute>
          }
        />
        <Route
          path="/sanctum/lora"
          element={
            <AdminRoute>
              <LoraManagement />
            </AdminRoute>
          }
        />
        <Route path="/about" element={<AboutPage />} />
        {/* Legacy redirects */}
        <Route path="/whisk" element={<Navigate to="/atelier" replace />} />
        <Route path="/forge" element={<Navigate to="/atelier" replace />} />
        <Route path="/studio" element={<Navigate to="/atelier" replace />} />
        <Route path="/videos" element={<Navigate to="/atelier?tab=videos" replace />} />
        <Route path="/story" element={<Navigate to="/chronicle" replace />} />
        <Route path="/storyboard" element={<Navigate to="/chronicle" replace />} />
        <Route path="/shared" element={<Navigate to="/" replace />} />
        <Route path="/showcase" element={<Navigate to="/" replace />} />
        <Route path="/lora" element={<Navigate to="/sanctum/lora" replace />} />
        <Route path="/director" element={<Navigate to="/sanctum" replace />} />
        <Route path="/director/sounds" element={<Navigate to="/sanctum/sounds" replace />} />
        <Route path="/director/lora" element={<Navigate to="/sanctum/lora" replace />} />
        <Route path="/music-library" element={<Navigate to="/sanctum/sounds" replace />} />
        <Route path="/admin" element={<Navigate to="/sanctum" replace />} />
        <Route path="/admin/sounds" element={<Navigate to="/sanctum/sounds" replace />} />
        <Route path="/admin/lora" element={<Navigate to="/sanctum/lora" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SakuraShell>
  );
}

/* ─── App root ─── */

function ConfiguredApp() {
  const { cognito, configReady } = useConfig();

  if (!configReady) {
    return (
      <div className="skr-loading-screen">
        <div className="skr-loading-emblem">✦</div>
        <p className="skr-loading-text">Loading...</p>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider cognito={cognito}>
        <MusicProvider>
          <CompanionProvider>
            <NotificationProvider>
              <Router>
                <AppRoutes />
              </Router>
            </NotificationProvider>
          </CompanionProvider>
        </MusicProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <ConfiguredApp />
    </ConfigProvider>
  );
}
