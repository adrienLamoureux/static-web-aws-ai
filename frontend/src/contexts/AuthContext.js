import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearAuthTokens,
  getUserFromIdToken,
  loadAuthTokens,
  saveAuthTokens,
} from "../utils/authTokens";
import {
  createAuthState,
  createCodeChallenge,
  createCodeVerifier,
} from "../utils/pkce";
import { clearSessionCache } from "../utils/sessionCache";

const AuthContext = createContext({
  isAuthenticated: false,
  isLoading: true,
  isConfigured: false,
  user: null,
  startLogin: async () => {},
  completeLogin: async () => "/",
  logout: () => {},
});

const normalizeDomain = (value = "") => value.replace(/\/+$/, "");

export const AuthProvider = ({ cognito, children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  const isConfigured = Boolean(cognito?.domain && cognito?.clientId);
  const domain = normalizeDomain(cognito?.domain || "");
  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "";

  const bootstrapSession = useCallback(() => {
    const tokens = loadAuthTokens();
    if (tokens?.accessToken) {
      setIsAuthenticated(true);
      setUser(getUserFromIdToken(tokens.idToken));
    } else {
      setIsAuthenticated(false);
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  const startLogin = useCallback(
    async (redirectTo = "/") => {
      if (!isConfigured) {
        throw new Error("Cognito is not configured yet.");
      }
      const verifier = createCodeVerifier();
      const challenge = await createCodeChallenge(verifier);
      const state = createAuthState();
      window.sessionStorage.setItem("whisk_auth_verifier", verifier);
      window.sessionStorage.setItem("whisk_auth_state", state);
      window.sessionStorage.setItem("whisk_auth_redirect", redirectTo);

      const params = new URLSearchParams({
        response_type: "code",
        client_id: cognito.clientId,
        redirect_uri: redirectUri,
        scope: "openid email profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      window.location.assign(`${domain}/oauth2/authorize?${params.toString()}`);
    },
    [cognito?.clientId, domain, isConfigured, redirectUri]
  );

  const completeLogin = useCallback(
    async ({ code, state }) => {
      if (!isConfigured) {
        throw new Error("Cognito is not configured yet.");
      }
      const storedState = window.sessionStorage.getItem("whisk_auth_state");
      if (storedState && state && storedState !== state) {
        throw new Error("Invalid login state. Please try again.");
      }
      const verifier = window.sessionStorage.getItem("whisk_auth_verifier");
      if (!verifier) {
        throw new Error("Missing PKCE verifier. Please retry login.");
      }

      const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: cognito.clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });

      const response = await fetch(`${domain}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data?.error_description || "Token exchange failed.");
      }

      saveAuthTokens({
        accessToken: data.access_token,
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
      });

      setIsAuthenticated(true);
      setUser(getUserFromIdToken(data.id_token));

      window.sessionStorage.removeItem("whisk_auth_state");
      window.sessionStorage.removeItem("whisk_auth_verifier");
      const redirectTo =
        window.sessionStorage.getItem("whisk_auth_redirect") || "/";
      window.sessionStorage.removeItem("whisk_auth_redirect");
      return redirectTo;
    },
    [cognito?.clientId, domain, isConfigured, redirectUri]
  );

  const logout = useCallback(() => {
    clearAuthTokens();
    clearSessionCache();
    setIsAuthenticated(false);
    setUser(null);

    if (!isConfigured) return;
    const params = new URLSearchParams({
      client_id: cognito.clientId,
      logout_uri: `${window.location.origin}/login`,
    });
    window.location.assign(`${domain}/logout?${params.toString()}`);
  }, [cognito?.clientId, domain, isConfigured]);

  const value = useMemo(
    () => ({
      isAuthenticated,
      isLoading,
      isConfigured,
      user,
      startLogin,
      completeLogin,
      logout,
    }),
    [
      completeLogin,
      isAuthenticated,
      isConfigured,
      isLoading,
      logout,
      startLogin,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
