export const DEFAULT_CONTEXT_MODE = "summary+scene";
export const DEFAULT_ILLUSTRATION_MODEL = "wai-nsfw-illustrious-v11";
export const DEFAULT_ANIMATION_PROMPT = "A lot of movements";
export const DEFAULT_MUSIC_PROMPT = "";

export const normalizeStoryScene = (scene = {}) => {
  const parsedTempo = Number(scene.musicTempoBpm);
  const hasRecommendationScore =
    scene.recommendationScore !== null &&
    scene.recommendationScore !== "" &&
    typeof scene.recommendationScore !== "undefined";
  const parsedRecommendationScore = Number(scene.recommendationScore);
  return {
    ...scene,
    videoKey: scene.videoKey || "",
    videoUrl: scene.videoUrl || "",
    videoStatus: scene.videoStatus || "",
    videoPredictionId: scene.videoPredictionId || "",
    videoPrompt: scene.videoPrompt || "",
    musicKey: scene.musicKey || "",
    musicUrl: scene.musicUrl || "",
    musicStatus: scene.musicStatus || "",
    musicPredictionId: scene.musicPredictionId || "",
    musicPrompt: scene.musicPrompt || "",
    musicModelId: scene.musicModelId || "",
    musicMood: scene.musicMood || "",
    musicEnergy: scene.musicEnergy || "",
    musicTempoBpm: Number.isFinite(parsedTempo) ? Math.round(parsedTempo) : null,
    musicTags: Array.isArray(scene.musicTags) ? scene.musicTags : [],
    musicLibraryTrackId: scene.musicLibraryTrackId || "",
    recommendedTrackId: scene.recommendedTrackId || "",
    recommendationMethod: scene.recommendationMethod || "",
    recommendationScore:
      hasRecommendationScore && Number.isFinite(parsedRecommendationScore)
        ? parsedRecommendationScore
        : null,
  };
};
