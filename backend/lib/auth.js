const decodeJwtPayload = (token = "") => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64").toString("utf-8");
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
  const authHeader =
    req.headers?.authorization || req.headers?.Authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = decodeJwtPayload(token);
    if (payload?.sub) {
      return {
        sub: payload.sub,
        email: payload.email,
      };
    }
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
