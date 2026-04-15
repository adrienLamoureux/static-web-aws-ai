import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

const STORAGE_KEY = "skr-sidebar-collapsed";

const NAV_ITEMS = [
  { label: "Realm", path: "/", icon: "✦", emoji: "🏠", isPublic: true },
  { label: "Atelier", path: "/atelier", icon: "◈", emoji: "🎨", isPublic: false },
  { label: "Chronicle", path: "/chronicle", icon: "▤", emoji: "📖", isPublic: false },
  { label: "Sanctum", path: "/sanctum", icon: "⚙", emoji: "⚙️", requiredRole: "admin" },
];

export default function Sidebar() {
  const location = useLocation();
  const { isAuthenticated, user, logout, startLogin } = useAuth();
  const { brightness, setBrightness } = useTheme();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.requiredRole === "admin" && !user?.isAdmin) return false;
    if (!item.isPublic && !isAuthenticated) return false;
    return true;
  });

  return (
    <aside className={`skr-sidebar${collapsed ? " is-collapsed" : ""}`}>
      {/* Brand */}
      <div className="skr-sidebar-brand">
        <Link to="/" className="skr-sidebar-brand-link">
          <span className="skr-sidebar-brand-emblem">✦</span>
          {!collapsed && <span className="skr-sidebar-brand-name">Whisk Studio</span>}
        </Link>
      </div>

      {/* Nav items */}
      <nav className="skr-sidebar-nav">
        {visibleItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`skr-sidebar-item${isActive(item.path) ? " is-active" : ""}`}
            title={collapsed ? item.label : undefined}
          >
            <span className="skr-sidebar-item-icon">{item.icon}</span>
            {!collapsed && <span className="skr-sidebar-item-label">{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer — single row: brightness | auth (middle) | collapse */}
      <div className="skr-sidebar-footer">
        <button
          type="button"
          className="skr-sidebar-brightness"
          onClick={() => setBrightness(brightness === "light" ? "dark" : "light")}
          title={brightness === "light" ? "Switch to dark mode" : "Switch to light mode"}
          aria-label={brightness === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {brightness === "light" ? "☀" : "☾"}
        </button>

        {!collapsed && (
          <div className="skr-sidebar-auth">
            {isAuthenticated ? (
              <>
                <span className="skr-sidebar-user" title={user?.email}>
                  {user?.email}
                </span>
                <button type="button" className="skr-sidebar-auth-btn" onClick={logout}>
                  Out
                </button>
              </>
            ) : (
              <button
                type="button"
                className="skr-sidebar-auth-btn skr-sidebar-auth-btn--fill"
                onClick={() => startLogin(location.pathname)}
              >
                Sign in
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className="skr-sidebar-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>
    </aside>
  );
}
