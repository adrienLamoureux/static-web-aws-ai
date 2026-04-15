// Pure utility functions for the Whisk page

/**
 * Converts a director-config model list into a { [modelKey]: boolean } support map.
 * @param {Array} models - array of model config objects from director config
 * @returns {{ [key: string]: boolean }}
 */
export const toLoraSupportMap = (models = []) =>
  (Array.isArray(models) ? models : []).reduce((acc, item) => {
    const key = String(item?.key || "").trim();
    if (key) acc[key] = Boolean(item?.supportsLora);
    return acc;
  }, {});

/**
 * Returns a list of model keys from a support map where LoRA is supported.
 * @param {{ [key: string]: boolean }} supportMap
 * @returns {string[]}
 */
export const buildSupportedModels = (supportMap = {}) =>
  Object.keys(supportMap).filter((k) => Boolean(supportMap[k]));
