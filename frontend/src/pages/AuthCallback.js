import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function AuthCallback() {
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
        navigate(redirectTo || "/", { replace: true });
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sol-base)' }}>
      <div className="sol-card" style={{ padding: 40, width: 420, maxWidth: '95vw', textAlign: 'center' }}>
        <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sol-text-tertiary)', marginBottom: 16 }}>
          whisk studio
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--sol-text-primary)', marginBottom: 12 }}>
          Signing you in…
        </h1>
        {error ? (
          <>
            <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 20 }}>{error}</p>
            <button className="sol-btn-secondary" onClick={() => navigate('/login')}>
              Back to login
            </button>
          </>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--sol-text-secondary)' }}>
            Finalizing your session…
          </p>
        )}
      </div>
    </div>
  );
}
