import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [generationStatus, setGenerationStatus] = useState("idle");
  const [error, setError] = useState("");
  const [generationResponse, setGenerationResponse] = useState(null);

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
      setUploadStatus("uploaded");
    } catch (err) {
      setUploadStatus("error");
      setError(err?.message || "Upload failed.");
    }
  };

  const handleGenerate = async () => {
    if (!uploadKey) {
      setError("Upload an image before generating a video.");
      return;
    }
    if (!resolvedApiBaseUrl) {
      setError("API base URL is missing. Set it in config.json or .env.");
      return;
    }
    setError("");
    setGenerationStatus("loading");
    setGenerationResponse(null);

    try {
      const response = await fetch(
        `${resolvedApiBaseUrl}/bedrock/nova-reel/image-to-video-s3`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt?.trim() || undefined,
            inputKey: uploadKey,
            outputPrefix: `videos/${Date.now()}/`,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to start video generation.");
      }
      setGenerationResponse(data);
      setGenerationStatus("success");
    } catch (err) {
      setGenerationStatus("error");
      setError(err?.message || "Video generation failed.");
    }
  };

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
                  disabled={!uploadKey || isGenerating}
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
