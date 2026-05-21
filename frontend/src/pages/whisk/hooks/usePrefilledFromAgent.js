import { useEffect, useMemo, useRef } from "react";

/**
 * Apply Tweak-in-Atelier URL params (prompt + size) to the Whisk image
 * generator exactly once. Returns a `tweakNotice` string for the inline
 * banner, or "" if no agent prefill is present.
 *
 * The seed isn't directly settable via the existing Whisk form — it's still
 * surfaced in the notice so power users see what the agent picked.
 */
export function usePrefilledFromAgent({
  prefilledPrompt,
  prefilledStyle,
  prefilledAspect,
  prefilledSeed,
  prefilledWidth,
  prefilledHeight,
  onImagePromptChange,
  onImageSizeChange,
  imageSizeOptions,
}) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    if (!prefilledPrompt && !prefilledWidth) return;
    if (prefilledPrompt && onImagePromptChange) onImagePromptChange(prefilledPrompt);
    if (prefilledWidth && prefilledHeight && onImageSizeChange && imageSizeOptions?.length) {
      const target = `${prefilledWidth}x${prefilledHeight}`;
      const match = imageSizeOptions.find((o) => (o?.value || o?.id || o) === target);
      if (match) onImageSizeChange(match.value || match.id || match);
    }
    appliedRef.current = true;
  }, [
    prefilledPrompt,
    prefilledWidth,
    prefilledHeight,
    onImagePromptChange,
    onImageSizeChange,
    imageSizeOptions,
  ]);

  const tweakNotice = useMemo(() => {
    if (!prefilledPrompt) return "";
    if (!prefilledStyle && !prefilledAspect && !prefilledSeed) return "";
    return [
      "Tweaked from Agent:",
      prefilledStyle && `style=${prefilledStyle}`,
      prefilledAspect && `aspect=${prefilledAspect}`,
      prefilledSeed && `seed=${prefilledSeed}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [prefilledPrompt, prefilledStyle, prefilledAspect, prefilledSeed]);

  return { tweakNotice };
}
