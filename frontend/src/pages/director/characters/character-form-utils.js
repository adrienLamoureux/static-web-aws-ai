export function emptyCharForm() {
  return {
    _id: null,
    name: "",
    defaultImageModel: "",
    defaultImagePrompt: "",
    defaultVideoModel: "",
    defaultVideoPrompt: "",
    signatureTraits: "",
    eyeDetails: "",
    hairDetails: "",
    outfitMaterials: "",
    accessories: "",
    styleReference: "",
  };
}

export function charToForm(char) {
  return {
    _id: char.id,
    name: char.name || "",
    defaultImageModel: char.defaultImageModel || "",
    defaultImagePrompt: char.defaultImagePrompt || "",
    defaultVideoModel: char.defaultVideoModel || "",
    defaultVideoPrompt: char.defaultVideoPrompt || "",
    signatureTraits: char.signatureTraits || "",
    eyeDetails: char.eyeDetails || "",
    hairDetails: char.hairDetails || "",
    outfitMaterials: char.outfitMaterials || "",
    accessories: char.accessories || "",
    styleReference: char.styleReference || "",
  };
}

export function buildPromptPreview(charForm) {
  const c = charForm || {};
  return [
    c.signatureTraits,
    c.eyeDetails,
    c.hairDetails,
    c.outfitMaterials,
    c.accessories,
    c.styleReference,
    c.defaultImagePrompt,
  ]
    .filter(Boolean)
    .join(", ");
}
