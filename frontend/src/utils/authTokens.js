const TOKEN_STORAGE_KEY = "whisk_auth_tokens";

const base64UrlDecode = (value = "") => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  try {
    return window.atob(padded);
  } catch (error) {
    return "";
  }
};

export const parseJwt = (token = "") => {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = base64UrlDecode(parts[1]);
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
};

export const isTokenExpired = (token = "", skewSeconds = 60) => {
  const payload = parseJwt(token);
  if (!payload?.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return now >= payload.exp - skewSeconds;
};

export const saveAuthTokens = (tokens = {}) => {
  if (typeof window === "undefined") return;
  const payload = {
    accessToken: tokens.accessToken || "",
    idToken: tokens.idToken || "",
    refreshToken: tokens.refreshToken || "",
    tokenType: tokens.tokenType || "Bearer",
    expiresIn: tokens.expiresIn || 0,
    savedAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // ignore storage errors
  }
};

export const loadAuthTokens = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken) return null;
    if (isTokenExpired(parsed.accessToken)) {
      clearAuthTokens();
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

export const clearAuthTokens = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    // ignore storage errors
  }
};

export const getAccessToken = () => loadAuthTokens()?.accessToken || "";

export const getIdToken = () => loadAuthTokens()?.idToken || "";

export const getAuthToken = () => {
  const tokens = loadAuthTokens();
  return tokens?.idToken || tokens?.accessToken || "";
};

export const getUserFromIdToken = (idToken = "") => {
  const token = idToken || getIdToken();
  const payload = parseJwt(token);
  if (!payload) return null;
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
  };
};
