import React, { useState } from "react";
import {
  BrowserRouter as Router,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ConfigProvider, useConfig } from "./contexts/ConfigContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { MusicProvider } from "./contexts/MusicContext";
import SolarisMusicDock from "./components/music/SolarisMusicDock";

// Pages
import HomePage from "./pages/HomePage";
import SharedLibrary from "./pages/SharedLibrary";
import Whisk from "./pages/Whisk";
import WhiskVideos from "./pages/WhiskVideos";
import LoraManagement from "./pages/LoraManagement";
import Director from "./pages/Director";
import Story from "./pages/Story";
import StoryMusicLibrary from "./pages/StoryMusicLibrary";
import AuthCallback from "./pages/AuthCallback";

const NAV_ITEMS = [
  { label: "Home", path: "/" },
  { label: "Shared", path: "/shared" },
  { label: "Whisk", path: "/whisk" },
  { label: "Videos", path: "/videos" },
  { label: "LoRA", path: "/lora" },
  { label: "Director", path: "/director" },
  { label: "Story", path: "/story" },
  { label: "Music", path: "/music-library" },
  { label: "About", path: "/about" },
];

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AboutPage() {
  return (
    <div>
      <div className="sol-page-header">
        <h2 className="sol-page-title">About</h2>
        <p className="sol-page-subtitle">Whisk Studio — static web app</p>
      </div>
      <div className="sol-card" style={{ padding: 24 }}>
        <p style={{ color: 'var(--sol-text-secondary)', fontSize: 14 }}>
          design-fusion merges the Solaris warm light-first shell with Pixnovel rich UI features.
        </p>
      </div>
    </div>
  );
}

function LoginPage() {
  const { isAuthenticated, isLoading, startLogin, isConfigured } = useAuth();
  const navigate = useNavigate();

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleContinue = async () => {
    if (!isConfigured) {
      navigate('/');
      return;
    }
    try {
      await startLogin('/');
    } catch (e) {
      console.error('Login failed:', e);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sol-base)' }}>
      <div className="sol-card" style={{ padding: 40, width: 400, maxWidth: '95vw', textAlign: 'center' }}>
        <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sol-text-tertiary)', marginBottom: 16 }}>whisk studio</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--sol-text-primary)', marginBottom: 12 }}>Sign in to continue</h1>
        <p style={{ fontSize: 14, color: 'var(--sol-text-secondary)', marginBottom: 24 }}>
          design-fusion — Solaris shell with Pixnovel rich UI.
        </p>
        <button
          type="button"
          className="sol-btn-primary"
          style={{ width: '100%' }}
          onClick={handleContinue}
          disabled={isLoading}
        >
          Continue to login
        </button>
      </div>
    </div>
  );
}

function SolarisShell({ children }) {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="sol-shell">
      <div className={`sol-sidebar${sidebarOpen ? "" : " collapsed"}`}>
        <div className="sol-sidebar-brand">
          <span className="sol-brand-mark">W</span>
          {sidebarOpen && <span className="sol-brand-name">Whisk Studio</span>}
        </div>
        <nav className="sol-sidebar-nav">
          {isAuthenticated && NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`sol-nav-link${location.pathname === item.path ? " is-active" : ""}`}
            >
              <span className="sol-nav-link-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        {isAuthenticated && (
          <button
            type="button"
            className="sol-nav-link"
            onClick={logout}
            style={{ marginTop: 'auto', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
          >
            <span className="sol-nav-link-label">Sign out</span>
          </button>
        )}
      </div>
      <div className="sol-main">
        <div className="sol-topbar">
          <button
            type="button"
            className="sol-icon-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
            style={{ fontSize: 14 }}
          >
            ☰
          </button>
          <span style={{ fontSize: 13, color: 'var(--sol-text-secondary)', marginLeft: 8 }}>
            {NAV_ITEMS.find(n => n.path === location.pathname)?.label || "Whisk Studio"}
          </span>
        </div>
        <div className="sol-content">{children}</div>
        <SolarisMusicDock />
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <SolarisShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/shared" element={<ProtectedRoute><SharedLibrary /></ProtectedRoute>} />
        <Route path="/whisk" element={<ProtectedRoute><Whisk /></ProtectedRoute>} />
        <Route path="/videos" element={<ProtectedRoute><WhiskVideos /></ProtectedRoute>} />
        <Route path="/lora" element={<ProtectedRoute><LoraManagement /></ProtectedRoute>} />
        <Route path="/director" element={<ProtectedRoute><Director /></ProtectedRoute>} />
        <Route path="/story" element={<ProtectedRoute><Story /></ProtectedRoute>} />
        <Route path="/music-library" element={<ProtectedRoute><StoryMusicLibrary /></ProtectedRoute>} />
        <Route path="/about" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SolarisShell>
  );
}

// Inner app: reads cognito from ConfigContext to wire up AuthProvider
function ConfiguredApp() {
  const { cognito, configReady } = useConfig();

  if (!configReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sol-base)' }}>
        <p style={{ fontSize: 14, color: 'var(--sol-text-secondary)' }}>Loading configuration…</p>
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
