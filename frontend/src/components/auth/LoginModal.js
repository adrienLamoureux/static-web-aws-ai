import React from "react";
import { useAuth } from "../../contexts/AuthContext";

export default function LoginModal({ isOpen, onClose, message }) {
  const { startLogin, isConfigured } = useAuth();

  if (!isOpen) return null;

  const handleLogin = async () => {
    const currentPath = window.location.pathname + window.location.search;
    try {
      await startLogin(currentPath);
    } catch (err) {
      console.error("Login redirect failed:", err);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="skr-modal-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="skr-modal-card">
        <button
          type="button"
          className="skr-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        <div className="skr-login-emblem" aria-hidden="true">✦</div>
        <h2 className="skr-modal-title">Sign in to continue</h2>
        {message && (
          <p className="skr-modal-message">{message}</p>
        )}
        <button
          type="button"
          className="skr-btn-primary skr-modal-action"
          onClick={handleLogin}
          disabled={!isConfigured}
        >
          Sign in with Cognito
        </button>
        <button
          type="button"
          className="skr-btn-ghost skr-modal-action"
          onClick={onClose}
        >
          Continue browsing
        </button>
      </div>
    </div>
  );
}
