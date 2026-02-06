import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Link, Navigate } from "react-router-dom";
import About from "./pages/About";
import Whisk from "./pages/Whisk";
import Story from "./pages/Story";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import RequireAuth from "./components/auth/RequireAuth";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const mergeCognitoConfig = (base = {}, override = {}) => ({
  domain: override.domain || base.domain || "",
  clientId: override.clientId || base.clientId || "",
  userPoolId: override.userPoolId || base.userPoolId || "",
  region: override.region || base.region || "",
});

const AppShell = ({ apiBaseUrl }) => {
  const { isAuthenticated, logout, user } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 noise-layer opacity-60" />
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_center,_rgba(196,178,141,0.24),_transparent_70%)] blur-3xl" />
      {isAuthenticated && (
        <header className="relative z-10 mx-auto flex w-full max-w-[1240px] items-center justify-between px-6 py-6 md:px-10">
          <Link
            to="/"
            className="text-lg font-semibold tracking-tight text-ink font-display"
          >
            Whisk Studio
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <Link to="/" className="nav-link">
              Whisk
            </Link>
            <Link to="/story" className="nav-link">
              Story
            </Link>
            <Link to="/about" className="nav-link">
              About
            </Link>
          </nav>
          <div className="nav-user">
            <span className="nav-user-email">{user?.email || "Signed in"}</span>
            <button type="button" className="btn-ghost px-4 py-1 text-xs" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
      )}
      <main className="relative z-10">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Whisk apiBaseUrl={apiBaseUrl} />
              </RequireAuth>
            }
          />
          <Route
            path="/whisk"
            element={
              <RequireAuth>
                <Whisk apiBaseUrl={apiBaseUrl} />
              </RequireAuth>
            }
          />
          <Route
            path="/story"
            element={
              <RequireAuth>
                <Story apiBaseUrl={apiBaseUrl} />
              </RequireAuth>
            }
          />
          <Route
            path="/about"
            element={
              <RequireAuth>
                <About />
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
