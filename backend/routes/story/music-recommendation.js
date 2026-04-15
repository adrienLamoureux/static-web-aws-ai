/**
 * Music recommendation engine for the story music domain.
 * Extracted from music-helpers.js to keep files under 500 lines.
 */

const {
  MUSIC_LIBRARY_SK_PREFIX,
  STORY_MUSIC_RECOMMENDATION_MIN_TERM_LENGTH,
  STORY_MUSIC_RECOMMENDATION_STOPWORDS,
  STORY_MUSIC_RECOMMENDATION_WEIGHTS,
  STORY_MUSIC_MODEL_ID,
  parseMusicTags,
  normalizeTrackForSearch,
  buildTrackSearchText,
  buildStoryMusicLibrarySk,
  inferAudioExtension,
  resolveAudioContentType,
  buildStoryMusicDefaultInput,
  buildStoryMusicLibraryKey,
  buildGeneratedTrackId,
  buildGeneratedTrackTitle,
} = require("./music-helpers");

const tokenizeSearchText = (value = "") =>
  Array.from(
    new Set(
      String(value || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter(
          (term) =>
            term.length >= STORY_MUSIC_RECOMMENDATION_MIN_TERM_LENGTH &&
            !STORY_MUSIC_RECOMMENDATION_STOPWORDS.has(term)
        )
    )
  );

const countTokenOverlap = (left = [], right = []) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0) {
    return 0;
  }
  const rightSet = new Set(right);
  return left.reduce((count, term) => (rightSet.has(term) ? count + 1 : count), 0);
};

const countTagOverlap = (left = [], right = []) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0) {
    return 0;
  }
  const rightSet = new Set(right);
  return left.reduce((count, tag) => (rightSet.has(tag) ? count + 1 : count), 0);
};

const clampRecommendationScore = (value = 0) => {
  if (!Number.isFinite(value)) return 0;
  const bounded = Math.min(Math.max(value, 0), 1);
  return Number(bounded.toFixed(4));
};

const parseIsoTimestamp = (value = "") => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildSceneRecommendationProfile = (
  normalizePromptFragment,
  { sceneItem = {}, sessionItem = {} }
) => {
  const mood = normalizePromptFragment(sceneItem.musicMood || "").toLowerCase();
  const energy = normalizePromptFragment(sceneItem.musicEnergy || "").toLowerCase();
  const tags = parseMusicTags(normalizePromptFragment, sceneItem.musicTags);
  const prompt = [
    sceneItem.prompt,
    sceneItem.sceneEnvironment,
    sceneItem.sceneAction,
    sceneItem.promptPositive,
    sessionItem.summary || "",
  ]
    .map((item) => normalizePromptFragment(item || ""))
    .filter(Boolean)
    .join(" ");
  const description = [
    sceneItem.description,
    sessionItem.synopsis || "",
    sessionItem.worldPrompt || "",
  ]
    .map((item) => normalizePromptFragment(item || ""))
    .filter(Boolean)
    .join(" ");
  const searchText = buildTrackSearchText(normalizePromptFragment, {
    title: sceneItem.title || "",
    description,
    mood,
    energy,
    tags,
    prompt,
  });
  return {
    mood,
    energy,
    tags,
    searchText,
    terms: tokenizeSearchText(searchText),
  };
};

