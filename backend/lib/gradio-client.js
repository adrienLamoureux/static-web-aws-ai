let gradioClientPromise;
const gradioClientCache = new Map();

const loadGradioClient = async () => {
  if (!gradioClientPromise) {
    gradioClientPromise = import("@gradio/client");
  }
  const module = await gradioClientPromise;
  return module.Client;
};

const getGradioSpaceClient = async (spaceId, token) => {
  const cacheKey = `${spaceId}:${token ? "token" : "anon"}`;
  if (gradioClientCache.has(cacheKey)) {
    return gradioClientCache.get(cacheKey);
  }
  const Client = await loadGradioClient();
  const client = token
    ? await Client.connect(spaceId, { hf_token: token })
    : await Client.connect(spaceId);
  gradioClientCache.set(cacheKey, client);
  return client;
};

module.exports = {
  getGradioSpaceClient,
};
