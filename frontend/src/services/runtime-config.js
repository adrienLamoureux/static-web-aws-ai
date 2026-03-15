const CONFIG_PATH = "/config.json";
const LOCALHOST_HOSTNAME = "localhost";

const asString = (value = "") => String(value || "").trim();

const shouldPreferEnvApiBaseUrl = ({ envApiBaseUrl, hostname }) =>
  Boolean(envApiBaseUrl) && asString(hostname) === LOCALHOST_HOSTNAME;

const fetchJson = async (url, fetchImpl = fetch) => {
  const response = await fetchImpl(url);
  if (!response.ok) {
    return null;
  }
  return response.json();
};

export const fetchRuntimeConfig = async (fetchImpl = fetch) => {
  try {
    const payload = await fetchJson(CONFIG_PATH, fetchImpl);
    return payload && typeof payload === "object" ? payload : null;
  } catch (_error) {
    return null;
  }
};

export const resolveApiBaseUrl = ({
  runtimeApiBaseUrl = "",
  envApiBaseUrl = "",
  hostname = "",
}) => {
  const normalizedRuntimeApiBaseUrl = asString(runtimeApiBaseUrl);
  const normalizedEnvApiBaseUrl = asString(envApiBaseUrl);

  if (
    shouldPreferEnvApiBaseUrl({
      envApiBaseUrl: normalizedEnvApiBaseUrl,
      hostname,
    })
  ) {
    return normalizedEnvApiBaseUrl;
  }

  return normalizedRuntimeApiBaseUrl || normalizedEnvApiBaseUrl;
};

