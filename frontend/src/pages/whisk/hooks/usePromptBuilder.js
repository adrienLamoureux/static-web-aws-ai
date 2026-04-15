import { useCallback, useEffect, useMemo, useState } from "react";
import { generatePromptHelper } from "../../../services/bedrock";
import { listStoryCharacters } from "../../../services/story";
import { listPromptHelperOptions } from "../../../services/promptHelper";
import {
  DEFAULT_PROMPT_HELPER_SELECTIONS,
  DEFAULT_CHARACTER_ID,
  DEFAULT_IMAGE_PROMPT,
} from "./image-studio-constants";

const resolveDefaultPreset = (presets = []) =>
  presets.find((preset) => preset.id === DEFAULT_CHARACTER_ID) ||
  presets.find((preset) => (preset.name || "").toLowerCase().includes("frieren")) ||
  null;

const buildSelectionsFromPreset = (preset) => {
  if (!preset) {
    return { ...DEFAULT_PROMPT_HELPER_SELECTIONS };
  }
  return {
    ...DEFAULT_PROMPT_HELPER_SELECTIONS,
    character: preset.name || "",
    background: preset.background || "",
    pose: preset.pose || "",
    signatureTraits: preset.signatureTraits || "",
    faceDetails: preset.faceDetails || "",
    eyeDetails: preset.eyeDetails || "",
    breastSize: preset.breastSize || "",
    ears: preset.ears || "",
    tails: preset.tails || "",
    horns: preset.horns || "",
    wings: preset.wings || "",
    hairStyles: preset.hairStyles || "",
    viewDistance: preset.viewDistance || "",
    accessories: preset.accessories || "",
    markings: preset.markings || "",
    outfitMaterials: preset.outfitMaterials || "",
    styleReference: preset.styleReference || "",
  };
};

