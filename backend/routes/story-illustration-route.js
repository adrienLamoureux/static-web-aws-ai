module.exports = (app, deps) => {
  const {
    mediaTable,
    getItem,
    buildMediaPk,
    buildStorySessionSk,
    buildStorySceneSk,
    queryBySkPrefix,
    storyMessagePrefix,
    buildSceneFragmentsFromStoryState,
    dedupeFragments,
    compactScenePayload,
    aiCraftSceneContext,
    normalizePromptFragment,
    dynamoClient,
    PutCommand,
    getSignedUrl,
    s3Client,
    GetObjectCommand,
    HeadObjectCommand,
    ensureStoryCharacters,
    buildStoryCharacterPk,
    buildStoryCharacterSk,
    clampPromptTokens,
    replicateModelConfig,
    replicateVideoConfig,
    replicateClient,
    buildSeedList,
    runReplicateWithRetry,
    buildReplicatePredictionRequest,
    getReplicateOutputUrl,
    fetchImageBuffer,
    fetchS3ImageBuffer,
    buildUserPrefix,
    ensureUserKey,
    PutObjectCommand,
    MAX_REPLICATE_PROMPT_TOKENS,
    aiCraftIllustrationPrompts,
    aiCraftMusicDirection,
    copyS3Object,
  } = deps;

  const DEFAULT_STORY_ILLUSTRATION_MODEL = "wai-nsfw-illustrious-v11";
  const STORY_ILLUSTRATION_MODEL_KEYS = new Set([
    "animagine",
    "wai-nsfw-illustrious-v11",
  ]);
  const OPENING_SCENE_ID_PREFIX = "opening-";
  const OPENING_SCENE_TITLE = "opening scene";
  const DEFAULT_STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS = 3;
  const DEFAULT_STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS = 1;
  const STORY_ANIMATION_MODEL_KEY = "wan-2.2-i2v-fast";
  const DEFAULT_STORY_ANIMATION_PROMPT = "A lot of movements";
  const DEFAULT_STORY_MUSIC_DURATION_SECONDS = 8;
  const DEFAULT_STORY_MUSIC_MODEL_VERSION = "stereo-large";
  const DEFAULT_STORY_MUSIC_OUTPUT_FORMAT = "mp3";
  const DEFAULT_STORY_MUSIC_NORMALIZATION = "peak";
  const DEFAULT_STORY_MUSIC_TOP_K = 250;
  const DEFAULT_STORY_MUSIC_TOP_P = 0;
  const DEFAULT_STORY_MUSIC_TEMPERATURE = 1;
  const DEFAULT_STORY_MUSIC_GUIDANCE = 3;
  const DEFAULT_STORY_MUSIC_LOOP_HINT =
    "Seamless loopable ambient game underscore with no intro hit, no ending cadence, and no fade-out.";
  const DEFAULT_STORY_MUSIC_APPLY_LOOP_HINT = false;
  const AUDIO_CONTENT_TYPE_BY_EXTENSION = Object.freeze({
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/mp4",
  });
  const STORY_MUSIC_SUPPORTED_OUTPUT_FORMATS = new Set(
    Object.keys(AUDIO_CONTENT_TYPE_BY_EXTENSION)
  );

  const parseIntegerEnv = (value, fallback, minimum = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(Math.round(parsed), minimum);
  };

  const parseNumberEnv = (value, fallback, minimum = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(parsed, minimum);
  };

  const parseBooleanEnv = (value, fallback = false) => {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return fallback;
  };

  const parseOptionalNumber = (value) => {
    if (value === null || value === "" || typeof value === "undefined") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const STORY_MUSIC_DURATION_SECONDS = parseIntegerEnv(
    process.env.STORY_MUSIC_DURATION_SECONDS,
    DEFAULT_STORY_MUSIC_DURATION_SECONDS,
    1
  );
  const STORY_MUSIC_MODEL_VERSION =
    normalizePromptFragment(process.env.STORY_MUSIC_MODEL_VERSION || "") ||
    DEFAULT_STORY_MUSIC_MODEL_VERSION;
  const requestedStoryMusicOutputFormat = normalizePromptFragment(
    process.env.STORY_MUSIC_OUTPUT_FORMAT || ""
  )
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const STORY_MUSIC_OUTPUT_FORMAT = STORY_MUSIC_SUPPORTED_OUTPUT_FORMATS.has(
    requestedStoryMusicOutputFormat
  )
    ? requestedStoryMusicOutputFormat
    : DEFAULT_STORY_MUSIC_OUTPUT_FORMAT;
  const STORY_MUSIC_NORMALIZATION =
    normalizePromptFragment(process.env.STORY_MUSIC_NORMALIZATION_STRATEGY || "") ||
    DEFAULT_STORY_MUSIC_NORMALIZATION;
  const STORY_MUSIC_TOP_K = parseIntegerEnv(
    process.env.STORY_MUSIC_TOP_K,
    DEFAULT_STORY_MUSIC_TOP_K,
    0
  );
  const STORY_MUSIC_TOP_P = parseNumberEnv(
    process.env.STORY_MUSIC_TOP_P,
    DEFAULT_STORY_MUSIC_TOP_P,
    0
  );
  const STORY_MUSIC_TEMPERATURE = parseNumberEnv(
    process.env.STORY_MUSIC_TEMPERATURE,
    DEFAULT_STORY_MUSIC_TEMPERATURE,
    0
  );
  const STORY_MUSIC_GUIDANCE = parseIntegerEnv(
    process.env.STORY_MUSIC_CLASSIFIER_FREE_GUIDANCE,
    DEFAULT_STORY_MUSIC_GUIDANCE,
    0
  );
  const STORY_MUSIC_APPLY_LOOP_HINT = parseBooleanEnv(
    process.env.STORY_MUSIC_APPLY_LOOP_HINT,
    DEFAULT_STORY_MUSIC_APPLY_LOOP_HINT
  );
  const STORY_MUSIC_LOOP_HINT = normalizePromptFragment(
    process.env.STORY_MUSIC_LOOP_HINT || DEFAULT_STORY_MUSIC_LOOP_HINT
  );
  const STORY_MUSIC_MODEL_ID =
    process.env.REPLICATE_STORY_MUSIC_MODEL_ID ||
    "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";
  const STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS = parseIntegerEnv(
    process.env.STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
    DEFAULT_STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
    1
  );
  const STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS = parseIntegerEnv(
    process.env.STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS,
    DEFAULT_STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS,
    0
  );
  const STORY_MUSIC_DEFAULT_INPUT = Object.freeze({
    top_k: STORY_MUSIC_TOP_K,
    top_p: STORY_MUSIC_TOP_P,
    duration: STORY_MUSIC_DURATION_SECONDS,
    temperature: STORY_MUSIC_TEMPERATURE,
    continuation: false,
    model_version: STORY_MUSIC_MODEL_VERSION,
    output_format: STORY_MUSIC_OUTPUT_FORMAT,
    continuation_start: 0,
    multi_band_diffusion: false,
    normalization_strategy: STORY_MUSIC_NORMALIZATION,
    classifier_free_guidance: STORY_MUSIC_GUIDANCE,
  });
  const DEFAULT_STORY_MUSIC_PROMPT =
    "Cinematic fantasy ambience, gentle orchestral movement";
  const MUSIC_LIBRARY_SK_PREFIX = "MUSICLIB#";
  const STORY_MUSIC_RECOMMENDATION_METHOD = "keyword-overlap-v1";
  const STORY_MUSIC_RECOMMENDATION_SCAN_LIMIT = 500;
  const STORY_MUSIC_RECOMMENDATION_CANDIDATE_LIMIT = 5;
  const STORY_MUSIC_RECOMMENDATION_MIN_TERM_LENGTH = 3;
  const STORY_MUSIC_RECOMMENDATION_WEIGHTS = Object.freeze({
    tokenCoverage: 0.65,
    tagCoverage: 0.2,
    moodMatch: 0.1,
    energyMatch: 0.05,
  });
  const STORY_MUSIC_RECOMMENDATION_STOPWORDS = new Set([
    "about",
    "after",
    "again",
    "ambient",
    "around",
    "audio",
    "before",
    "between",
    "cinematic",
    "during",
    "fantasy",
    "from",
    "game",
    "gentle",
    "into",
    "just",
    "like",
    "music",
    "scene",
    "score",
    "soundtrack",
    "story",
    "that",
    "the",
    "then",
    "there",
    "this",
    "track",
    "with",
  ]);

  const isOpeningSceneItem = (sceneItem = {}) => {
    const normalizedSceneId = normalizePromptFragment(sceneItem.sceneId || "")
      .toLowerCase();
    const normalizedTitle = normalizePromptFragment(sceneItem.title || "")
      .toLowerCase();
    return (
      normalizedSceneId.startsWith(OPENING_SCENE_ID_PREFIX) ||
      normalizedTitle === OPENING_SCENE_TITLE
    );
  };

  const signSceneVideoUrl = async (bucket, sceneItem = {}) => {
    if (!sceneItem.videoKey) return "";
    try {
      return await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: sceneItem.videoKey,
        }),
        { expiresIn: 900 }
      );
    } catch (error) {
      return "";
    }
  };

  const signSceneMusicUrl = async (bucket, sceneItem = {}) => {
    if (!sceneItem.musicKey) return "";
    try {
      return await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: sceneItem.musicKey,
        }),
        { expiresIn: 900 }
      );
    } catch (error) {
      return "";
    }
  };

  const buildStorySceneVideoKey = (userId = "", sessionId = "", sceneId = "") =>
    `${buildUserPrefix(userId)}stories/${sessionId}/scenes/${sceneId}.mp4`;
  const buildStorySceneMusicKey = (
    userId = "",
    sessionId = "",
    sceneId = "",
    extension = STORY_MUSIC_OUTPUT_FORMAT
  ) => `${buildUserPrefix(userId)}stories/${sessionId}/scenes/${sceneId}.${extension}`;
  const buildStoryMusicLibrarySk = (trackId = "") =>
    `${MUSIC_LIBRARY_SK_PREFIX}${trackId}`;
  const buildStoryMusicLibraryKey = (
    userId = "",
    trackId = "",
    extension = STORY_MUSIC_OUTPUT_FORMAT
  ) =>
    `${buildUserPrefix(userId)}stories/music-library/${trackId}.${extension}`;

  const buildGeneratedTrackId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const buildGeneratedTrackTitle = ({ sceneItem = {} }) =>
    normalizePromptFragment(`${sceneItem.title || "Scene"} soundtrack`) ||
    "Saved soundtrack";

  const buildDataUrl = ({ buffer, contentType }) =>
    `data:${contentType || "image/png"};base64,${buffer.toString("base64")}`;

  const inferAudioExtension = ({
    contentType = "",
    url = "",
    fallback = STORY_MUSIC_OUTPUT_FORMAT,
  }) => {
    const normalizedType = String(contentType || "").toLowerCase();
    if (normalizedType.includes("audio/mpeg") || normalizedType.includes("audio/mp3")) {
      return "mp3";
    }
    if (normalizedType.includes("audio/wav") || normalizedType.includes("audio/x-wav")) {
      return "wav";
    }
    if (normalizedType.includes("audio/ogg")) return "ogg";
    if (normalizedType.includes("audio/flac")) return "flac";
    if (normalizedType.includes("audio/aac")) return "aac";
    if (normalizedType.includes("audio/mp4")) return "m4a";
    const extFromUrl = String(url || "")
      .split("?")[0]
      .split(".")
      .pop()
      ?.toLowerCase();
    if (extFromUrl && /^[a-z0-9]{2,5}$/.test(extFromUrl)) {
      return extFromUrl;
    }
    return fallback;
  };

  const resolveAudioContentType = ({ contentType = "", extension = "" }) => {
    const normalizedType = String(contentType || "").toLowerCase();
    if (normalizedType.startsWith("audio/")) {
      return normalizedType;
    }
    const normalizedExtension = String(extension || "").toLowerCase();
    return (
      AUDIO_CONTENT_TYPE_BY_EXTENSION[normalizedExtension] ||
      AUDIO_CONTENT_TYPE_BY_EXTENSION[STORY_MUSIC_OUTPUT_FORMAT] ||
      "audio/mpeg"
    );
  };

  const buildLoopFriendlyMusicPrompt = (rawPrompt = "") => {
    const normalizedPrompt = normalizePromptFragment(rawPrompt || "");
    if (!STORY_MUSIC_APPLY_LOOP_HINT || !STORY_MUSIC_LOOP_HINT) {
      return normalizedPrompt;
    }
    const normalizedLower = normalizedPrompt.toLowerCase();
    const hintLower = STORY_MUSIC_LOOP_HINT.toLowerCase();
    if (!normalizedPrompt) return STORY_MUSIC_LOOP_HINT;
    if (normalizedLower.includes("seamless loop") || normalizedLower.includes(hintLower)) {
      return normalizedPrompt;
    }
    return `${normalizedPrompt}. ${STORY_MUSIC_LOOP_HINT}`;
  };

  const buildSceneMusicPayload = ({ sceneItem = {}, musicUrl = "" }) => ({
    musicKey: sceneItem.musicKey || "",
    musicUrl: musicUrl || "",
    musicStatus: sceneItem.musicStatus || "",
    musicPredictionId: sceneItem.musicPredictionId || "",
    musicPrompt: sceneItem.musicPrompt || "",
    musicModelId: sceneItem.musicModelId || "",
    musicMood: sceneItem.musicMood || "",
    musicEnergy: sceneItem.musicEnergy || "",
    musicTempoBpm: sceneItem.musicTempoBpm || null,
    musicTags: Array.isArray(sceneItem.musicTags) ? sceneItem.musicTags : [],
    musicLibraryTrackId: sceneItem.musicLibraryTrackId || "",
    recommendedTrackId: sceneItem.recommendedTrackId || "",
    recommendationMethod: sceneItem.recommendationMethod || "",
    recommendationScore: parseOptionalNumber(sceneItem.recommendationScore),
    musicUpdatedAt: sceneItem.musicUpdatedAt || "",
  });

  const signMusicTrackUrl = async (bucket, key) => {
    if (!bucket || !key) return "";
    try {
      return await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
        { expiresIn: 900 }
      );
    } catch (error) {
      return "";
    }
  };

  const mapMusicTrackResponse = async (bucket, trackItem = {}) => ({
    trackId:
      trackItem.trackId ||
      String(trackItem.sk || "").replace(MUSIC_LIBRARY_SK_PREFIX, ""),
    title: trackItem.title || "Saved soundtrack",
    description: trackItem.description || "",
    key: trackItem.key || "",
    url: await signMusicTrackUrl(bucket, trackItem.key),
    prompt: trackItem.prompt || "",
    mood: normalizePromptFragment(trackItem.mood || "").toLowerCase(),
    energy: normalizePromptFragment(trackItem.energy || "").toLowerCase(),
    tempoBpm: trackItem.tempoBpm || null,
    tags: parseMusicTags(trackItem.tags),
    modelId: trackItem.modelId || STORY_MUSIC_MODEL_ID,
    sessionId: trackItem.sessionId || "",
    sceneId: trackItem.sceneId || "",
    source: trackItem.source || "",
    createdAt: trackItem.createdAt || "",
    updatedAt: trackItem.updatedAt || "",
  });

  const parseMusicTags = (value) => {
    const raw = Array.isArray(value)
      ? value
      : String(value || "")
          .split(",")
          .map((item) => item.trim());
    return Array.from(
      new Set(
        raw
          .map((item) => normalizePromptFragment(String(item || "")).toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, 12);
  };

  const buildTrackSearchText = ({
    title = "",
    description = "",
    mood = "",
    energy = "",
    tags = [],
    prompt = "",
  }) =>
    [title, description, mood, energy, prompt, ...(Array.isArray(tags) ? tags : [])]
      .map((item) => normalizePromptFragment(String(item || "")).toLowerCase())
      .filter(Boolean)
      .join(" ");

  const parseLibraryLimit = (value, fallback = 200) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.round(parsed), 1), 500);
  };

  const normalizeTrackForSearch = (trackItem = {}) => {
    const tags = parseMusicTags(trackItem.tags);
    const title = normalizePromptFragment(trackItem.title || "Saved soundtrack");
    const description = normalizePromptFragment(trackItem.description || "");
    const prompt = normalizePromptFragment(trackItem.prompt || "");
    const mood = normalizePromptFragment(trackItem.mood || "").toLowerCase();
    const energy = normalizePromptFragment(trackItem.energy || "").toLowerCase();
    const source =
      normalizePromptFragment(trackItem.source || "").toLowerCase() ||
      (trackItem.sessionId || trackItem.sceneId ? "generated" : "");
    const searchText = normalizePromptFragment(
      trackItem.searchText ||
        buildTrackSearchText({
          title,
          description,
          mood,
          energy,
          tags,
          prompt,
        })
    ).toLowerCase();
    return {
      ...trackItem,
      title,
      description,
      prompt,
      mood,
      energy,
      source,
      tags,
      searchText,
    };
  };

  const resolveMusicLibraryTrackId = (trackItem = {}) =>
    trackItem.trackId ||
    String(trackItem.sk || "").replace(MUSIC_LIBRARY_SK_PREFIX, "");

  const parseIsoTimestamp = (value = "") => {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const clampRecommendationScore = (value = 0) => {
    if (!Number.isFinite(value)) return 0;
    const bounded = Math.min(Math.max(value, 0), 1);
    return Number(bounded.toFixed(4));
  };

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

  const buildSceneRecommendationProfile = ({ sceneItem = {}, sessionItem = {} }) => {
    const mood = normalizePromptFragment(sceneItem.musicMood || "").toLowerCase();
    const energy = normalizePromptFragment(sceneItem.musicEnergy || "").toLowerCase();
    const tags = parseMusicTags(sceneItem.musicTags);
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
    const searchText = buildTrackSearchText({
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

  const buildTrackRecommendationCandidate = ({
    trackItem = {},
    sceneProfile = {},
  }) => {
    const track = normalizeTrackForSearch(trackItem);
    const trackId = resolveMusicLibraryTrackId(track);
    const sceneTerms = Array.isArray(sceneProfile.terms) ? sceneProfile.terms : [];
    const sceneTags = Array.isArray(sceneProfile.tags) ? sceneProfile.tags : [];
    const trackTerms = tokenizeSearchText(track.searchText || "");
    const sharedTermCount = countTokenOverlap(sceneTerms, trackTerms);
    const sharedTagCount = countTagOverlap(sceneTags, track.tags || []);
    const termScore =
      sceneTerms.length > 0 ? sharedTermCount / sceneTerms.length : 0;
    const tagScore = sceneTags.length > 0 ? sharedTagCount / sceneTags.length : 0;
    const moodScore =
      sceneProfile.mood && track.mood && sceneProfile.mood === track.mood ? 1 : 0;
    const energyScore =
      sceneProfile.energy && track.energy && sceneProfile.energy === track.energy
        ? 1
        : 0;
    const score = clampRecommendationScore(
      termScore * STORY_MUSIC_RECOMMENDATION_WEIGHTS.tokenCoverage +
        tagScore * STORY_MUSIC_RECOMMENDATION_WEIGHTS.tagCoverage +
        moodScore * STORY_MUSIC_RECOMMENDATION_WEIGHTS.moodMatch +
        energyScore * STORY_MUSIC_RECOMMENDATION_WEIGHTS.energyMatch
    );
    const metadataRichness =
      [
        track.title,
        track.description,
        track.prompt,
        track.mood,
        track.energy,
      ].filter(Boolean).length + (Array.isArray(track.tags) ? track.tags.length : 0);

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

  const rankRecommendedTracks = ({ trackItems = [], sceneProfile = {} }) =>
    trackItems
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

  const matchesTrackFilter = (trackItem = {}, filters = {}) => {
    const track = normalizeTrackForSearch(trackItem);
    const terms = String(filters.q || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (terms.length > 0) {
      const searchable = track.searchText || "";
      const allTermsPresent = terms.every((term) => searchable.includes(term));
      if (!allTermsPresent) return false;
    }

    if (filters.mood && track.mood !== filters.mood) {
      return false;
    }
    if (filters.energy && track.energy !== filters.energy) {
      return false;
    }
    if (filters.source && track.source !== filters.source) {
      return false;
    }

    if (Array.isArray(filters.tags) && filters.tags.length > 0) {
      const tagSet = new Set(track.tags || []);
      if ((filters.tagsMode || "any") === "all") {
        const everyTagPresent = filters.tags.every((tag) => tagSet.has(tag));
        if (!everyTagPresent) return false;
      } else {
        const atLeastOneTag = filters.tags.some((tag) => tagSet.has(tag));
        if (!atLeastOneTag) return false;
      }
    }

    return true;
  };

  const persistStorySceneVideo = async ({
    bucket,
    userId,
    sessionId,
    sceneId,
    sceneItem,
    prediction,
    prompt,
  }) => {
    const outputUrl = getReplicateOutputUrl(prediction?.output);
    if (!outputUrl) {
      throw new Error("No video returned from Replicate");
    }
    const { buffer, contentType } = await fetchImageBuffer(outputUrl);
    const videoKey = buildStorySceneVideoKey(userId, sessionId, sceneId);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: videoKey,
        Body: buffer,
        ContentType: contentType || "video/mp4",
      })
    );
    const updatedScene = {
      ...sceneItem,
      videoKey,
      videoStatus: "succeeded",
      videoPredictionId: prediction?.id || sceneItem.videoPredictionId || "",
      videoPrompt: prompt || sceneItem.videoPrompt || "",
      videoUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );
    const videoUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: videoKey,
      }),
      { expiresIn: 900 }
    );
    return { updatedScene, videoKey, videoUrl };
  };

  const persistStorySceneMusic = async ({
    bucket,
    userId,
    sessionId,
    sceneId,
    sceneItem,
    prediction,
    prompt,
    modelId,
    direction = {},
  }) => {
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
        const musicUrl = await signSceneMusicUrl(bucket, sceneItem);
        return {
          updatedScene: sceneItem,
          musicKey: sceneItem.musicKey,
          musicUrl,
          trackItem: normalizeTrackForSearch(existingTrack),
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
    const musicKey = buildStoryMusicLibraryKey(userId, trackId, outputExtension);
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
      Array.isArray(direction?.tags) ? direction.tags : sceneItem.musicTags
    );
    const resolvedTempoBpm = Number.isFinite(Number(direction?.tempoBpm))
      ? Math.round(Number(direction.tempoBpm))
      : sceneItem.musicTempoBpm || null;
    const resolvedPrompt = prompt || sceneItem.musicPrompt || "";
    const resolvedModelId = modelId || sceneItem.musicModelId || STORY_MUSIC_MODEL_ID;
    const resolvedDescription = normalizePromptFragment(sceneItem.description || "");
    const resolvedTitle = buildGeneratedTrackTitle({ sceneItem });
    const trackItem = normalizeTrackForSearch({
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
      searchText: buildTrackSearchText({
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

app.post("/story/sessions/:id/illustrations", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  let sceneId = req.body?.sceneId;
  const forceCurrent = Boolean(req.body?.forceCurrent);
  const regenerate = Boolean(req.body?.regenerate);
  const contextMode = req.body?.contextMode || "summary+scene";
  const requestedModelKey = req.body?.model || DEFAULT_STORY_ILLUSTRATION_MODEL;
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const debug = req.query?.debug === "true";
  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || (!sceneId && !forceCurrent)) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required unless forceCurrent is true" });
  }
  if (!STORY_ILLUSTRATION_MODEL_KEYS.has(requestedModelKey)) {
    return res.status(400).json({
      message: `Unsupported model selection: ${requestedModelKey}`,
      allowed: Array.from(STORY_ILLUSTRATION_MODEL_KEYS),
    });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }

    let sceneItem = null;
    if (sceneId) {
      sceneItem = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, sceneId),
      });
    }
    if (!sceneItem && forceCurrent) {
      const recentMessages = await queryBySkPrefix({
        pk: buildMediaPk(userId),
        skPrefix: storyMessagePrefix(sessionId),
        limit: 6,
        scanForward: false,
      });
      const latestAssistant = recentMessages.find(
        (message) => message.role === "assistant"
      );
      const stateScene = buildSceneFragmentsFromStoryState(
        sessionItem.storyState || {},
        sessionItem.worldPrompt || ""
      );
      const mergedEnvironment = dedupeFragments([...stateScene.environment]);
      const mergedAction = dedupeFragments([...stateScene.action]);
      const compactCurrentScene = await aiCraftSceneContext({
        scenePrompt: dedupeFragments([...mergedEnvironment, ...mergedAction]).join(", "),
        sceneEnvironment: mergedEnvironment.join(", "),
        sceneAction: mergedAction.join(", "),
        contextText: latestAssistant?.content || "",
        storyState: sessionItem.storyState || {},
        lorebook: sessionItem.lorebook || {},
      });
      sceneId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      sceneItem = {
        pk: buildMediaPk(userId),
        sk: buildStorySceneSk(sessionId, sceneId),
        type: "STORY_SCENE",
        sessionId,
        sceneId,
        title: "Current moment",
        description:
          normalizePromptFragment(latestAssistant?.content || "") ||
          `Current scene with ${sessionItem.protagonistName}.`,
        prompt: compactCurrentScene.scenePrompt,
        sceneEnvironment: compactCurrentScene.sceneEnvironment,
        sceneAction: compactCurrentScene.sceneAction,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: sceneItem,
        })
      );
      const updatedSession = {
        ...sessionItem,
        sceneCount: (sessionItem.sceneCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedSession,
        })
      );
      sessionItem.sceneCount = updatedSession.sceneCount;
      sessionItem.updatedAt = updatedSession.updatedAt;
    }
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    if (sceneItem.status === "completed" && sceneItem.imageKey && !regenerate) {
      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: sceneItem.imageKey,
        }),
        { expiresIn: 900 }
      );
      const videoUrl = await signSceneVideoUrl(bucket, sceneItem);
      const musicUrl = await signSceneMusicUrl(bucket, sceneItem);
      return res.json({
        sceneId,
        imageKey: sceneItem.imageKey,
        imageUrl: url,
        videoKey: sceneItem.videoKey || "",
        videoUrl,
        ...buildSceneMusicPayload({ sceneItem, musicUrl }),
        scene: {
          sceneId: sceneItem.sceneId,
          title: sceneItem.title,
          description: sceneItem.description,
          prompt: sceneItem.prompt,
          sceneEnvironment: sceneItem.sceneEnvironment,
          sceneAction: sceneItem.sceneAction,
          status: sceneItem.status,
          videoKey: sceneItem.videoKey || "",
          videoUrl,
          videoStatus: sceneItem.videoStatus || "",
          videoPredictionId: sceneItem.videoPredictionId || "",
          videoPrompt: sceneItem.videoPrompt || "",
          ...buildSceneMusicPayload({ sceneItem, musicUrl }),
          createdAt: sceneItem.createdAt,
        },
      });
    }

    const characters = await ensureStoryCharacters();
    const characterMap = new Map(
      characters.map((character) => [character.id, character])
    );
    const resolvedProtagonistId =
      sessionItem.protagonistId ||
      (sessionItem.protagonistName?.toLowerCase().includes("frieren")
        ? "frieren"
        : "");
    const characterItem = resolvedProtagonistId
      ? await getItem({
          pk: buildStoryCharacterPk(),
          sk: buildStoryCharacterSk(resolvedProtagonistId),
        })
      : null;
    const fallbackCharacter =
      characterMap.get(resolvedProtagonistId || "") || null;
    const resolvedCharacter =
      characterItem || fallbackCharacter || characters[0] || null;

    if (
      resolvedCharacter?.identityPrompt &&
      sessionItem.protagonistPrompt !== resolvedCharacter.identityPrompt
    ) {
      const updatedSession = {
        ...sessionItem,
        protagonistPrompt: resolvedCharacter.identityPrompt,
        protagonistName:
          resolvedCharacter.name || sessionItem.protagonistName,
        protagonistId: resolvedProtagonistId || resolvedCharacter.id || "",
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedSession,
        })
      );
      sessionItem.protagonistPrompt = updatedSession.protagonistPrompt;
      sessionItem.protagonistName = updatedSession.protagonistName;
    }

    const recentMessages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 6,
      scanForward: false,
    });
    const orderedRecent = recentMessages.slice().reverse();
    const lastAssistant = recentMessages.find(
      (message) => message.role === "assistant"
    );
    const contextLine = lastAssistant?.content
      ? normalizePromptFragment(lastAssistant.content)
      : "";
    const summaryLine = sessionItem.summary
      ? normalizePromptFragment(sessionItem.summary)
      : "";
    const recentTranscript = orderedRecent
      .map((message) => {
        const label = message.role === "user" ? "Player" : "Narrator";
        return `${label}: ${normalizePromptFragment(message.content || "")}`;
      })
      .filter(Boolean)
      .join(" ");
    const isOpeningScene = isOpeningSceneItem(sceneItem);
    const openingSceneContextLimits = isOpeningScene
      ? {
          maxEnvironmentFragments:
            STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
          maxActionFragments: STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS,
        }
      : {};
    const compactSceneForPrompt = await aiCraftSceneContext({
      scenePrompt: sceneItem.prompt || "",
      sceneEnvironment: sceneItem.sceneEnvironment || "",
      sceneAction: sceneItem.sceneAction || "",
      contextText: contextLine || recentTranscript,
      storyState: sessionItem.storyState || {},
      lorebook: sessionItem.lorebook || {},
      ...openingSceneContextLimits,
    });
    const sceneContextForPrompt = isOpeningScene
      ? compactScenePayload({
          scenePrompt: compactSceneForPrompt.scenePrompt || sceneItem.prompt || "",
          sceneEnvironment:
            compactSceneForPrompt.sceneEnvironment || sceneItem.sceneEnvironment || "",
          sceneAction: compactSceneForPrompt.sceneAction || sceneItem.sceneAction || "",
          maxEnvironment: STORY_OPENING_SCENE_MAX_ENVIRONMENT_FRAGMENTS,
          maxAction: STORY_OPENING_SCENE_MAX_ACTION_FRAGMENTS,
        })
      : compactSceneForPrompt;
    const cleanScenePrompt =
      sceneContextForPrompt.scenePrompt || sceneItem.prompt || "";

    const protagonistLine = sessionItem.protagonistPrompt?.includes(
      sessionItem.protagonistName
    )
      ? sessionItem.protagonistPrompt
      : `${sessionItem.protagonistName}, ${sessionItem.protagonistPrompt}`;

    const identityBlock =
      resolvedCharacter?.identityPrompt ||
      sessionItem.protagonistPrompt ||
      protagonistLine;

    const draftedPrompts = await aiCraftIllustrationPrompts({
      character: {
        name: resolvedCharacter?.name || sessionItem.protagonistName || "",
        identityPrompt: identityBlock,
        signatureTraits: resolvedCharacter?.signatureTraits || "",
        styleReference:
          resolvedCharacter?.styleReference || sessionItem.stylePrompt || "",
        viewDistance: resolvedCharacter?.viewDistance || "",
        eyeDetails: resolvedCharacter?.eyeDetails || "",
        pose: resolvedCharacter?.pose || "",
      },
      scenePrompt: cleanScenePrompt,
      sceneEnvironment:
        sceneContextForPrompt.sceneEnvironment || sceneItem.sceneEnvironment || "",
      sceneAction: sceneContextForPrompt.sceneAction || sceneItem.sceneAction || "",
      summary: summaryLine,
      latest: contextLine,
      recent: recentTranscript,
      contextMode,
    });
    const positivePrompt = draftedPrompts?.positivePrompt || "";
    const negativePrompt = draftedPrompts?.negativePrompt || "";
    if (!positivePrompt || !negativePrompt) {
      return res.status(500).json({
        message: "Failed to generate prompts from Haiku.",
      });
    }
    const trimmedPositivePrompt = clampPromptTokens(positivePrompt);
    const trimmedNegativePrompt = clampPromptTokens(negativePrompt);
    const promptWasTrimmed = trimmedPositivePrompt.trim() !== positivePrompt.trim();
    const negativeWasTrimmed =
      trimmedNegativePrompt.trim() !== negativePrompt.trim();

    const modelConfig = replicateModelConfig[requestedModelKey];
    if (!modelConfig?.modelId) {
      return res.status(500).json({
        message: `Replicate modelId is not configured for ${requestedModelKey}`,
      });
    }
    const sizeAllowed = modelConfig.sizes?.some(
      (size) => size.width === 1024 && size.height === 1024
    );
    if (!sizeAllowed) {
      return res.status(500).json({
        message: `${requestedModelKey} does not support 1024x1024 for story illustrations`,
      });
    }
    const defaultScheduler = modelConfig.schedulers?.[0];
    const [seed] = buildSeedList(1);
    const input = modelConfig.buildInput({
      prompt: trimmedPositivePrompt,
      negativePrompt: trimmedNegativePrompt,
      width: 1024,
      height: 1024,
      numOutputs: 1,
      seed,
      scheduler: defaultScheduler,
    });
    const output = await runReplicateWithRetry(modelConfig.modelId, input, 3);
    const outputItems = Array.isArray(output) ? output : [output];
    const imageUrl = outputItems.map(getReplicateOutputUrl).find(Boolean);
    if (!imageUrl) {
      return res.status(500).json({ message: "No image returned from Replicate" });
    }

    const { buffer, contentType } = await fetchImageBuffer(imageUrl);
    const imageKey =
      sceneItem.imageKey ||
      `${buildUserPrefix(userId)}stories/${sessionId}/scenes/${sceneId}.png`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        Body: buffer,
        ContentType: contentType || "image/png",
      })
    );

    const updatedScene = {
      ...sceneItem,
      prompt: sceneContextForPrompt.scenePrompt || sceneItem.prompt,
      sceneEnvironment:
        sceneContextForPrompt.sceneEnvironment || sceneItem.sceneEnvironment,
      sceneAction: sceneContextForPrompt.sceneAction || sceneItem.sceneAction,
      imageKey,
      status: "completed",
      promptPositive: trimmedPositivePrompt,
      promptNegative: trimmedNegativePrompt,
      videoKey: "",
      videoStatus: "",
      videoPredictionId: "",
      videoPrompt: "",
      videoUpdatedAt: "",
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: imageKey,
      }),
      { expiresIn: 900 }
    );
    const musicUrl = await signSceneMusicUrl(bucket, updatedScene);

    res.json({
      sceneId,
      imageKey,
      imageUrl: signedUrl,
      ...buildSceneMusicPayload({ sceneItem: updatedScene, musicUrl }),
      scene: {
        sceneId: updatedScene.sceneId,
        title: updatedScene.title,
        description: updatedScene.description,
        prompt: updatedScene.prompt,
        sceneEnvironment: updatedScene.sceneEnvironment,
        sceneAction: updatedScene.sceneAction,
        status: updatedScene.status,
        videoKey: updatedScene.videoKey || "",
        videoUrl: "",
        videoStatus: updatedScene.videoStatus || "",
        videoPredictionId: updatedScene.videoPredictionId || "",
        videoPrompt: updatedScene.videoPrompt || "",
        ...buildSceneMusicPayload({ sceneItem: updatedScene, musicUrl }),
        createdAt: updatedScene.createdAt,
      },
      ...(debug
        ? {
            prompt: {
              positive: trimmedPositivePrompt,
              negative: trimmedNegativePrompt,
            },
            identity: identityBlock,
            context: {
              mode: contextMode,
              summary: summaryLine,
              latest: contextLine,
              recent: recentTranscript,
              scene: cleanScenePrompt,
              sceneEnvironment: updatedScene.sceneEnvironment || "",
              sceneAction: updatedScene.sceneAction || "",
            },
            promptPattern: [
              "character (1girl, solo + name + recognizable)",
              "shot range",
              "focus/action",
              "subject framing/facial fidelity",
              "environment/background",
              "visual/style",
            ],
            replicate: {
              modelKey: requestedModelKey,
              modelId: modelConfig.modelId,
              input,
              ...(promptWasTrimmed || negativeWasTrimmed
                ? {
                    notice: [
                      promptWasTrimmed
                        ? `Positive prompt trimmed to ${MAX_REPLICATE_PROMPT_TOKENS} tokens for Replicate.`
                        : null,
                      negativeWasTrimmed
                        ? `Negative prompt trimmed to ${MAX_REPLICATE_PROMPT_TOKENS} tokens for Replicate.`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  }
                : {}),
            },
          }
        : {}),
    });
  } catch (error) {
    console.error("Story illustration error:", {
      message: error?.message || String(error),
    });
    res.status(500).json({
      message: "Failed to generate illustration",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions/:id/scenes/:sceneId/animation", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const prompt =
    req.body?.prompt?.trim() || DEFAULT_STORY_ANIMATION_PROMPT;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }

  const videoModelConfig = replicateVideoConfig[STORY_ANIMATION_MODEL_KEY];
  if (!videoModelConfig?.modelId) {
    return res.status(500).json({
      message: `Replicate modelId is not configured for ${STORY_ANIMATION_MODEL_KEY}`,
    });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    if (!sceneItem.imageKey) {
      return res.status(400).json({
        message: "Scene illustration is required before animation",
      });
    }

    const sourceImage = await fetchS3ImageBuffer(bucket, sceneItem.imageKey);
    const predictionRequest = buildReplicatePredictionRequest({
      modelId: videoModelConfig.modelId,
      input: videoModelConfig.buildInput({
        imageUrl: buildDataUrl(sourceImage),
        prompt,
      }),
    });
    const prediction = await replicateClient.predictions.create(
      predictionRequest,
      {
        headers: {
          Prefer: "wait=60",
          "Cancel-After": "15m",
        },
      }
    );
    if (!prediction) {
      return res.status(500).json({
        message: "No prediction returned from Replicate",
      });
    }

    if (prediction.status === "succeeded") {
      const { videoKey, videoUrl } = await persistStorySceneVideo({
        bucket,
        userId,
        sessionId,
        sceneId,
        sceneItem,
        prediction,
        prompt,
      });
      return res.json({
        sceneId,
        modelId: videoModelConfig.modelId,
        predictionId: prediction.id,
        status: "succeeded",
        prompt,
        videoKey,
        videoUrl,
      });
    }

    const updatedScene = {
      ...sceneItem,
      videoKey: "",
      videoStatus: prediction.status || "starting",
      videoPredictionId: prediction.id || "",
      videoPrompt: prompt,
      videoUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );

    return res.json({
      sceneId,
      modelId: videoModelConfig.modelId,
      predictionId: prediction.id,
      status: prediction.status || "starting",
      prompt,
    });
  } catch (error) {
    console.error("Story animation start error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to start scene animation",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/sessions/:id/scenes/:sceneId/animation", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;
  const predictionId = req.query?.predictionId;
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    const resolvedPredictionId = predictionId || sceneItem.videoPredictionId;
    if (!resolvedPredictionId) {
      const existingVideoUrl = await signSceneVideoUrl(bucket, sceneItem);
      return res.json({
        sceneId,
        status: sceneItem.videoStatus || "",
        predictionId: "",
        prompt: sceneItem.videoPrompt || "",
        videoKey: sceneItem.videoKey || "",
        videoUrl: existingVideoUrl,
      });
    }
    const prediction = await replicateClient.predictions.get(
      resolvedPredictionId
    );
    if (!prediction) {
      return res.status(500).json({
        message: "Prediction not found",
      });
    }

    if (prediction.status !== "succeeded") {
      const updatedScene = {
        ...sceneItem,
        videoStatus: prediction.status || sceneItem.videoStatus || "",
        videoPredictionId:
          resolvedPredictionId || sceneItem.videoPredictionId || "",
        videoUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedScene,
        })
      );
      return res.json({
        sceneId,
        status: prediction.status || "",
        predictionId: resolvedPredictionId,
        prompt: sceneItem.videoPrompt || "",
        videoKey: sceneItem.videoKey || "",
        videoUrl: "",
      });
    }

    const { videoKey, videoUrl } = await persistStorySceneVideo({
      bucket,
      userId,
      sessionId,
      sceneId,
      sceneItem,
      prediction,
      prompt: sceneItem.videoPrompt || DEFAULT_STORY_ANIMATION_PROMPT,
    });

    return res.json({
      sceneId,
      status: "succeeded",
      predictionId: resolvedPredictionId,
      prompt: sceneItem.videoPrompt || DEFAULT_STORY_ANIMATION_PROMPT,
      videoKey,
      videoUrl,
    });
  } catch (error) {
    console.error("Story animation status error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to get scene animation status",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions/:id/scenes/:sceneId/music", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;
  const manualPrompt = req.body?.prompt?.trim() || "";

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }

    const recentMessages = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: storyMessagePrefix(sessionId),
      limit: 6,
      scanForward: false,
    });
    const latestAssistant = recentMessages.find(
      (message) => message.role === "assistant"
    );

    const direction = await aiCraftMusicDirection({
      scene: {
        title: sceneItem.title || "",
        description: sceneItem.description || "",
        prompt: sceneItem.prompt || "",
        sceneEnvironment: sceneItem.sceneEnvironment || "",
        sceneAction: sceneItem.sceneAction || "",
      },
      summary: sessionItem.summary || "",
      latest: latestAssistant?.content || "",
      overridePrompt: manualPrompt,
    });
    const prompt = buildLoopFriendlyMusicPrompt(
      direction?.prompt ||
        manualPrompt ||
        sceneItem.musicPrompt ||
        DEFAULT_STORY_MUSIC_PROMPT
    );
    const musicInput = {
      ...STORY_MUSIC_DEFAULT_INPUT,
      prompt,
    };

    const predictionRequest = buildReplicatePredictionRequest({
      modelId: STORY_MUSIC_MODEL_ID,
      input: musicInput,
    });
    const prediction = await replicateClient.predictions.create(
      predictionRequest,
      {
        headers: {
          Prefer: "wait=60",
          "Cancel-After": "10m",
        },
      }
    );
    if (!prediction) {
      return res.status(500).json({
        message: "No prediction returned from Replicate",
      });
    }

    if (prediction.status === "succeeded") {
      const { updatedScene, musicKey, musicUrl, trackItem } = await persistStorySceneMusic({
        bucket,
        userId,
        sessionId,
        sceneId,
        sceneItem,
        prediction,
        prompt,
        modelId: STORY_MUSIC_MODEL_ID,
        direction,
      });
      return res.json({
        sceneId,
        modelId: STORY_MUSIC_MODEL_ID,
        predictionId: prediction.id,
        status: "succeeded",
        prompt,
        direction,
        ...buildSceneMusicPayload({ sceneItem: updatedScene, musicUrl }),
        musicKey,
        track: trackItem ? await mapMusicTrackResponse(bucket, trackItem) : null,
      });
    }

    const updatedScene = {
      ...sceneItem,
      musicStatus: prediction.status || "starting",
      musicPredictionId: prediction.id || "",
      musicPrompt: prompt,
      musicModelId: STORY_MUSIC_MODEL_ID,
      musicMood: direction?.mood || sceneItem.musicMood || "",
      musicEnergy: direction?.energy || sceneItem.musicEnergy || "",
      musicTempoBpm: Number.isFinite(Number(direction?.tempoBpm))
        ? Math.round(Number(direction.tempoBpm))
        : sceneItem.musicTempoBpm || null,
      musicTags: Array.isArray(direction?.tags)
        ? direction.tags
        : Array.isArray(sceneItem.musicTags)
          ? sceneItem.musicTags
          : [],
      musicUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );
    const musicUrl = await signSceneMusicUrl(bucket, updatedScene);

    return res.json({
      sceneId,
      modelId: STORY_MUSIC_MODEL_ID,
      predictionId: prediction.id,
      status: prediction.status || "starting",
      prompt,
      direction,
      ...buildSceneMusicPayload({ sceneItem: updatedScene, musicUrl }),
    });
  } catch (error) {
    console.error("Story music start error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to start scene music generation",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/sessions/:id/scenes/:sceneId/music", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;
  const predictionId = req.query?.predictionId;
  const bucket = process.env.MEDIA_BUCKET;
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!apiToken) {
    return res
      .status(500)
      .json({ message: "REPLICATE_API_TOKEN must be set" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    const resolvedPredictionId = predictionId || sceneItem.musicPredictionId;
    if (!resolvedPredictionId) {
      const musicUrl = await signSceneMusicUrl(bucket, sceneItem);
      return res.json({
        sceneId,
        status: sceneItem.musicStatus || "",
        predictionId: "",
        prompt: sceneItem.musicPrompt || "",
        modelId: sceneItem.musicModelId || STORY_MUSIC_MODEL_ID,
        ...buildSceneMusicPayload({ sceneItem, musicUrl }),
      });
    }

    const prediction = await replicateClient.predictions.get(resolvedPredictionId);
    if (!prediction) {
      return res.status(500).json({
        message: "Prediction not found",
      });
    }

    if (prediction.status !== "succeeded") {
      const updatedScene = {
        ...sceneItem,
        musicStatus: prediction.status || sceneItem.musicStatus || "",
        musicPredictionId:
          resolvedPredictionId || sceneItem.musicPredictionId || "",
        musicUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedScene,
        })
      );
      const musicUrl = await signSceneMusicUrl(bucket, updatedScene);
      return res.json({
        sceneId,
        status: prediction.status || "",
        predictionId: resolvedPredictionId,
        prompt: sceneItem.musicPrompt || "",
        modelId: sceneItem.musicModelId || STORY_MUSIC_MODEL_ID,
        ...buildSceneMusicPayload({ sceneItem: updatedScene, musicUrl }),
      });
    }

    const direction = {
      mood: sceneItem.musicMood || "",
      energy: sceneItem.musicEnergy || "",
      tempoBpm: sceneItem.musicTempoBpm || null,
      tags: Array.isArray(sceneItem.musicTags) ? sceneItem.musicTags : [],
      source: "stored",
    };
    const { updatedScene, musicKey, musicUrl, trackItem } = await persistStorySceneMusic({
      bucket,
      userId,
      sessionId,
      sceneId,
      sceneItem,
      prediction,
      prompt: sceneItem.musicPrompt || DEFAULT_STORY_MUSIC_PROMPT,
      modelId: sceneItem.musicModelId || STORY_MUSIC_MODEL_ID,
      direction,
    });

    return res.json({
      sceneId,
      status: "succeeded",
      predictionId: resolvedPredictionId,
      prompt: updatedScene.musicPrompt || DEFAULT_STORY_MUSIC_PROMPT,
      modelId: updatedScene.musicModelId || STORY_MUSIC_MODEL_ID,
      ...buildSceneMusicPayload({ sceneItem: updatedScene, musicUrl }),
      musicKey,
      track: trackItem ? await mapMusicTrackResponse(bucket, trackItem) : null,
    });
  } catch (error) {
    console.error("Story music status error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to get scene music status",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions/:id/scenes/:sceneId/music/favorite", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;
  const bucket = process.env.MEDIA_BUCKET;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    if (!sceneItem.musicKey) {
      return res.status(400).json({
        message: "Generate scene music before saving to library",
      });
    }

    const existingTrackId = sceneItem.musicLibraryTrackId || "";
    if (existingTrackId) {
      const existingTrack = await getItem({
        pk: buildMediaPk(userId),
        sk: buildStoryMusicLibrarySk(existingTrackId),
      });
      if (existingTrack?.key) {
        const normalizedExistingTrack = normalizeTrackForSearch({
          ...existingTrack,
          source: existingTrack.source || "generated",
        });
        if (
          normalizedExistingTrack.searchText !== existingTrack.searchText ||
          normalizedExistingTrack.source !== existingTrack.source ||
          normalizedExistingTrack.description !== (existingTrack.description || "")
        ) {
          await dynamoClient.send(
            new PutCommand({
              TableName: mediaTable,
              Item: {
                ...existingTrack,
                ...normalizedExistingTrack,
                updatedAt: new Date().toISOString(),
              },
            })
          );
        }
        return res.json({
          track: await mapMusicTrackResponse(bucket, normalizedExistingTrack),
          sceneId,
          musicLibraryTrackId: existingTrack.trackId || existingTrackId,
        });
      }
    }

    const now = new Date().toISOString();
    const trackId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sourceExtension = inferAudioExtension({
      url: sceneItem.musicKey,
      fallback: "mp3",
    });
    const libraryKey = buildStoryMusicLibraryKey(userId, trackId, sourceExtension);

    await copyS3Object({
      bucket,
      sourceKey: sceneItem.musicKey,
      destinationKey: libraryKey,
    });

    const customTitle = normalizePromptFragment(req.body?.title || "");
    const trackItem = {
      pk: buildMediaPk(userId),
      sk: buildStoryMusicLibrarySk(trackId),
      type: "STORY_MUSIC_LIBRARY_TRACK",
      trackId,
      key: libraryKey,
      title:
        customTitle ||
        normalizePromptFragment(
          `${sceneItem.title || "Scene"} soundtrack`
        ) ||
        "Saved soundtrack",
      description: normalizePromptFragment(sceneItem.description || ""),
      prompt: sceneItem.musicPrompt || "",
      mood: sceneItem.musicMood || "",
      energy: sceneItem.musicEnergy || "",
      tempoBpm: sceneItem.musicTempoBpm || null,
      tags: Array.isArray(sceneItem.musicTags) ? sceneItem.musicTags : [],
      modelId: sceneItem.musicModelId || STORY_MUSIC_MODEL_ID,
      source: "generated",
      sessionId,
      sceneId,
      sourceMusicKey: sceneItem.musicKey,
      searchText: buildTrackSearchText({
        title:
          customTitle ||
          normalizePromptFragment(
            `${sceneItem.title || "Scene"} soundtrack`
          ) ||
          "Saved soundtrack",
        description: normalizePromptFragment(sceneItem.description || ""),
        mood: sceneItem.musicMood || "",
        energy: sceneItem.musicEnergy || "",
        tags: Array.isArray(sceneItem.musicTags) ? sceneItem.musicTags : [],
        prompt: sceneItem.musicPrompt || "",
      }),
      createdAt: now,
      updatedAt: now,
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: trackItem,
      })
    );

    const updatedScene = {
      ...sceneItem,
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

    return res.json({
      track: await mapMusicTrackResponse(bucket, trackItem),
      sceneId,
      musicLibraryTrackId: trackId,
    });
  } catch (error) {
    console.error("Story music favorite error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to save soundtrack to library",
      error: error?.message || String(error),
    });
  }
});

