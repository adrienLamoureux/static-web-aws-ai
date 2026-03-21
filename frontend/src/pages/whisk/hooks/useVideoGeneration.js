import { useEffect, useMemo, useRef, useState } from "react";
import {
  generateNovaReelVideo,
  getNovaReelJobStatus,
} from "../../../services/bedrock";
import {
  generateReplicateVideo,
  getReplicateVideoStatus,
} from "../../../services/replicate";

const buildUnsupportedLoraMessage = ({
  modelKey = "",
  modality = "video",
  supportedModels = [],
}) => {
  const normalizedModelKey = String(modelKey || "").trim() || "selected model";
  const options = Array.isArray(supportedModels)
    ? supportedModels.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const supportedText = options.length
    ? `Compatible models: ${options.join(", ")}.`
    : `No ${modality} models are currently configured with LoRA support.`;
  return `The selected LoRA profile cannot be used with "${normalizedModelKey}". ${supportedText}`;
};

const FALLBACK_REPLICATE_VIDEO_MODELS = Object.freeze([
  {
    key: "wan-2.2-i2v-fast",
    name: "wan-2.2-i2v-fast",
    description: "Image-to-video fast",
  },
  {
    key: "veo-3.1-fast",
    name: "veo-3.1-fast",
    description: "Image-to-video with audio",
  },
  {
    key: "kling-v2.6",
    name: "kling-v2.6",
    description: "Text-to-video",
  },
  {
    key: "seedance-1.5-pro",
    name: "seedance-1.5-pro",
    description: "Text-to-video with audio",
  },
]);