const rankRecommendedTracks = (normalizePromptFragment, { trackItems = [], sceneProfile = {} }) => {
  const resolveMusicLibraryTrackId = (trackItem = {}) =>
    trackItem.trackId || String(trackItem.sk || "").replace(MUSIC_LIBRARY_SK_PREFIX, "");

  const buildTrackRecommendationCandidate = ({ trackItem = {}, sceneProfile: profile = {} }) => {
    const track = normalizeTrackForSearch(normalizePromptFragment, trackItem);
    const trackId = resolveMusicLibraryTrackId(track);
    const sceneTerms = Array.isArray(profile.terms) ? profile.terms : [];
    const sceneTags = Array.isArray(profile.tags) ? profile.tags : [];
    const trackTerms = tokenizeSearchText(track.searchText || "");
    const sharedTermCount = countTokenOverlap(sceneTerms, trackTerms);
    const sharedTagCount = countTagOverlap(sceneTags, track.tags || []);
    const termScore = sceneTerms.length > 0 ? sharedTermCount / sceneTerms.length : 0;
    const tagScore = sceneTags.length > 0 ? sharedTagCount / sceneTags.length : 0;
    const moodScore = profile.mood && track.mood && profile.mood === track.mood ? 1 : 0;
    const energyScore = profile.energy && track.energy && profile.energy === track.energy ? 1 : 0;
    const score = clampRecommendationScore(
      termScore * STORY_MUSIC_RECOMMENDATION_WEIGHTS.tokenCoverage +
        tagScore * STORY_MUSIC_RECOMMENDATION_WEIGHTS.tagCoverage +
        moodScore * STORY_MUSIC_RECOMMENDATION_WEIGHTS.moodMatch +
        energyScore * STORY_MUSIC_RECOMMENDATION_WEIGHTS.energyMatch
    );
    const metadataRichness =
      [track.title, track.description, track.prompt, track.mood, track.energy].filter(Boolean)
        .length + (Array.isArray(track.tags) ? track.tags.length : 0);

    return {
      trackId,
      score,
      sharedTermCount,
      sharedTagCount,
      metadataRichness,
      freshnessScore: parseIsoTimestamp(track.updatedAt || track.createdAt || ""),
      track,
    };
  };

  return trackItems
    .map((trackItem) =>
      buildTrackRecommendationCandidate({
        trackItem,
        sceneProfile,
      })
    )
    .filter((candidate) => candidate.trackId)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.sharedTermCount !== left.sharedTermCount) {
        return right.sharedTermCount - left.sharedTermCount;
      }
      if (right.sharedTagCount !== left.sharedTagCount) {
        return right.sharedTagCount - left.sharedTagCount;
      }
      if (right.metadataRichness !== left.metadataRichness) {
        return right.metadataRichness - left.metadataRichness;
      }
      return right.freshnessScore - left.freshnessScore;
    });
};

/**
 * Factory that creates the persistStorySceneMusic data-access helper bound to deps.
 * Extracted here to keep music-routes.js under 500 lines.
 */
