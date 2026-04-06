/**
 * Shared route guard utilities.
 * Call early in a handler and return if the guard fires to short-circuit.
 */

/** Returns false and sends 500 if value is falsy, true if value is truthy. */
const requireEnv = (res, name, value) => {
  if (!value) {
    res.status(500).json({ message: `${name} is not set` });
    return false;
  }
  return true;
};

/** Returns false and sends 401 if userId is falsy. */
const requireAuth = (res, userId) => {
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  return true;
};

/** Returns false and sends 400 if condition is falsy. */
const requireParam = (res, name, value) => {
  if (!value) {
    res.status(400).json({ message: `${name} is required` });
    return false;
  }
  return true;
};

module.exports = { requireEnv, requireAuth, requireParam };