export const useVideoGeneration = ({
  apiBaseUrl,
  selectedImageKey,
  selectedSourceImageKey,
  selectedImageUrl,
  selectedLoraProfileId = "",
  loraVideoSupportByModel = {},
  supportedVideoLoraModels = [],
  directorVideoModels = [],
  onError,
  onSubmitted,
  onCompleted,
}) => {
  const [videoProvider, setVideoProvider] = useState("replicate");
  const [videoModel, setVideoModel] = useState("wan-2.2-i2v-fast");
  const [videoGenerateAudio, setVideoGenerateAudio] = useState(true);
  const [prompt, setPrompt] = useState("A cinematic push-in on the scene.");
  const [generationStatus, setGenerationStatus] = useState("idle");
  const [invocationArn, setInvocationArn] = useState("");
  const [outputPrefix, setOutputPrefix] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [replicatePredictionId, setReplicatePredictionId] = useState("");
  const [replicateJobStatus, setReplicateJobStatus] = useState("");
  const [replicateInputKey, setReplicateInputKey] = useState("");
  const [bedrockInputKey, setBedrockInputKey] = useState("");
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  const isGenerating = generationStatus === "loading";
  const isVideoInProgress =
    isGenerating ||
    jobStatus === "InProgress" ||
    (videoProvider === "replicate" &&
      (replicateJobStatus === "starting" ||
        replicateJobStatus === "processing"));

  const videoProviderOptions = [
    {
      key: "bedrock",
      name: "Bedrock",
      description: "Nova Reel",
    },
    {
      key: "replicate",
      name: "Replicate",
      description: "WAN i2v fast",
    },
  ];

  const replicateModelOptionsFromDirector = useMemo(
    () =>
      (Array.isArray(directorVideoModels) ? directorVideoModels : [])
        .map((item) => {
          const key = String(item?.key || "").trim();
          if (!key) return null;
          return {
            key,
            name: key,
            description: String(item?.label || key).trim() || key,
          };
        })
        .filter(Boolean),
    [directorVideoModels]
  );

  const videoModelOptions = useMemo(() => {
    if (videoProvider === "replicate") {
      return replicateModelOptionsFromDirector.length
        ? replicateModelOptionsFromDirector
        : FALLBACK_REPLICATE_VIDEO_MODELS;
    }
    return [
      {
        key: "nova-reel",
        name: "amazon.nova-reel-v1:1",
        description: "Bedrock Nova Reel",
      },
    ];
  }, [videoProvider, replicateModelOptionsFromDirector]);

  const isReplicateAudioOption =
    videoProvider === "replicate" &&
    (videoModel === "veo-3.1-fast" ||
      videoModel === "kling-v2.6" ||
      videoModel === "seedance-1.5-pro");

  useEffect(() => {
    const allowedModels = videoModelOptions.map((option) => option.key);
    if (!allowedModels.includes(videoModel)) {
      setVideoModel(videoModelOptions[0]?.key || "nova-reel");
    }
  }, [videoModel, videoModelOptions]);

  const derivePrefixFromS3Uri = (s3Uri = "") => {
    if (!s3Uri.startsWith("s3://")) return "";
    const parts = s3Uri.replace("s3://", "").split("/");
    if (parts.length < 2) return "";
    return parts.slice(1).join("/");
  };

  const handleGenerateVideo = async () => {
    if (!selectedImageKey && !selectedSourceImageKey) {
      onError?.("Select an image before generating a video.");
      return;
    }
    if (!apiBaseUrl) {
      onError?.("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (
      selectedLoraProfileId &&
      (videoProvider !== "replicate" || !Boolean(loraVideoSupportByModel[videoModel]))
    ) {
      onError?.(
        buildUnsupportedLoraMessage({
          modelKey: videoModel,
          modality: "video",
          supportedModels: supportedVideoLoraModels,
        })
      );
      return;
    }
    onError?.("");
    setGenerationStatus("loading");
    setInvocationArn("");
    setOutputPrefix("");
    setJobStatus("");
    setReplicatePredictionId("");
    setReplicateJobStatus("");
    setReplicateInputKey("");
    setBedrockInputKey("");

    try {
      if (videoProvider === "replicate") {
        if (
          videoModel === "veo-3.1-fast" ||
          videoModel === "kling-v2.6" ||
          videoModel === "seedance-1.5-pro"
        ) {
          const confirmed = window.confirm(
            "This Replicate model can be expensive to run. Do you want to continue?"
          );
          if (!confirmed) {
            setGenerationStatus("idle");
            return;
          }
        }
        if (!selectedImageUrl) {
          throw new Error("Selected image URL is missing.");
        }
        const resolvedInputKey =
          videoModel === "wan-2.2-i2v-fast" && selectedSourceImageKey
            ? selectedSourceImageKey
            : selectedImageKey || selectedSourceImageKey;
        const data = await generateReplicateVideo(apiBaseUrl, {
          model: videoModel,
          prompt: prompt?.trim() || undefined,
          inputKey: resolvedInputKey,
          imageUrl: selectedImageUrl,
          characterId: selectedLoraProfileId || undefined,
          ...(isReplicateAudioOption
            ? { generateAudio: videoGenerateAudio }
            : {}),
        });
        if (data?.predictionId && data?.status !== "succeeded") {
          setReplicatePredictionId(data.predictionId);
          setReplicateJobStatus(data.status || "starting");
          setReplicateInputKey(resolvedInputKey);
        } else {
          setGenerationStatus("success");
        }
        onSubmitted?.();
      } else {
        const resolvedInputKey = selectedImageKey || selectedSourceImageKey;
        const data = await generateNovaReelVideo(apiBaseUrl, {
          prompt: prompt?.trim() || undefined,
          inputKey: resolvedInputKey,
          model: videoModel,
        });
        setGenerationStatus("success");
        setInvocationArn(data?.response?.invocationArn || "");
        const resolvedPrefix =
          data?.outputPrefix || derivePrefixFromS3Uri(data?.outputS3Uri || "");
        setOutputPrefix(resolvedPrefix);
        setBedrockInputKey(resolvedInputKey);
        onSubmitted?.();
      }
    } catch (error) {
      setGenerationStatus("error");
      onError?.(error?.message || "Video generation failed.");
    }
  };

  useEffect(() => {
    if (!invocationArn || !apiBaseUrl) return undefined;
    let timeoutId;
    let isCancelled = false;

    const pollStatus = async () => {
      if (isCancelled) return;
      try {
        const data = await getNovaReelJobStatus(apiBaseUrl, {
          invocationArn,
          inputKey: bedrockInputKey || selectedImageKey || selectedSourceImageKey,
          outputPrefix,
        });
        const statusValue = data?.status || "";
        setJobStatus(statusValue);
        if (statusValue === "Completed") {
          onCompletedRef.current?.();
          return;
        }
        if (statusValue === "Failed") {
          return;
        }
      } catch (error) {
        console.error(error);
      }
      timeoutId = setTimeout(pollStatus, 5000);
    };

    pollStatus();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    apiBaseUrl,
    invocationArn,
    outputPrefix,
    bedrockInputKey,
    selectedImageKey,
    selectedSourceImageKey,
  ]);

  useEffect(() => {
    if (!replicatePredictionId || !apiBaseUrl) return undefined;
    let timeoutId;
    let isCancelled = false;

    const pollReplicateStatus = async () => {
      if (isCancelled) return;
      try {
        const data = await getReplicateVideoStatus(apiBaseUrl, {
          predictionId: replicatePredictionId,
          inputKey: replicateInputKey || selectedImageKey,
          characterId: selectedLoraProfileId || undefined,
        });
        const statusValue = data?.status || "";
        setReplicateJobStatus(statusValue);
        if (statusValue === "succeeded") {
          setGenerationStatus("success");
          onCompletedRef.current?.();
          return;
        }
        if (statusValue === "failed" || statusValue === "canceled") {
          setGenerationStatus("error");
          return;
        }
      } catch (error) {
        console.error(error);
      }
      timeoutId = setTimeout(pollReplicateStatus, 5000);
    };

    pollReplicateStatus();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    apiBaseUrl,
    replicatePredictionId,
    replicateInputKey,
    selectedImageKey,
    selectedLoraProfileId,
  ]);

  return {
    videoProvider,
    videoProviderOptions,
    videoModel,
    videoModelOptions,
    setVideoProvider,
    setVideoModel,
    videoGenerateAudio,
    setVideoGenerateAudio,
    isReplicateAudioOption,
    isGenerating,
    isVideoInProgress,
    prompt,
    setPrompt,
    handleGenerateVideo,
  };
};
