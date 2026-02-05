import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

function AuthCallback() {
  const { completeLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code) {
      setError("Missing authorization code.");
      return;
    }

    let isMounted = true;

    const finishLogin = async () => {
      try {
        const redirectTo = await completeLogin({ code, state });
        if (!isMounted) return;
        navigate(redirectTo, { replace: true });
      } catch (err) {
        if (!isMounted) return;
        setError(err?.message || "Login failed.");
      }
    };

    finishLogin();

    return () => {
      isMounted = false;
    };
  }, [completeLogin, location.search, navigate]);

  return (
    <section className="auth-shell">
      <div className="auth-card glass-panel">
        <p className="auth-eyebrow">Whisk Studio</p>
        <h1 className="auth-title">Signing you in…</h1>
        <p className="auth-copy">
          Completing the secure login handshake. This should only take a moment.
        </p>
        {error ? (
          <p className="auth-error">{error}</p>
        ) : (
          <p className="auth-loading">Finalizing session…</p>
        )}
        {error && (
          <button
            type="button"
            className="btn-primary px-6 py-2 text-sm"
            onClick={() => navigate("/login")}
          >
            Back to login
          </button>
        )}
      </div>
    </section>
  );
}

export default AuthCallback;
