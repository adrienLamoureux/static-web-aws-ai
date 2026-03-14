import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter as Router,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

const TOKEN_STORAGE_KEY = "whisk_auth_tokens";
const CONFIG_PATH = "/config.json";

const NAV_ITEMS = [
  { label: "Shared", path: "/" },
  { label: "Whisk", path: "/whisk" },
  { label: "LoRA", path: "/lora" },
  { label: "Videos", path: "/videos" },
  { label: "Director", path: "/director" },
  { label: "Story", path: "/story" },
  { label: "Music", path: "/music-library" },
  { label: "About", path: "/about" },
];

const PAGE_DEFINITIONS = {
  "/": {
    title: "Shared Images",
    lines: [
      "Search shared images",
      "Placeholder surface for codex/dev. Design UX is maintained in design worktrees.",
    ],
  },
  "/shared": {
    title: "Shared Images",
    lines: [
      "Search shared images",
      "Placeholder surface for codex/dev. Design UX is maintained in design worktrees.",
    ],
  },
  "/whisk": {
    title: "Whisk Generator Placeholder",
    lines: [
      "This route is intentionally minimal in codex/dev.",
      "Generation business logic remains available through backend APIs.",
    ],
  },
  "/lora": {
    title: "LoRA Catalog",
    lines: [
      "Character LoRA Profile",
      "Catalog management UI lives in design branches.",
    ],
  },
  "/videos": {
    title: "Videos",
    lines: [
      "Video workflows are active at API level.",
      "codex/dev keeps a placeholder interface only.",
    ],
  },
  "/director": {
    title: "Director Placeholder",
    lines: [
      "Global Command Center",
      "Use design worktrees for full orchestration UX.",
    ],
  },
  "/story": {
    title: "Storytelling Studio",
    lines: [
      "Story route is available but intentionally simplified in codex/dev.",
      "Use design branches for production-grade storytelling UX.",
    ],
  },
  "/music-library": {
    title: "Music Library Placeholder",
    lines: [
      "Upload and categorize soundtracks",
      "codex/dev keeps only baseline deployment scaffolding for this route.",
    ],
  },
  "/about": {
    title: "About",
    lines: [
      "Whisk Studio — static web app",
      "codex/dev is a functional baseline branch; rich UI variants live outside this branch.",
    ],
  },
};

function parseSessionTokens() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function hasSessionAuth() {
  const tokens = parseSessionTokens();
  return Boolean(tokens?.accessToken || tokens?.idToken);
}

function writePlaceholderSession() {
  if (typeof window === "undefined") return;

  const payload = {
    accessToken: "placeholder-access-token",
    idToken: "placeholder-id-token",
    refreshToken: "",
    tokenType: "Bearer",
    expiresIn: 3600,
    savedAt: Date.now(),
  };

  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
}

function clearSessionAuth() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

function usePlaceholderAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => hasSessionAuth());

  useEffect(() => {
    const refreshState = () => {
      setIsAuthenticated(hasSessionAuth());
    };

    window.addEventListener("storage", refreshState);
    return () => {
      window.removeEventListener("storage", refreshState);
    };
  }, []);

  const signIn = () => {
    writePlaceholderSession();
    setIsAuthenticated(true);
  };

  const signOut = () => {
    clearSessionAuth();
    setIsAuthenticated(false);
  };

  return {
    isAuthenticated,
    signIn,
    signOut,
  };
}

function ProtectedRoute({ isAuthenticated, children }) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function PlaceholderPage({ title, lines = [], apiBaseUrl = "" }) {
  return (
    <section className="placeholder-page">
      <p className="placeholder-kicker">codex/dev placeholder</p>
      <h1>{title}</h1>
      {lines.map((line) => (
        <p key={line} className="placeholder-line">
          {line}
        </p>
      ))}
      <p className="placeholder-line">
        API endpoint: <code>{apiBaseUrl || "not configured"}</code>
      </p>
    </section>
  );
}

function Shell({ isAuthenticated, onSignOut, children }) {
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-title">
          <strong>Whisk Studio (Base Placeholder)</strong>
          <span>UI/UX variants are intentionally maintained in dedicated design worktrees.</span>
        </div>
        {isAuthenticated ? (
          <button type="button" className="app-ghost-button" onClick={onSignOut}>
            Sign out
          </button>
        ) : null}
      </header>

      {isAuthenticated ? (
        <nav className="app-nav" aria-label="Placeholder routes">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`app-nav-link${location.pathname === item.path ? " is-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <main className="app-content">{children}</main>
    </div>
  );
}

function LoginPage({ isAuthenticated, onContinue }) {
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <p className="auth-kicker">whisk studio</p>
        <h1>Sign in to continue</h1>
        <p>
          codex/dev intentionally serves a minimal placeholder website. Use design worktrees for
          full UX variants.
        </p>
        <button type="button" className="app-primary-button" onClick={onContinue}>
          Continue to login
        </button>
      </section>
    </div>
  );
}

function AuthCallbackPage({ onComplete }) {
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    onComplete();
    setIsCompleted(true);
  }, [onComplete]);

  if (isCompleted) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h1>Completing sign in...</h1>
      </section>
    </div>
  );
}

function AppShell({ apiBaseUrl }) {
  const { isAuthenticated, signIn, signOut } = usePlaceholderAuth();

  return (
    <Router>
      <Shell isAuthenticated={isAuthenticated} onSignOut={signOut}>
        <Routes>
          <Route
            path="/login"
            element={<LoginPage isAuthenticated={isAuthenticated} onContinue={signIn} />}
          />
          <Route path="/auth/callback" element={<AuthCallbackPage onComplete={signIn} />} />
          {Object.entries(PAGE_DEFINITIONS).map(([route, definition]) => (
            <Route
              key={route}
              path={route}
              element={
                <ProtectedRoute isAuthenticated={isAuthenticated}>
                  <PlaceholderPage
                    title={definition.title}
                    lines={definition.lines}
                    apiBaseUrl={apiBaseUrl}
                  />
                </ProtectedRoute>
              }
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </Router>
  );
}

export default function App() {
  const [runtimeApiBaseUrl, setRuntimeApiBaseUrl] = useState("");

  useEffect(() => {
    let isMounted = true;

    fetch(CONFIG_PATH)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!isMounted || !payload) return;
        setRuntimeApiBaseUrl(String(payload.apiBaseUrl || ""));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  const apiBaseUrl = useMemo(() => {
    const envApiBaseUrl = String(process.env.REACT_APP_API_URL || "");

    if (
      envApiBaseUrl &&
      typeof window !== "undefined" &&
      window.location.hostname === "localhost"
    ) {
      return envApiBaseUrl;
    }

    return runtimeApiBaseUrl || envApiBaseUrl;
  }, [runtimeApiBaseUrl]);

  return <AppShell apiBaseUrl={apiBaseUrl} />;
}