app.get("/story/music-library", async (req, res) => {
  const userId = req.user?.sub;
  const bucket = process.env.MEDIA_BUCKET;
  const limit = parseLibraryLimit(req.query?.limit, 200);
  const query = normalizePromptFragment(req.query?.q || "").toLowerCase();
  const mood = normalizePromptFragment(req.query?.mood || "").toLowerCase();
  const energy = normalizePromptFragment(req.query?.energy || "").toLowerCase();
  const source = normalizePromptFragment(req.query?.source || "").toLowerCase();
  const tags = parseMusicTags(req.query?.tags);
  const tagsMode = String(req.query?.tagsMode || "any").toLowerCase() === "all"
    ? "all"
    : "any";

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const items = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: MUSIC_LIBRARY_SK_PREFIX,
      limit: 500,
      scanForward: false,
    });
    const filters = {
      q: query,
      mood,
      energy,
      source,
      tags,
      tagsMode,
    };
    const filteredItems = items.filter((item) => matchesTrackFilter(item, filters));
    const slicedItems = filteredItems.slice(0, limit);
    const tracks = await Promise.all(
      slicedItems.map((item) =>
        mapMusicTrackResponse(bucket, normalizeTrackForSearch(item))
      )
    );
    return res.json({
      tracks,
      total: filteredItems.length,
      limit,
      filters: {
        q: query,
        mood,
        energy,
        source,
        tags,
        tagsMode,
      },
    });
  } catch (error) {
    console.error("Story music library list error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to load music library",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/music-library/upload-url", async (req, res) => {
  const userId = req.user?.sub;
  const bucket = process.env.MEDIA_BUCKET;
  const fileName = req.body?.fileName || "track";
  const contentType = req.body?.contentType || "audio/mpeg";

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!String(contentType || "").toLowerCase().startsWith("audio/")) {
    return res.status(400).json({
      message: "contentType must be an audio type",
    });
  }

  try {
    const extension = inferAudioExtension({
      contentType,
      url: fileName,
      fallback: "mp3",
    });
    const trackId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = buildStoryMusicLibraryKey(userId, trackId, extension);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    return res.json({
      bucket,
      key,
      url,
      trackId,
      contentType,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate music upload URL",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/music-library/upload", async (req, res) => {
  const userId = req.user?.sub;
  const bucket = process.env.MEDIA_BUCKET;
  const providedTrackId = String(req.body?.trackId || "").trim();
  const key = String(req.body?.key || "").trim();
  const title = normalizePromptFragment(req.body?.title || "");
  const description = normalizePromptFragment(req.body?.description || "");
  const mood = normalizePromptFragment(req.body?.mood || "").toLowerCase();
  const energyRaw = normalizePromptFragment(req.body?.energy || "").toLowerCase();
  const prompt = normalizePromptFragment(req.body?.prompt || "");
  const tags = parseMusicTags(req.body?.tags);
  const parsedTempo = Number(req.body?.tempoBpm);
  const tempoBpm =
    Number.isFinite(parsedTempo) && parsedTempo > 0
      ? Math.round(parsedTempo)
      : null;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!key) {
    return res.status(400).json({ message: "key is required" });
  }
  if (!title) {
    return res.status(400).json({ message: "title is required" });
  }
  try {
    ensureUserKey(key, userId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  if (!key.startsWith(`${buildUserPrefix(userId)}stories/music-library/`)) {
    return res.status(400).json({
      message: "key must be in the story music-library prefix",
    });
  }

  const extractedTrackId =
    key.split("/").pop()?.replace(/\.[^.]+$/, "") || "";
  const trackId = providedTrackId || extractedTrackId;
  if (!trackId) {
    return res.status(400).json({ message: "trackId is required" });
  }
  if (providedTrackId && extractedTrackId && providedTrackId !== extractedTrackId) {
    return res.status(400).json({
      message: "trackId does not match key",
    });
  }

  try {
    const existingItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStoryMusicLibrarySk(trackId),
    });
    const now = new Date().toISOString();
    const energy = ["low", "medium", "high"].includes(energyRaw)
      ? energyRaw
      : "";
    const trackItem = {
      ...(existingItem || {}),
      pk: buildMediaPk(userId),
      sk: buildStoryMusicLibrarySk(trackId),
      type: "STORY_MUSIC_LIBRARY_TRACK",
      trackId,
      key,
      title,
      description,
      prompt,
      mood,
      energy,
      tempoBpm,
      tags,
      modelId: existingItem?.modelId || "manual-upload",
      source: "upload",
      searchText: buildTrackSearchText({
        title,
        description,
        mood,
        energy,
        tags,
        prompt,
      }),
      createdAt: existingItem?.createdAt || now,
      updatedAt: now,
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: trackItem,
      })
    );

    return res.json({
      track: await mapMusicTrackResponse(bucket, trackItem),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to save uploaded music metadata",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions/:id/scenes/:sceneId/music/recommend", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }

    const trackItems = await queryBySkPrefix({
      pk: buildMediaPk(userId),
      skPrefix: MUSIC_LIBRARY_SK_PREFIX,
      limit: STORY_MUSIC_RECOMMENDATION_SCAN_LIMIT,
      scanForward: false,
    });
    const sceneProfile = buildSceneRecommendationProfile({
      sceneItem,
      sessionItem,
    });
    const rankedCandidates = rankRecommendedTracks({
      trackItems,
      sceneProfile,
    });
    const bestCandidate = rankedCandidates[0] || null;
    const recommendedTrackId = bestCandidate?.trackId || "";
    const recommendationScore =
      typeof bestCandidate?.score === "number" ? bestCandidate.score : null;
    const priorScore = Number(sceneItem.recommendationScore);
    const normalizedPriorScore = Number.isFinite(priorScore)
      ? clampRecommendationScore(priorScore)
      : null;
    const hasChanged =
      (sceneItem.recommendedTrackId || "") !== recommendedTrackId ||
      (sceneItem.recommendationMethod || "") !== STORY_MUSIC_RECOMMENDATION_METHOD ||
      normalizedPriorScore !== recommendationScore;
    const updatedScene = hasChanged
      ? {
          ...sceneItem,
          recommendedTrackId,
          recommendationMethod: STORY_MUSIC_RECOMMENDATION_METHOD,
          recommendationScore,
          updatedAt: new Date().toISOString(),
        }
      : {
          ...sceneItem,
          recommendedTrackId,
          recommendationMethod:
            sceneItem.recommendationMethod || STORY_MUSIC_RECOMMENDATION_METHOD,
          recommendationScore,
        };

    if (hasChanged) {
      await dynamoClient.send(
        new PutCommand({
          TableName: mediaTable,
          Item: updatedScene,
        })
      );
    }

    return res.json({
      sceneId,
      recommendedTrackId: updatedScene.recommendedTrackId || "",
      recommendationMethod: updatedScene.recommendationMethod || "",
      recommendationScore:
        typeof updatedScene.recommendationScore === "number"
          ? updatedScene.recommendationScore
          : null,
      candidates: rankedCandidates
        .slice(0, STORY_MUSIC_RECOMMENDATION_CANDIDATE_LIMIT)
        .map((candidate) => ({
          trackId: candidate.trackId,
          score: candidate.score,
          title: candidate.track.title || "Saved soundtrack",
          mood: candidate.track.mood || "",
          energy: candidate.track.energy || "",
          tags: Array.isArray(candidate.track.tags) ? candidate.track.tags : [],
        })),
    });
  } catch (error) {
    console.error("Story music recommendation error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to recommend soundtrack from library",
      error: error?.message || String(error),
    });
  }
});

