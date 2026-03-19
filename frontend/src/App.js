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
import Forge from "./pages/Forge";
import LoraManagement from "./pages/LoraManagement";
import Director from "./pages/Director";
import Story from "./pages/Story";
import StoryMusicLibrary from "./pages/StoryMusicLibrary";
import AuthCallback from "./pages/AuthCallback";

const NAV_SECTIONS = [
  { header: null, items: [{ label: "Home", path: "/" }] },
  {
    header: "Atelier",
    items: [
      { label: "Forge", path: "/forge" },
      { label: "Storyboard", path: "/storyboard" },
    ],
  },
  {
    header: "Gallery",
    items: [{ label: "Showcase", path: "/showcase" }],
  },
  {
    header: "Director",
    items: [
      { label: "Command", path: "/director" },
      { label: "Sound Vault", path: "/director/sounds" },
      { label: "LoRA Catalog", path: "/director/lora" },
    ],
  },
  { header: null, items: [{ label: "About", path: "/about" }] },
];

const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

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
          {isAuthenticated && NAV_SECTIONS.map((section, si) => (
            <React.Fragment key={si}>
              {section.header && (
                <p className="sol-nav-section-header">{section.header}</p>
              )}
              {section.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sol-nav-link${location.pathname === item.path ? " is-active" : ""}`}
                >
                  <span className="sol-nav-link-label">{item.label}</span>
                </Link>
              ))}
            </React.Fragment>
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
            {ALL_NAV_ITEMS.find(n => n.path === location.pathname)?.label || "Whisk Studio"}
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
        {/* Primary routes */}
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/forge" element={<ProtectedRoute><Forge /></ProtectedRoute>} />
        <Route path="/storyboard" element={<ProtectedRoute><Story /></ProtectedRoute>} />
        <Route path="/showcase" element={<ProtectedRoute><SharedLibrary /></ProtectedRoute>} />
        <Route path="/director" element={<ProtectedRoute><Director /></ProtectedRoute>} />
        <Route path="/director/sounds" element={<ProtectedRoute><StoryMusicLibrary /></ProtectedRoute>} />
        <Route path="/director/lora" element={<ProtectedRoute><LoraManagement /></ProtectedRoute>} />
        <Route path="/about" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
        {/* Legacy redirects */}
        <Route path="/whisk" element={<Navigate to="/forge" replace />} />
        <Route path="/videos" element={<Navigate to="/forge?tab=videos" replace />} />
        <Route path="/story" element={<Navigate to="/storyboard" replace />} />
        <Route path="/shared" element={<Navigate to="/showcase" replace />} />
        <Route path="/lora" element={<Navigate to="/director/lora" replace />} />
        <Route path="/music-library" element={<Navigate to="/director/sounds" replace />} />
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