export const usePromptBuilder = ({
  apiBaseUrl,
  imagePrompt,
  setImagePrompt,
  imageNegativePrompt,
  setImageNegativePrompt,
  onError,
}) => {
  const [promptHelperStatus, setPromptHelperStatus] = useState("idle");
  const [promptHelperSelections, setPromptHelperSelections] = useState(
    DEFAULT_PROMPT_HELPER_SELECTIONS
  );
  const [promptHelperOptions, setPromptHelperOptions] = useState({
    backgrounds: [],
    poses: [],
    traits: [],
    faceDetails: [],
    eyeDetails: [],
    breastSizes: [],
    ears: [],
    tails: [],
    horns: [],
    wings: [],
    hairStyles: [],
    viewDistance: [],
    accessories: [],
    markings: [],
    outfits: [],
    styles: [],
  });
  const [defaultNegativePrompt, setDefaultNegativePrompt] = useState("");
  const [characterPresets, setCharacterPresets] = useState([]);

  const defaultCharacterPreset = useMemo(
    () => resolveDefaultPreset(characterPresets),
    [characterPresets]
  );

  // Load character presets from API
  useEffect(() => {
    if (!apiBaseUrl) return;
    listStoryCharacters(apiBaseUrl)
      .then((data) => {
        setCharacterPresets(data.characters || []);
      })
      .catch((error) => {
        onError?.(error?.message || "Failed to load character presets.");
      });
  }, [apiBaseUrl, onError]);

  // Load prompt helper options from API
  useEffect(() => {
    if (!apiBaseUrl) return;
    listPromptHelperOptions(apiBaseUrl)
      .then((data) => {
        if (typeof data.negativePrompt === "string") {
          setDefaultNegativePrompt(data.negativePrompt);
          setImageNegativePrompt((prev) => (prev ? prev : data.negativePrompt));
        }
        setPromptHelperOptions((prev) => ({
          backgrounds: Array.isArray(data.backgrounds) ? data.backgrounds : prev.backgrounds,
          poses: Array.isArray(data.poses) ? data.poses : prev.poses,
          traits: Array.isArray(data.traits) ? data.traits : prev.traits,
          faceDetails: Array.isArray(data.faceDetails) ? data.faceDetails : prev.faceDetails,
          eyeDetails: Array.isArray(data.eyeDetails) ? data.eyeDetails : prev.eyeDetails,
          breastSizes: Array.isArray(data.breastSizes) ? data.breastSizes : prev.breastSizes,
          ears: Array.isArray(data.ears) ? data.ears : prev.ears,
          tails: Array.isArray(data.tails) ? data.tails : prev.tails,
          horns: Array.isArray(data.horns) ? data.horns : prev.horns,
          wings: Array.isArray(data.wings) ? data.wings : prev.wings,
          hairStyles: Array.isArray(data.hairStyles) ? data.hairStyles : prev.hairStyles,
          viewDistance: Array.isArray(data.viewDistance) ? data.viewDistance : prev.viewDistance,
          accessories: Array.isArray(data.accessories) ? data.accessories : prev.accessories,
          markings: Array.isArray(data.markings) ? data.markings : prev.markings,
          outfits: Array.isArray(data.outfits) ? data.outfits : prev.outfits,
          styles: Array.isArray(data.styles) ? data.styles : prev.styles,
        }));
      })
      .catch((error) => {
        onError?.(error?.message || "Failed to load prompt helper options.");
      });
  }, [apiBaseUrl, onError, setImageNegativePrompt]);

  const characterPresetMap = useMemo(() => {
    const entries = (characterPresets || []).map((preset) => [
      (preset.name || "").toLowerCase(),
      preset,
    ]);
    return new Map(entries);
  }, [characterPresets]);

  const buildPromptFromSelectionsWithSelections = useCallback(
    (selections) => {
      const parts = [];
      const pushTrimmed = (value) => {
        const trimmed = value?.trim();
        if (trimmed) {
          parts.push(trimmed);
        }
      };
      pushTrimmed(selections.viewDistance);
      pushTrimmed(selections.background);
      const hasCharacter = Boolean(selections.character?.trim());
      if (hasCharacter) {
        parts.push("1girl, solo");
        pushTrimmed(selections.outfitMaterials);
        const characterValue = selections.character.trim();
        const preset = characterPresetMap.get(characterValue.toLowerCase());
        if (preset?.name) {
          const weight = typeof preset.weight === "number" ? preset.weight : 1.4;
          parts.push(`(${preset.name}:${weight})`);
        } else {
          parts.push(characterValue);
        }
      }
      pushTrimmed(selections.signatureTraits);
      pushTrimmed(selections.eyeDetails);
      pushTrimmed(selections.pose);
      pushTrimmed(selections.faceDetails);
      pushTrimmed(selections.breastSize);
      pushTrimmed(selections.ears);
      pushTrimmed(selections.tails);
      pushTrimmed(selections.horns);
      pushTrimmed(selections.wings);
      pushTrimmed(selections.hairStyles);
      pushTrimmed(selections.accessories);
      pushTrimmed(selections.markings);
      if (!hasCharacter) {
        pushTrimmed(selections.outfitMaterials);
      }
      pushTrimmed(selections.styleReference);
      return parts.filter(Boolean).join(", ");
    },
    [characterPresetMap]
  );

  // Seed prompt from default preset once loaded
  useEffect(() => {
    if (!defaultCharacterPreset) return;
    setPromptHelperSelections((prev) => {
      const hasAny = Object.values(prev).some((value) => value);
      if (hasAny) return prev;
      return buildSelectionsFromPreset(defaultCharacterPreset);
    });
    if (!imageNegativePrompt && defaultNegativePrompt) {
      setImageNegativePrompt(defaultNegativePrompt);
    }
    if (!imagePrompt || imagePrompt === DEFAULT_IMAGE_PROMPT) {
      const defaultPrompt = buildPromptFromSelectionsWithSelections(
        buildSelectionsFromPreset(defaultCharacterPreset)
      );
      if (defaultPrompt) {
        setImagePrompt(defaultPrompt);
      }
    }
  }, [
    buildPromptFromSelectionsWithSelections,
    defaultCharacterPreset,
    imageNegativePrompt,
    imagePrompt,
    defaultNegativePrompt,
    setImageNegativePrompt,
    setImagePrompt,
  ]);

  const isPromptHelperLoading = promptHelperStatus === "loading";

  const hasPromptHelperSelection = Boolean(
    promptHelperSelections.background ||
    promptHelperSelections.character ||
    promptHelperSelections.pose ||
    promptHelperSelections.signatureTraits ||
    promptHelperSelections.faceDetails ||
    promptHelperSelections.eyeDetails ||
    promptHelperSelections.breastSize ||
    promptHelperSelections.ears ||
    promptHelperSelections.tails ||
    promptHelperSelections.horns ||
    promptHelperSelections.wings ||
    promptHelperSelections.hairStyles ||
    promptHelperSelections.viewDistance ||
    promptHelperSelections.accessories ||
    promptHelperSelections.markings ||
    promptHelperSelections.outfitMaterials ||
    promptHelperSelections.styleReference
  );

  const buildPromptFromSelections = () =>
    buildPromptFromSelectionsWithSelections(promptHelperSelections);

  const handlePromptHelperCreate = () => {
    if (!hasPromptHelperSelection) {
      onError?.("Select at least one prompt helper field.");
      return;
    }
    const prompt = buildPromptFromSelections();
    if (!prompt) {
      onError?.("Prompt helper fields are empty.");
      return;
    }
    setImageNegativePrompt(defaultNegativePrompt);
    setPromptHelperStatus("success");
    setImagePrompt(prompt);
  };

  const handlePromptHelperGenerateAi = async () => {
    if (!apiBaseUrl) {
      onError?.("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    if (!hasPromptHelperSelection) {
      onError?.("Select at least one prompt helper field.");
      return;
    }
    onError?.("");
    setPromptHelperStatus("loading");

    try {
      const data = await generatePromptHelper(apiBaseUrl, {
        background: promptHelperSelections.background.trim() || undefined,
        character: promptHelperSelections.character.trim() || undefined,
        pose: promptHelperSelections.pose.trim() || undefined,
        signatureTraits: promptHelperSelections.signatureTraits.trim() || undefined,
        faceDetails: promptHelperSelections.faceDetails.trim() || undefined,
        eyeDetails: promptHelperSelections.eyeDetails.trim() || undefined,
        breastSize: promptHelperSelections.breastSize.trim() || undefined,
        ears: promptHelperSelections.ears.trim() || undefined,
        tails: promptHelperSelections.tails.trim() || undefined,
        horns: promptHelperSelections.horns.trim() || undefined,
        wings: promptHelperSelections.wings.trim() || undefined,
        hairStyles: promptHelperSelections.hairStyles.trim() || undefined,
        viewDistance: promptHelperSelections.viewDistance.trim() || undefined,
        accessories: promptHelperSelections.accessories.trim() || undefined,
        markings: promptHelperSelections.markings.trim() || undefined,
        outfitMaterials: promptHelperSelections.outfitMaterials.trim() || undefined,
        styleReference: promptHelperSelections.styleReference.trim() || undefined,
      });
      if (data?.prompt) {
        setImagePrompt(data.prompt);
      }
      setImageNegativePrompt(defaultNegativePrompt);
      setPromptHelperStatus("success");
    } catch (error) {
      setPromptHelperStatus("error");
      onError?.(error?.message || "Prompt helper failed.");
    }
  };

  const handlePromptSelectionChange = (field, value) => {
    setPromptHelperSelections((prev) => ({
      ...prev,
      [field]: value,
    }));
    setPromptHelperStatus("idle");
  };

  const promptCharacterOptions = useMemo(
    () =>
      characterPresets.length ? characterPresets.map((preset) => preset.name).filter(Boolean) : [],
    [characterPresets]
  );

  const handleCharacterSelection = (value) => {
    const preset = characterPresetMap.get(value.trim().toLowerCase());
    if (preset) {
      setPromptHelperSelections((prev) => ({
        ...prev,
        character: preset.name || value,
        pose: preset.pose || "",
        signatureTraits: preset.signatureTraits || "",
        faceDetails: preset.faceDetails || "",
        eyeDetails: preset.eyeDetails || "",
        breastSize: preset.breastSize || "",
        ears: preset.ears || "",
        tails: preset.tails || "",
        horns: preset.horns || "",
        wings: preset.wings || "",
        hairStyles: preset.hairStyles || "",
        viewDistance: preset.viewDistance || "",
        accessories: preset.accessories || "",
        markings: preset.markings || "",
        outfitMaterials: preset.outfitMaterials || "",
        styleReference: preset.styleReference || "",
      }));
      setImageNegativePrompt(defaultNegativePrompt);
    } else {
      setPromptHelperSelections((prev) => ({
        ...prev,
        character: value,
      }));
    }
    setPromptHelperStatus("idle");
  };

  const resetPromptBuilder = () => {
    setPromptHelperStatus("idle");
    setPromptHelperSelections(buildSelectionsFromPreset(defaultCharacterPreset));
  };

  const promptHelperProps = {
    selections: promptHelperSelections,
    onSelectionChange: handlePromptSelectionChange,
    onCharacterChange: handleCharacterSelection,
    onCreate: handlePromptHelperCreate,
    onAiGenerate: handlePromptHelperGenerateAi,
    isLoading: isPromptHelperLoading,
    status: promptHelperStatus,
    hasSelection: hasPromptHelperSelection,
    promptBackgrounds: promptHelperOptions.backgrounds,
    promptCharacters: promptCharacterOptions,
    promptPoses: promptHelperOptions.poses,
    promptTraits: promptHelperOptions.traits,
    promptFaceDetails: promptHelperOptions.faceDetails,
    promptEyeDetails: promptHelperOptions.eyeDetails,
    promptBreastSizes: promptHelperOptions.breastSizes,
    promptEars: promptHelperOptions.ears,
    promptTails: promptHelperOptions.tails,
    promptHorns: promptHelperOptions.horns,
    promptWings: promptHelperOptions.wings,
    promptHairStyles: promptHelperOptions.hairStyles,
    promptViewDistance: promptHelperOptions.viewDistance,
    promptAccessories: promptHelperOptions.accessories,
    promptMarkings: promptHelperOptions.markings,
    promptOutfits: promptHelperOptions.outfits,
    promptStyles: promptHelperOptions.styles,
  };

  return {
    promptHelperProps,
    defaultNegativePrompt,
    resetPromptBuilder,
  };
};
