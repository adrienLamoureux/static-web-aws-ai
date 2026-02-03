import React, { useEffect, useMemo, useState } from "react";
import { deleteImage, listImages } from "../services/s3";

function Whisk({ apiBaseUrl = "" }) {
  const [images, setImages] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [featuredKey, setFeaturedKey] = useState("");

  const resolvedApiBaseUrl =
    apiBaseUrl || process.env.REACT_APP_API_URL || "";

  useEffect(() => {
    if (!resolvedApiBaseUrl) return;
    let isMounted = true;
    const loadImages = async () => {
      setStatus("loading");
      setError("");
      try {
        const data = await listImages(resolvedApiBaseUrl);
        if (!isMounted) return;
        setImages(data.images || []);
        setStatus("success");
      } catch (err) {
        if (!isMounted) return;
        setStatus("error");
        setError(err?.message || "Failed to load images.");
      }
    };
    loadImages();
    return () => {
      isMounted = false;
    };
  }, [resolvedApiBaseUrl]);

  const heroImages = useMemo(() => images.slice(0, 12), [images]);
  const showcaseImage =
    images.find((image) => image.key === featuredKey) || heroImages[0];

  const handleDeleteImage = async (image) => {
    if (!image?.key || !resolvedApiBaseUrl) return;
    try {
      await deleteImage(resolvedApiBaseUrl, image.key);
      setImages((prev) => prev.filter((item) => item.key !== image.key));
      if (featuredKey === image.key) {
        setFeaturedKey("");
      }
    } catch (err) {
      setError(err?.message || "Failed to delete image.");
    }
  };

  return (
    <section className="whisk-page">
      <header className="whisk-hero-block">
        <p className="whisk-eyebrow">Whisk Studio</p>
        <h1 className="whisk-title-main">Turn images into motion studies</h1>
        <p className="whisk-subtitle-main">
          A gallery-first workspace inspired by creative image tools. Load your
          S3 library instantly and start exploring.
        </p>
        <div className="whisk-status-row">
          <span className="whisk-pill">
            {resolvedApiBaseUrl
              ? status === "loading"
                ? "Loading library..."
                : "Library connected"
              : "Set API URL in config.json or .env"}
          </span>
          {error && <span className="whisk-error">{error}</span>}
        </div>
      </header>

      <div className="whisk-gallery">
        <div className="whisk-wall">
          {heroImages.length > 0 ? (
            heroImages.map((image, index) => (
              <div
                key={image.key || `${image.url}-${index}`}
                role="button"
                tabIndex={0}
                className={`whisk-tile ${index === 0 ? "is-feature" : ""}`}
                onClick={() => setFeaturedKey(image.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setFeaturedKey(image.key);
                  }
                }}
              >
                <img src={image.url} alt={image.key || "Generated image"} />
                <div className="whisk-tile-overlay" />
                <span className="whisk-tile-meta">
                  {image.key?.split("/").pop() || "frame"}
                </span>
                <span className="whisk-tile-actions">
                  {image.url && (
                    <a
                      className="whisk-icon-button"
                      href={image.url}
                      download
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Download image"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 3v11m0 0l4-4m-4 4l-4-4M4 17v3h16v-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  )}
                  <button
                    type="button"
                    className="whisk-icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteImage(image);
                    }}
                    aria-label="Delete image"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 7h16M9 7V5h6v2m-7 0l1 12h8l1-12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </span>
              </div>
            ))
          ) : (
            <div className="whisk-empty">
              {status === "loading"
                ? "Loading images from S3..."
                : "No images found yet. Generate or upload to populate the wall."}
            </div>
          )}
        </div>

        <div className="whisk-spotlight">
          <div className="whisk-spotlight-card">
            <p className="whisk-eyebrow">Spotlight</p>
            {showcaseImage ? (
              <>
                <img
                  src={showcaseImage.url}
                  alt={showcaseImage.key || "Spotlight"}
                />
                <div className="whisk-spotlight-meta">
                  <span className="whisk-pill">Featured</span>
                  <span className="whisk-meta-text">
                    {showcaseImage.key || "untitled"}
                  </span>
                  {showcaseImage.url && (
                    <a
                      className="whisk-icon-button"
                      href={showcaseImage.url}
                      download
                      aria-label="Download featured image"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 3v11m0 0l4-4m-4 4l-4-4M4 17v3h16v-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  )}
                  <button
                    type="button"
                    className="whisk-icon-button"
                    onClick={() => handleDeleteImage(showcaseImage)}
                    aria-label="Delete featured image"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 7h16M9 7V5h6v2m-7 0l1 12h8l1-12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="whisk-empty">
                Your spotlight will appear here once images are available.
              </div>
            )}
          </div>
        </div>
      </div>

      {images.length > 0 && (
        <div className="whisk-carousel">
          <div className="whisk-carousel-track">
            {images.map((image) => (
              <button
                key={image.key}
                type="button"
                className="whisk-carousel-card"
                onClick={() => setFeaturedKey(image.key)}
              >
                <img src={image.url} alt={image.key || "Carousel image"} />
                <span className="whisk-carousel-meta">
                  {image.key?.split("/").pop() || "frame"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default Whisk;
