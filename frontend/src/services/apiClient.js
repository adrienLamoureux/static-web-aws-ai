import { getAuthToken } from "../utils/authTokens";

export const normalizeBaseUrl = (baseUrl = "") =>
  baseUrl.replace(/\/+$/, "");

export const buildApiUrl = (baseUrl, path = "") => {
  if (!baseUrl) return path || "";
  const trimmed = normalizeBaseUrl(baseUrl);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${suffix}`;
};

export const buildUrlWithQuery = (baseUrl, path, params = {}) => {
  const url = buildApiUrl(baseUrl, path);
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `${url}?${query}` : url;
};

const withAuthHeaders = (headers = {}) => {
  const token = getAuthToken();
  if (!token) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
};

export const fetchJson = async (url, options = {}, errorMessage) => {
  const response = await fetch(url, {
    ...options,
    headers: withAuthHeaders(options.headers || {}),
  });
  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.message || errorMessage || "Request failed.");
  }
  return data;
};

export const postJson = (url, payload, errorMessage) =>
  fetchJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    errorMessage
  );

export const deleteJson = (url, errorMessage) =>
  fetchJson(
    url,
    {
      method: "DELETE",
    },
    errorMessage
  );
