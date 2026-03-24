import { useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";

export function useLoginPrompt() {
  const { isAuthenticated } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");

  const requireAuth = useCallback(
    (message = "") => {
      if (isAuthenticated) return true;
      setLoginMessage(message);
      setShowLogin(true);
      return false;
    },
    [isAuthenticated]
  );

  const closeLogin = useCallback(() => setShowLogin(false), []);

  return { showLogin, loginMessage, requireAuth, closeLogin };
}