app.post("/story/sessions/:id/scenes/:sceneId/music/select", async (req, res) => {
  const userId = req.user?.sub;
  const sessionId = req.params.id;
  const sceneId = req.params.sceneId;
  const trackId = String(req.body?.trackId || "").trim();
  const bucket = process.env.MEDIA_BUCKET;

  if (!mediaTable) {
    return res.status(500).json({ message: "MEDIA_TABLE is not set" });
  }
  if (!bucket) {
    return res.status(500).json({ message: "MEDIA_BUCKET is not set" });
  }
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!sessionId || !sceneId) {
    return res
      .status(400)
      .json({ message: "sessionId and sceneId are required" });
  }
  if (!trackId) {
    return res.status(400).json({ message: "trackId is required" });
  }

  try {
    const sessionItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySessionSk(sessionId),
    });
    if (!sessionItem) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sceneItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStorySceneSk(sessionId, sceneId),
    });
    if (!sceneItem) {
      return res.status(404).json({ message: "Scene not found" });
    }
    const trackItem = await getItem({
      pk: buildMediaPk(userId),
      sk: buildStoryMusicLibrarySk(trackId),
    });
    if (!trackItem?.key) {
      return res.status(404).json({ message: "Track not found" });
    }

    const updatedScene = {
      ...sceneItem,
      musicKey: trackItem.key,
      musicStatus: "succeeded",
      musicPredictionId: "",
      musicPrompt: trackItem.prompt || sceneItem.musicPrompt || "",
      musicModelId: trackItem.modelId || STORY_MUSIC_MODEL_ID,
      musicMood: trackItem.mood || "",
      musicEnergy: trackItem.energy || "",
      musicTempoBpm: trackItem.tempoBpm || null,
      musicTags: Array.isArray(trackItem.tags) ? trackItem.tags : [],
      musicLibraryTrackId: trackItem.trackId || trackId,
      musicUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: updatedScene,
      })
    );
    const musicUrl = await signSceneMusicUrl(bucket, updatedScene);

    return res.json({
      sceneId,
      track: await mapMusicTrackResponse(bucket, trackItem),
      ...buildSceneMusicPayload({ sceneItem: updatedScene, musicUrl }),
    });
  } catch (error) {
    console.error("Story music select error:", {
      message: error?.message || String(error),
    });
    return res.status(500).json({
      message: "Failed to apply library track to scene",
      error: error?.message || String(error),
    });
  }
});
};
