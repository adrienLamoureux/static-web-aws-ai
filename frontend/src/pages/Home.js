import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Container,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

const buildSafeFileName = (name = "") =>
  name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");

const getImageDimensions = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error("Failed to load image."));
      img.src = event.target?.result;
    };
    reader.readAsDataURL(file);
  });

function Home({ apiBaseUrl = "" }) {
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [prompt, setPrompt] = useState("A cinematic push-in on the scene.");
  const [imageName, setImageName] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [selectedImageKey, setSelectedImageKey] = useState("");
  const [availableImages, setAvailableImages] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [generationStatus, setGenerationStatus] = useState("idle");
  const [error, setError] = useState("");
  const [generationResponse, setGenerationResponse] = useState(null);
  const [invocationArn, setInvocationArn] = useState("");
  const [outputPrefix, setOutputPrefix] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const resolvedApiBaseUrl =
    apiBaseUrl || process.env.REACT_APP_API_URL || "";

  const isUploading = uploadStatus === "uploading";
  const isGenerating = generationStatus === "loading";

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    fetch(`${resolvedApiBaseUrl}/`)
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => console.error(err));
  }, [resolvedApiBaseUrl]);

  const refreshImageList = async () => {
    if (!resolvedApiBaseUrl) return;
    try {
      const response = await fetch(`${resolvedApiBaseUrl}/s3/images`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to load images.");
      }
      setAvailableImages(data.images || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchVideoUrl = async () => {
    if (!resolvedApiBaseUrl || !outputPrefix) return;
    try {
      const response = await fetch(
        `${resolvedApiBaseUrl}/s3/video-url?prefix=${encodeURIComponent(
          outputPrefix
        )}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to load video.");
      }
      setVideoUrl(data.url || "");
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshImageList();
  }, [resolvedApiBaseUrl]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const uploadStatusLabel = useMemo(() => {
    if (uploadStatus === "uploaded") return "Uploaded";
    if (uploadStatus === "uploading") return "Uploading";
    if (uploadStatus === "error") return "Upload failed";
    return "Idle";
  }, [uploadStatus]);

  const generationStatusLabel = useMemo(() => {
    if (generationStatus === "success") return "Started";
    if (generationStatus === "loading") return "Submitting";
    if (generationStatus === "error") return "Submission failed";
    return "Idle";
  }, [generationStatus]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/jpeg") {
      setError("Please select a JPEG image.");
      setSelectedFile(null);
      return;
    }
    setError("");
    setSelectedFile(file);
    setUploadKey("");
    setSelectedImageKey("");
    setUploadStatus("idle");
    setGenerationStatus("idle");
    setGenerationResponse(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (!imageName.trim()) {
      setError("Image name is required.");
      return;
    }
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    setUploadStatus("uploading");
    setGenerationStatus("idle");
    setGenerationResponse(null);
    setInvocationArn("");
    setJobStatus("");
    setVideoUrl("");

    const safeName = buildSafeFileName(imageName.trim()) || "upload";
    const key = `images/${safeName}.jpg`;
    const contentType = selectedFile.type || "application/octet-stream";

    try {
      const dimensions = await getImageDimensions(selectedFile);
      if (dimensions.width !== 1280 || dimensions.height !== 720) {
        throw new Error("Image must be 1280x720 pixels.");
      }
      const presignResponse = await fetch(
        `${resolvedApiBaseUrl}/s3/image-upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, contentType }),
        }
      );
      const presignData = await presignResponse.json();
      if (!presignResponse.ok) {
        throw new Error(presignData?.message || "Failed to request upload URL.");
      }

      const putResponse = await fetch(presignData.url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: selectedFile,
      });

      if (!putResponse.ok) {
        throw new Error("S3 upload failed. Please retry.");
      }

      setUploadKey(presignData.key);
      setSelectedImageKey(presignData.key);
      setUploadStatus("uploaded");
    } catch (err) {
      setUploadStatus("error");
      setError(err?.message || "Upload failed.");
    }
    await refreshImageList();
  };

  const handleGenerate = async () => {
    if (!selectedImageKey) {
      setError("Select an image before generating a video.");
      return;
    }
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    setGenerationStatus("loading");
    setGenerationResponse(null);
    setInvocationArn("");
    setJobStatus("");
    setVideoUrl("");

    try {
      const newOutputPrefix = `videos/${Date.now()}/`;
      const response = await fetch(
        `${resolvedApiBaseUrl}/bedrock/nova-reel/image-to-video-s3`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt?.trim() || undefined,
            inputKey: selectedImageKey,
            outputPrefix: newOutputPrefix,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to start video generation.");
      }
      setGenerationResponse(data);
      setGenerationStatus("success");
      setInvocationArn(data?.response?.invocationArn || "");
      setOutputPrefix(newOutputPrefix);
    } catch (err) {
      setGenerationStatus("error");
      setError(err?.message || "Video generation failed.");
    }
  };

  useEffect(() => {
    if (!invocationArn || !resolvedApiBaseUrl) return undefined;
    let timeoutId;
    let isCancelled = false;

    const pollStatus = async () => {
      if (isCancelled) return;
      try {
        const response = await fetch(
          `${resolvedApiBaseUrl}/bedrock/nova-reel/job-status?invocationArn=${encodeURIComponent(
            invocationArn
          )}`
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || "Failed to fetch job status.");
        }
        const status = data?.status || "";
        setJobStatus(status);
        if (status === "Completed") {
          await fetchVideoUrl();
          return;
        }
        if (status === "Failed") {
          return;
        }
      } catch (err) {
        console.error(err);
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
  }, [invocationArn, outputPrefix, resolvedApiBaseUrl]);

  return (
    <Box sx={{ py: { xs: 4, md: 6 } }}>
      <Container maxWidth="md">
        <Stack spacing={4}>
          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2}>
              <Typography variant="overline" color="text.secondary">
                API Status
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                Image to video in two steps
              </Typography>
              <Typography color="text.secondary">
                {resolvedApiBaseUrl
                  ? message || "Connecting to the API..."
                  : "Set API URL in config.json or .env"}
              </Typography>
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={3}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                1. Upload your image
              </Typography>

              <TextField
                label="Image name"
                value={imageName}
                onChange={(event) => setImageName(event.target.value)}
                placeholder="frieren"
                helperText="Stored as images/NAME.jpg"
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button variant="outlined" component="label">
                  Choose image
                  <input
                    hidden
                    type="file"
                    accept="image/jpeg"
                    onChange={handleFileChange}
                  />
                </Button>
                <Button
                  variant="contained"
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading || !imageName.trim()}
                >
                  Upload to S3
                </Button>
                <Chip label={uploadStatusLabel} variant="outlined" />
              </Stack>

              {isUploading && <LinearProgress />}

              {selectedFile && (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" },
                    gap: 2,
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Selected image
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>
                      {selectedFile.name}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {Math.round(selectedFile.size / 1024)} KB
                    </Typography>
                  </Box>
                  {previewUrl && (
                    <Box
                      component="img"
                      src={previewUrl}
                      alt="Preview"
                      sx={{
                        width: "100%",
                        borderRadius: 2,
                        border: "1px solid rgba(0, 0, 0, 0.08)",
                      }}
                    />
                  )}
                </Box>
              )}

              {uploadKey && (
                <Typography variant="body2" color="text.secondary">
                  Uploaded as{" "}
                  <Box component="span" sx={{ fontFamily: "IBM Plex Mono" }}>
                    {uploadKey}
                  </Box>
                </Typography>
              )}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={3}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                2. Trigger video generation
              </Typography>

              <Stack spacing={1}>
                <Typography variant="subtitle2" color="text.secondary">
                  Select an image
                </Typography>
                {availableImages.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No images found in S3 yet.
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                      },
                      gap: 2,
                    }}
                  >
                    {availableImages.map((image) => {
                      const isSelected = selectedImageKey === image.key;
                      return (
                        <Paper
                          key={image.key}
                          variant="outlined"
                          sx={{
                            borderColor: isSelected
                              ? "primary.main"
                              : "rgba(0, 0, 0, 0.12)",
                            bgcolor: isSelected
                              ? "rgba(25, 118, 210, 0.08)"
                              : "transparent",
                          }}
                        >
                          <ButtonBase
                            onClick={() => setSelectedImageKey(image.key)}
                            sx={{
                              width: "100%",
                              textAlign: "left",
                              p: 2,
                            }}
                          >
                            <Stack spacing={1} sx={{ width: "100%" }}>
                              <Box
                                component="img"
                                src={image.url}
                                alt={image.key}
                                sx={{
                                  width: "100%",
                                  height: 160,
                                  objectFit: "cover",
                                  borderRadius: 1,
                                  border: "1px solid rgba(0, 0, 0, 0.08)",
                                }}
                              />
                              <Typography variant="body2">{image.key}</Typography>
                            </Stack>
                          </ButtonBase>
                        </Paper>
                      );
                    })}
                  </Box>
                )}
              </Stack>

              <TextField
                label="Prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                multiline
                minRows={2}
              />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button
                  variant="contained"
                  onClick={handleGenerate}
                  disabled={!selectedImageKey || isGenerating}
                >
                  Start video job
                </Button>
                <Chip label={generationStatusLabel} variant="outlined" />
              </Stack>

              {isGenerating && <LinearProgress />}

              {generationResponse && (
                <Paper
                  variant="outlined"
                  sx={{ p: 2, bgcolor: "rgba(0, 0, 0, 0.02)" }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Job submitted
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Output: {generationResponse.outputS3Uri}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Model: {generationResponse.modelId}
                  </Typography>
                  {jobStatus && (
                    <Typography variant="body2" color="text.secondary">
                      Status: {jobStatus}
                    </Typography>
                  )}
                </Paper>
              )}

              {videoUrl && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Generated video
                  </Typography>
                  <Box
                    component="video"
                    src={videoUrl}
                    controls
                    sx={{ width: "100%", borderRadius: 2 }}
                  />
                </Paper>
              )}
            </Stack>
          </Paper>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Container>
    </Box>
  );
}

export default Home;
