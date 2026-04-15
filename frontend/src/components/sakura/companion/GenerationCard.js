/**
 * GenerationCard — inline image generation card rendered inside CompanionChat
 * when Hiyori detects a generation intent from the user's message.
 *
 * Shows the extracted prompt (editable), a Generate button (auth-gated),
 * and inline progress/result display.
 */

import { useState, useRef } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useConfig } from "../../../contexts/ConfigContext";
import { useCompanion, CompanionActions } from "../../../lib/companion/CompanionContext";
import { generateReplicateImage, getReplicateImageStatus } from "../../../services/replicate";
import { buildApiUrl } from "../../../services/apiClient";

const DEFAULT_MODEL = "wai-nsfw-illustrious-v11";
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes

export default function GenerationCard({ generation }) {
  const { isAuthenticated } = useAuth();
  const { apiBaseUrl } = useConfig();
  const { dispatch } = useCompanion();

  const [prompt, setPrompt] = useState(generation.prompt || "");
  const [status, setStatus] = useState("idle"); // idle | generating | polling | done | error
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || status === "generating" || status === "polling") return;

    setStatus("generating");
    setError(null);
    setResultUrl(null);
    dispatch(CompanionActions.GENERATION_START, { type: "image" });

    try {
      const data = await generateReplicateImage(apiBaseUrl, {
        model: DEFAULT_MODEL,
        imageName: `companion-${Date.now()}`,
        prompt: prompt.trim(),
        width: 768,
        height: 1024,
        numImages: 1,
      });

      // Synchronous result — image is ready
      if (data.images && data.images.length > 0) {
        setResultUrl(data.images[0].url);
        setStatus("done");
        dispatch(CompanionActions.GENERATION_DONE, { type: "image", success: true });
        return;
      }

      // Async result — need to poll
      if (data.predictionId) {
        setStatus("polling");
        let polls = 0;

        const poll = async () => {
          if (polls >= MAX_POLLS) {
            setStatus("error");
            setError("Generation timed out.");
            dispatch(CompanionActions.GENERATION_ERROR, { type: "image", error: "timeout" });
            return;
          }
          polls += 1;

          try {
            const statusData = await getReplicateImageStatus(apiBaseUrl, {
              predictionId: data.predictionId,
              imageName: `companion-${Date.now()}`,
              batchId: data.batchId || "",
              prompt: prompt.trim(),
            });

            if (statusData.status === "succeeded" && statusData.images?.length > 0) {
              setResultUrl(statusData.images[0].url);
              setStatus("done");
              dispatch(CompanionActions.GENERATION_DONE, { type: "image", success: true });
              return;
            }

            if (statusData.status === "failed" || statusData.status === "canceled") {
              setStatus("error");
              setError("Generation failed.");
              dispatch(CompanionActions.GENERATION_ERROR, { type: "image", error: "failed" });
              return;
            }

            // Still processing — poll again
            pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          } catch {
            setStatus("error");
            setError("Could not check generation status.");
            dispatch(CompanionActions.GENERATION_ERROR, { type: "image", error: "poll_failed" });
          }
        };

        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }

      // Unexpected response
      setStatus("error");
      setError("Unexpected response from server.");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Generation failed.");
      dispatch(CompanionActions.GENERATION_ERROR, { type: "image", error: err.message });
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.label}>Image Generation</div>

      {/* Editable prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={styles.promptInput}
        rows={2}
        disabled={status === "generating" || status === "polling"}
        maxLength={900}
      />

      {/* Action area */}
      {!isAuthenticated ? (
        <p style={styles.authHint}>Log in to generate images</p>
      ) : status === "idle" ? (
        <button
          type="button"
          onClick={handleGenerate}
          style={styles.generateBtn}
          disabled={!prompt.trim()}
        >
          Generate
        </button>
      ) : status === "generating" || status === "polling" ? (
        <div style={styles.progress}>
          <span style={styles.spinner} />
          <span style={styles.progressText}>
            {status === "generating" ? "Sending..." : "Generating..."}
          </span>
        </div>
      ) : null}

      {/* Error */}
      {status === "error" && (
        <div style={styles.errorRow}>
          <span style={styles.errorText}>{error}</span>
          <button type="button" onClick={handleGenerate} style={styles.retryBtn}>
            Retry
          </button>
        </div>
      )}

      {/* Result */}
      {status === "done" && resultUrl && (
        <a href={resultUrl} target="_blank" rel="noopener noreferrer" style={styles.resultLink}>
          <img src={resultUrl} alt="Generated" style={styles.resultImg} />
        </a>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "rgba(255, 107, 157, 0.08)",
    border: "1px solid rgba(255, 107, 157, 0.25)",
    borderRadius: 8,
    padding: "8px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--skr-accent)",
    opacity: 0.8,
  },
  promptInput: {
    background: "var(--skr-comp-input-bg)",
    border: "1px solid var(--skr-comp-input-border)",
    borderRadius: 6,
    padding: "5px 8px",
    color: "var(--skr-text)",
    fontSize: 11,
    lineHeight: 1.4,
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
    minHeight: 36,
  },
  generateBtn: {
    alignSelf: "flex-start",
    background: "rgba(255, 107, 157, 0.2)",
    border: "1px solid rgba(255, 107, 157, 0.4)",
    borderRadius: 6,
    color: "var(--skr-accent)",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 14px",
    transition: "background 0.15s",
  },
  progress: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  spinner: {
    width: 12,
    height: 12,
    border: "2px solid rgba(255, 107, 157, 0.2)",
    borderTopColor: "var(--skr-accent)",
    borderRadius: "50%",
    animation: "skr-spin 0.8s linear infinite",
    flexShrink: 0,
  },
  progressText: {
    fontSize: 11,
    color: "var(--skr-text-secondary)",
    fontStyle: "italic",
  },
  errorRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    fontSize: 11,
    color: "rgba(255, 100, 100, 0.9)",
    flex: 1,
  },
  retryBtn: {
    background: "none",
    border: "1px solid rgba(255, 100, 100, 0.3)",
    borderRadius: 4,
    color: "rgba(255, 100, 100, 0.9)",
    cursor: "pointer",
    fontSize: 10,
    padding: "2px 8px",
  },
  authHint: {
    fontSize: 11,
    color: "var(--skr-text-muted)",
    fontStyle: "italic",
    margin: 0,
  },
  resultLink: {
    display: "block",
    borderRadius: 6,
    overflow: "hidden",
    maxWidth: "100%",
  },
  resultImg: {
    width: "100%",
    height: "auto",
    borderRadius: 6,
    display: "block",
  },
};
