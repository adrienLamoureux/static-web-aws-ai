const registerDirectorRoutes = require("./ops/director-routes");
const registerDashboardRoutes = require("./ops/dashboard-routes");
const {
  buildDirectorOptions,
  GLOBAL_MASONRY_PREFIX,
  MAX_GLOBAL_MASONRY_IMAGES,
  GLOBAL_MASONRY_URL_EXPIRATION_SECONDS,
  toMs,
  isMasonryImageKey,
} = require("./ops/ops-helpers");

const buildListGlobalMasonryImages = (deps) => {
  const {
    s3Client,
    getSignedUrl,
    GetObjectCommand,
    ListObjectsV2Command,
  } = deps;

  return async ({ limit = MAX_GLOBAL_MASONRY_IMAGES } = {}) => {
    const mediaBucket = process.env.MEDIA_BUCKET;
    if (!mediaBucket || !s3Client) {
      return [];
    }
    const maxKeys = Math.max(1, Math.min(1000, Number(limit) || MAX_GLOBAL_MASONRY_IMAGES));
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: mediaBucket,
        Prefix: GLOBAL_MASONRY_PREFIX,
        MaxKeys: maxKeys,
      })
    );
    const objects = (response.Contents || [])
      .filter((item) => isMasonryImageKey(item.Key))
      .sort((left, right) => toMs(right.LastModified) - toMs(left.LastModified))
      .slice(0, maxKeys);
    return Promise.all(
      objects.map(async (item) => {
        const key = item.Key;
        const url = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: mediaBucket, Key: key }),
          { expiresIn: GLOBAL_MASONRY_URL_EXPIRATION_SECONDS }
        );
        return {
          key,
          url,
          updatedAt: item.LastModified ? new Date(item.LastModified).toISOString() : "",
          sizeBytes: Number(item.Size || 0),
        };
      })
    );
  };
};

const registerOperationsRoutes = (app, deps) => {
  const listGlobalMasonryImages = buildListGlobalMasonryImages(deps);
  const extendedDeps = { ...deps, listGlobalMasonryImages };

  app.use("/ops", registerDashboardRoutes(extendedDeps));
  app.use("/ops", registerDirectorRoutes(extendedDeps));
};

module.exports = registerOperationsRoutes;
module.exports.buildDirectorOptions = buildDirectorOptions;
