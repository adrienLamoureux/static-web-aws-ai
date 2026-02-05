import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

function Login() {
  const { startLogin, isConfigured } = useAuth();
  const location = useLocation();
  const [error, setError] = useState("");
  const redirectTo = location.state?.from?.pathname || "/";

  const handleLogin = async () => {
    try {
      setError("");
      await startLogin(redirectTo);
    } catch (err) {
      setError(err?.message || "Login failed.");
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-card glass-panel">
        <p className="auth-eyebrow">Whisk Studio</p>
        <h1 className="auth-title">Sign in to continue</h1>
        <p className="auth-copy">
          Access your private library of images and videos. We’ll redirect you
          to the secure Cognito sign-in screen.
        </p>
        {!isConfigured && (
          <p className="auth-error">
            Cognito is not configured yet. Check config.json or environment
            settings.
          </p>
        )}
        {error && <p className="auth-error">{error}</p>}
        <div className="auth-actions">
          <button
            type="button"
            className="btn-primary px-6 py-2 text-sm"
            onClick={handleLogin}
            disabled={!isConfigured}
          >
            Continue to login
          </button>
          <span className="auth-meta">Hosted by Amazon Cognito</span>
        </div>
      </div>
    </section>
  );
}

export default Login;
