/**
 * Shared error response helpers for route handlers.
 */

/** Log and send a 500 error response from a route's catch block. */
const handleRouteError = (res, label, error) => {
  console.error(`${label} error:`, {
    message: error?.message || String(error),
    stack: process.env.NODE_ENV !== "production" ? error?.stack : undefined,
  });
  res.status(500).json({
    message: `Failed to ${label}`,
    error: error?.message || String(error),
  });
};

module.exports = { handleRouteError };