const createPersistStorySceneMusic = (deps) => {
  const {
    mediaTable,
    getItem,
    buildMediaPk,
    dynamoClient,
    PutCommand,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    getReplicateOutputUrl,
    fetchImageBuffer,
    buildUserPrefix,
    normalizePromptFragment,
  } = deps;

  const { STORY_MUSIC_OUTPUT_FORMAT } = buildStoryMusicDefaultInput(normalizePromptFragment);

  return async function persistStorySceneMusic({
    bucket,
    userId,
    sessionId,
    sceneId,
    sceneItem,
    prediction,
    prompt,
    modelId,
    direction = {},
  }) {
    const outputUrl = getReplicateOutputUrl(prediction?.output);
    if (!outputUrl) {
      throw new Error("No music returned from Replicate");
    }
    const predictionId = prediction?.id || "";
    if (
      sceneItem.musicStatus === "succeeded" &&
      sceneItem.musicKey &&
      sceneItem.musicPredictionId &&
      predictionId &&
      sceneItem.musicPredictionId === predictionId &&
      sceneItem.musicLibraryTrackId
    ) {
      const existingTrack = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStoryMusicLibrarySk(sceneItem.musicLibraryTrackId),
      });
      if (existingTrack?.key && existingTrack.key === sceneItem.musicKey) {
        const musicUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: bucket, Key: sceneItem.musicKey }),
          { expiresIn: 900 }
        ).catch(() => "");
        return {
          updatedScene: sceneItem,
          musicKey: sceneItem.musicKey,
          musicUrl,
          trackItem: normalizeTrackForSearch(normalizePromptFragment, existingTrack),
        };
      }
    }

    const { buffer, contentType } = await fetchImageBuffer(outputUrl);
    const generatedExtension = inferAudioExtension({
      contentType,
      url: outputUrl,
      fallback: STORY_MUSIC_OUTPUT_FORMAT,
    });
    const outputExtension = generatedExtension || STORY_MUSIC_OUTPUT_FORMAT;
    const trackId = buildGeneratedTrackId();
    const musicKey = buildStoryMusicLibraryKey(buildUserPrefix, userId, trackId, outputExtension);
    const resolvedContentType = resolveAudioContentType({
      contentType,
      extension: outputExtension,
    });
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: musicKey,
        Body: buffer,
        ContentType: resolvedContentType,
      })
    );
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: musicKey,
      })
    );
    const now = new Date().toISOString();
    const resolvedMood = normalizePromptFragment(
      direction?.mood || sceneItem.musicMood || ""
    ).toLowerCase();
    const resolvedEnergy = normalizePromptFragment(
      direction?.energy || sceneItem.musicEnergy || ""
    ).toLowerCase();
    const resolvedTags = parseMusicTags(
      normalizePromptFragment,
      Array.isArray(direction?.tags) ? direction.tags : sceneItem.musicTags
    );
    const resolvedTempoBpm = Number.isFinite(Number(direction?.tempoBpm))
      ? Math.round(Number(direction.tempoBpm))
      : sceneItem.musicTempoBpm || null;
    const resolvedPrompt = prompt || sceneItem.musicPrompt || "";
    const resolvedModelId = modelId || sceneItem.musicModelId || STORY_MUSIC_MODEL_ID;
    const resolvedDescription = normalizePromptFragment(sceneItem.description || "");
    const resolvedTitle = buildGeneratedTrackTitle(normalizePromptFragment, sceneItem);
    const trackItem = normalizeTrackForSearch(normalizePromptFragment, {
      pk: buildMediaPk(userId),
      sk: buildStoryMusicLibrarySk(trackId),
      type: "STORY_MUSIC_LIBRARY_TRACK",
      trackId,
      key: musicKey,
      title: resolvedTitle,
      description: resolvedDescription,
      prompt: resolvedPrompt,
      mood: resolvedMood,
      energy: resolvedEnergy,
      tempoBpm: resolvedTempoBpm,
      tags: resolvedTags,
      modelId: resolvedModelId,
      source: "generated",
      sessionId,
      sceneId,
      sourceMusicKey: musicKey,
      searchText: buildTrackSearchText(normalizePromptFragment, {
        title: resolvedTitle,
        description: resolvedDescription,
        mood: resolvedMood,
        energy: resolvedEnergy,
        tags: resolvedTags,
        prompt: resolvedPrompt,
      }),
      createdAt: now,
      updatedAt: now,
    });
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: trackItem,
      })
    );

    const updatedScene = {
      ...sceneItem,
      musicKey,
      musicStatus: "succeeded",
      musicPredictionId: prediction?.id || sceneItem.musicPredictionId || "",
      musicPrompt: resolvedPrompt,
      musicModelId: resolvedModelId,
      musicMood: resolvedMood,
      musicEnergy: resolvedEnergy,
      musicTempoBpm: resolvedTempoBpm,
      musicTags: resolvedTags,
      musicLibraryTrackId: trackId,
      musicUpdatedAt: now,
      updatedAt: now,
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );
    const musicUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: musicKey,
      }),
      { expiresIn: 900 }
    );
    return { updatedScene, musicKey, musicUrl, trackItem };
  };
};

module.exports = {
  tokenizeSearchText,
  countTokenOverlap,
  clampRecommendationScore,
  buildSceneRecommendationProfile,
  rankRecommendedTracks,
  createPersistStorySceneMusic,
};
