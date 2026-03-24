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
  const authorizer =
    req.apiGateway?.event?.requestContext?.authorizer ||
    req.requestContext?.authorizer;

  // New REQUEST authorizer: flat context fields (sub is set directly)
  if (authorizer && authorizer.sub) {
    const groups = authorizer.groups
      ? authorizer.groups.split(",").filter(Boolean)
      : [];
    return {
      sub: authorizer.sub,
      email: authorizer.email || "",
      groups,
      anonymous: authorizer.anonymous === "true",
    };
  }

  // Backward compat: old Cognito authorizer uses claims object
  const claims = authorizer?.claims;
  if (claims?.sub) {
    const rawGroups = claims["cognito:groups"];
    const groups = Array.isArray(rawGroups)
      ? rawGroups
      : typeof rawGroups === "string"
      ? rawGroups.split(",").filter(Boolean)
      : [];
    return {
      sub: claims.sub,
      email: claims.email || "",
      groups,
      anonymous: false,
    };
  }

  // Dev fallback (unsigned JWT, non-production only)
  if (!isUnsignedFallbackAllowed()) return null;
  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const payload = decodeJwtPayload(token);
  if (payload?.sub) {
    const rawGroups = payload["cognito:groups"];
    return {
      sub: payload.sub,
      email: payload.email || "",
      groups: Array.isArray(rawGroups) ? rawGroups : [],
      anonymous: false,
    };
  }
  return null;
};

// Attaches req.user for ALL requests (null for anonymous). Never rejects.
const optionalUserMiddleware = (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  const user = getUserFromRequest(req);
  req.user = user && !user.anonymous ? user : null;
  return next();
};

// Rejects anonymous requests → 401.
const requireUserMiddleware = (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (!req.user?.sub) {
    return res.status(401).json({ message: "Authentication required" });
  }
  return next();
};

// Rejects non-admin users → 403. Must come after requireUserMiddleware.
const requireAdminMiddleware = (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (!req.user?.groups?.includes("admin")) {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
};

module.exports = {
  decodeJwtPayload,
  getUserFromRequest,
  optionalUserMiddleware,
  requireUserMiddleware,
  requireAdminMiddleware,
};
