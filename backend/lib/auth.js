const normalizeBoolean = (value, fallback = false) => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
};

const isUnsignedFallbackAllowed = () =>
  normalizeBoolean(process.env.ALLOW_UNSIGNED_JWT_FALLBACK, false) &&
  String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";

const decodeJwtPayload = (token = "") => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalizedPayload = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const json = Buffer.from(normalizedPayload, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
};

const getUserFromRequest = (req) => {
  const claims =
    req.apiGateway?.event?.requestContext?.authorizer?.claims ||
    req.requestContext?.authorizer?.claims;
  if (claims?.sub) {
    return {
      sub: claims.sub,
      email: claims.email,
    };
  }
  if (!isUnsignedFallbackAllowed()) {
    return null;
  }
  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);
  const payload = decodeJwtPayload(token);
  if (payload?.sub) {
    return {
      sub: payload.sub,
      email: payload.email,
    };
  }
  return null;
};

const requireUserMiddleware = (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (req.path === "/" || req.path === "/health") return next();
  const user = getUserFromRequest(req);
  if (!user?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  req.user = user;
  return next();
};

module.exports = {
  decodeJwtPayload,
  getUserFromRequest,
  requireUserMiddleware,
};
