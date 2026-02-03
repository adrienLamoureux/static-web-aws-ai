import React from "react";

function WhiskHero({
  apiBaseUrl,
  status,
  error,
  isGeneratingImage,
  isUploading,
}) {
  return (
    <header className="whisk-hero-block animate-fade-up">
      <p className="whisk-eyebrow">Whisk Studio</p>
      <h1 className="whisk-title-main">Intuitive studio for image-led motion</h1>
      <p className="whisk-subtitle-main">
        Anime lover web app. Load your S3 library instantly and start
        exploring.
      </p>
      <div className="whisk-status-row">
        <span className="whisk-pill">
          {apiBaseUrl
            ? status === "loading"
              ? "Loading library..."
              : "Library connected"
            : "Set API URL in config.json or .env"}
        </span>
        {(isGeneratingImage || isUploading) && (
          <span className="whisk-pill">
            {isUploading ? "Uploading" : "Rendering"}
          </span>
        )}
        {error && <span className="whisk-error">{error}</span>}
      </div>
    </header>
  );
}

export default WhiskHero;
