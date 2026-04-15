import { renderHook, act } from "@testing-library/react";
import { useImageGeneration } from "./useImageGeneration";

// Mock all service modules used by useImageGeneration
jest.mock("../../../services/bedrock", () => ({
  generateBedrockImage: jest.fn(),
}));
jest.mock("../../../services/replicate", () => ({
  generateReplicateImage: jest.fn(),
  getReplicateImageStatus: jest.fn(),
}));
jest.mock("../../../services/civitai", () => ({
  generateCivitaiImage: jest.fn(),
  getCivitaiImageStatus: jest.fn(),
}));
jest.mock("../../../services/huggingface", () => ({
  generateHuggingFaceImage: jest.fn(),
}));
jest.mock("../../../services/images", () => ({
  createVideoReadyImage: jest.fn(),
}));
jest.mock("../../../services/s3", () => ({
  putFileToUrl: jest.fn(),
  requestImageUploadUrl: jest.fn(),
}));

import { generateReplicateImage } from "../../../services/replicate";
import { generateBedrockImage } from "../../../services/bedrock";

// Minimal default props for the hook
function makeProps(overrides = {}) {
  return {
    apiBaseUrl: "https://api.example.com",
    imageSource: "replicate",
    imageModel: "stability-ai/sdxl",
    imageSize: "1024x1024",
    imageScheduler: "DPMSolverMultistep",
    imageSchedulerOptions: [],
    imageCount: 1,
    imagePrompt: "A beautiful landscape",
    imageNegativePrompt: "",
    imageGenerationName: "test-image",
    selectedLoraProfileId: "",
    civitaiLoraMode: "",
    civitaiRuntimeLoras: [],
    persistRuntimeCivitaiProfileIfNeeded: jest.fn().mockResolvedValue(""),
    loraImageSupportByModel: {},
    loraImageSupportByProviderModel: null,
    supportedImageLoraModels: [],
    supportedImageLoraModelsByProvider: null,
    onError: jest.fn(),
    onVideoReady: jest.fn(),
    onResetVideoReady: jest.fn(),
    onAddVideoReadyImage: jest.fn(),
    onCloseImageModal: jest.fn(),
    onGenerationComplete: jest.fn(),
    ...overrides,
  };
}

describe("useImageGeneration — initial state", () => {
  it("starts with isGeneratingImage false and idle status", () => {
    const { result } = renderHook(() => useImageGeneration(makeProps()));
    expect(result.current.isGeneratingImage).toBe(false);
    expect(result.current.imageGenerationStatus).toBe("idle");
    expect(result.current.imageGenerationNotice).toBe("");
  });

  it("exposes handleGenerateImage, resetImageGeneration, and imageUploadProps", () => {
    const { result } = renderHook(() => useImageGeneration(makeProps()));
    expect(typeof result.current.handleGenerateImage).toBe("function");
    expect(typeof result.current.resetImageGeneration).toBe("function");
    expect(result.current.imageUploadProps).toBeDefined();
  });
});

describe("useImageGeneration — generate with replicate provider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sets generating state and calls API, then sets success on completion", async () => {
    generateReplicateImage.mockResolvedValueOnce({ notice: "" });

    const props = makeProps();
    const { result } = renderHook(() => useImageGeneration(props));

    await act(async () => {
      await result.current.handleGenerateImage();
    });

    expect(generateReplicateImage).toHaveBeenCalledTimes(1);
    expect(generateReplicateImage).toHaveBeenCalledWith(
      "https://api.example.com",
      expect.objectContaining({
        model: "stability-ai/sdxl",
        imageName: "test-image",
        prompt: "A beautiful landscape",
      })
    );
    expect(result.current.imageGenerationStatus).toBe("success");
    expect(props.onGenerationComplete).toHaveBeenCalledTimes(1);
  });

  it("transitions through loading state during generation", async () => {
    let resolveGenerate;
    generateReplicateImage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      })
    );

    const props = makeProps();
    const { result } = renderHook(() => useImageGeneration(props));

    // Start generation without awaiting
    act(() => {
      result.current.handleGenerateImage();
    });

    // Should be loading now
    expect(result.current.isGeneratingImage).toBe(true);
    expect(result.current.imageGenerationStatus).toBe("loading");

    // Complete the generation
    await act(async () => {
      resolveGenerate({ notice: "Done" });
    });

    expect(result.current.imageGenerationStatus).toBe("success");
  });
});

describe("useImageGeneration — generate with bedrock provider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls bedrock API when imageSource is bedrock", async () => {
    generateBedrockImage.mockResolvedValueOnce({ notice: "" });

    const props = makeProps({ imageSource: "bedrock" });
    const { result } = renderHook(() => useImageGeneration(props));

    await act(async () => {
      await result.current.handleGenerateImage();
    });

    expect(generateBedrockImage).toHaveBeenCalledTimes(1);
    expect(result.current.imageGenerationStatus).toBe("success");
  });
});

describe("useImageGeneration — API error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("handles API error gracefully and sets error status", async () => {
    generateReplicateImage.mockRejectedValueOnce(new Error("Network error"));

    const props = makeProps();
    const { result } = renderHook(() => useImageGeneration(props));

    await act(async () => {
      await result.current.handleGenerateImage();
    });

    expect(result.current.imageGenerationStatus).toBe("error");
    expect(props.onError).toHaveBeenCalledWith("Network error");
  });

  it("calls onError with default message when error has no message", async () => {
    generateReplicateImage.mockRejectedValueOnce({});

    const props = makeProps();
    const { result } = renderHook(() => useImageGeneration(props));

    await act(async () => {
      await result.current.handleGenerateImage();
    });

    expect(result.current.imageGenerationStatus).toBe("error");
    expect(props.onError).toHaveBeenCalledWith("Image generation failed.");
  });
});

describe("useImageGeneration — validation guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls onError and aborts when imageGenerationName is empty", async () => {
    const props = makeProps({ imageGenerationName: "" });
    const { result } = renderHook(() => useImageGeneration(props));

    await act(async () => {
      await result.current.handleGenerateImage();
    });

    expect(generateReplicateImage).not.toHaveBeenCalled();
    expect(props.onError).toHaveBeenCalledWith("Image name is required.");
  });

  it("calls onError and aborts when imagePrompt is empty", async () => {
    const props = makeProps({ imagePrompt: "" });
    const { result } = renderHook(() => useImageGeneration(props));

    await act(async () => {
      await result.current.handleGenerateImage();
    });

    expect(generateReplicateImage).not.toHaveBeenCalled();
    expect(props.onError).toHaveBeenCalledWith("Prompt is required.");
  });

  it("calls onError and aborts when apiBaseUrl is missing", async () => {
    const props = makeProps({ apiBaseUrl: "" });
    const { result } = renderHook(() => useImageGeneration(props));

    await act(async () => {
      await result.current.handleGenerateImage();
    });

    expect(generateReplicateImage).not.toHaveBeenCalled();
    expect(props.onError).toHaveBeenCalledWith(
      "API base URL is missing. Set it in config.json or .env."
    );
  });
});

describe("useImageGeneration — resetImageGeneration", () => {
  it("resets status back to idle", async () => {
    generateReplicateImage.mockRejectedValueOnce(new Error("fail"));

    const props = makeProps();
    const { result } = renderHook(() => useImageGeneration(props));

    await act(async () => {
      await result.current.handleGenerateImage();
    });
    expect(result.current.imageGenerationStatus).toBe("error");

    act(() => {
      result.current.resetImageGeneration();
    });

    expect(result.current.imageGenerationStatus).toBe("idle");
    expect(result.current.imageGenerationNotice).toBe("");
  });
});
