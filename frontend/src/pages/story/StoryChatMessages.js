/**
 * StoryChatMessages — scrollable message list for the Story page.
 * Renders user/assistant/system bubbles, scene illustration cards,
 * and on-demand illustrate buttons.
 */

import React from "react";
import ReactMarkdown from "react-markdown";
import StorySceneCard from "../../components/story/StorySceneCard";

export default function StoryChatMessages({
  messages,
  loadingSession,
  scenes,
  getSceneMedia,
  onIllustrate,
  onAnimate,
  onMusic,
  onPlayInDock,
  activeSessionId,
  illustratingMessages,
  onIllustrateMessage,
  sending,
  bottomRef,
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
      {loadingSession ? (
        <div
          style={{
            textAlign: "center",
            padding: 32,
            color: "var(--skr-text-tertiary)",
            fontSize: 13,
          }}
        >
          Loading session…
        </div>
      ) : (
        <div className="skr-chat-container">
          {messages.map((msg, i) => (
            <React.Fragment key={i}>
              {/* System note (e.g. LoRA switch log) */}
              {msg.role === "system" ? (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--skr-text-tertiary)",
                    fontStyle: "italic",
                    margin: "6px 0",
                    padding: "4px 12px",
                    background: "var(--skr-elevated)",
                    borderRadius: 6,
                    display: "inline-block",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {msg.text}
                </div>
              ) : (
                <div className={`skr-chat-bubble ${msg.role}`}>
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              )}

              {/* Scene illustration card (assistant messages with a bound scene) */}
              {msg.role === "assistant" &&
                msg.sceneId &&
                (() => {
                  const scene = scenes[msg.sceneId];
                  if (!scene) return null;
                  const media = getSceneMedia(msg.sceneId);
                  const merged = media ? { ...scene, ...media } : scene;
                  return (
                    <StorySceneCard
                      scene={merged}
                      onIllustrate={() => onIllustrate(msg.sceneId)}
                      onAnimate={() => onAnimate(activeSessionId, msg.sceneId)}
                      onMusic={() => onMusic(activeSessionId, msg.sceneId)}
                      onPlayInDock={() =>
                        onPlayInDock({
                          url: merged.musicUrl,
                          key: merged.musicKey || merged.musicUrl,
                          source: "scene",
                          title: merged.title || "Scene Music",
                          mood: merged.musicMood || "",
                          energy: merged.musicEnergy || "",
                          tempoBpm: merged.musicTempoBpm || null,
                          tags: merged.musicTags || [],
                          updatedAt: merged.createdAt || "",
                        })
                      }
                      animating={
                        merged.videoStatus === "starting" || merged.videoStatus === "processing"
                      }
                      generatingMusic={
                        merged.musicStatus === "starting" || merged.musicStatus === "processing"
                      }
                    />
                  );
                })()}

              {/* On-demand illustrate button for unillustrated assistant messages */}
              {msg.role === "assistant" && !msg.sceneId && activeSessionId && (
                <div style={{ marginBottom: 6 }}>
                  {illustratingMessages.has(i) ? (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--skr-text-tertiary)",
                        fontStyle: "italic",
                      }}
                    >
                      Generating illustration…
                    </span>
                  ) : (
                    <button
                      className="skr-btn-secondary"
                      style={{ fontSize: 11, padding: "3px 10px" }}
                      onClick={() => onIllustrateMessage(i)}
                    >
                      🎨 Illustrate
                    </button>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}

          {sending && (
            <div className="skr-chat-bubble assistant" style={{ opacity: 0.6 }}>
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
