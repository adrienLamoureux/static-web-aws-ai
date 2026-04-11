const DEFAULT_STAGE = "sandbox";
const STACK_ID_PREFIX = "StaticWebAWSAIStack";
const STAGE_PATTERN = /[^a-z0-9-]/g;
const MULTIPLE_DASHES_PATTERN = /-+/g;
const EDGE_DASHES_PATTERN = /^-+|-+$/g;
const FALLBACK_STAGE = "idea";

const normalizeStage = (value: string) =>
  value
    .toLowerCase()
    .replace(STAGE_PATTERN, "-")
    .replace(MULTIPLE_DASHES_PATTERN, "-")
    .replace(EDGE_DASHES_PATTERN, "");

export const resolveStageName = (rawStage?: string | null) => {
  const normalized = normalizeStage(String(rawStage || ""));
  if (normalized) return normalized;
  return DEFAULT_STAGE;
};

export const sanitizeStageSegment = (value?: string | null) => {
  const normalized = normalizeStage(String(value || ""));
  if (normalized) return normalized;
  return FALLBACK_STAGE;
};

export const buildStackId = (stage: string) =>
  `${STACK_ID_PREFIX}-${resolveStageName(stage)}`;

export { DEFAULT_STAGE, STACK_ID_PREFIX };
