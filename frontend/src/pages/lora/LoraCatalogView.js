import React from "react";
import { SYNC_MIN_LIMIT, SYNC_MAX_LIMIT, toNumberLabel } from "./loraUtils";

/**
 * LoraCatalogView
 *
 * Props:
 *   catalogItems       - normalized catalog items array
 *   catalogTotal       - total count from server
 *   isCatalogLoading   - boolean
 *   isSyncing          - boolean
 *   catalogQuery       - string (local search value)
 *   syncQuery          - string
 *   syncBaseModel      - string
 *   syncLimit          - string
 *   syncNsfw           - boolean
 *   selectedCharacterId - string (needed to enable Add buttons)
 *   onCatalogQueryChange  - (value: string) => void
 *   onSyncQueryChange     - (value: string) => void
 *   onSyncBaseModelChange - (value: string) => void
 *   onSyncLimitChange     - (value: string) => void
 *   onSyncNsfwChange      - (value: boolean) => void
 *   onSync                - (event) => void
 *   onRefresh             - () => void
 *   onAddToImage          - (item) => void
 *   onAddToVideo          - (item) => void
 */
export default function LoraCatalogView({
  catalogItems = [],
  catalogTotal = 0,
  isCatalogLoading = false,
  isSyncing = false,
  catalogQuery = "",
  syncQuery = "",
  syncBaseModel = "",
  syncLimit = "",
  syncNsfw = false,
  selectedCharacterId = "",
  onCatalogQueryChange,
  onSyncQueryChange,
  onSyncBaseModelChange,
  onSyncLimitChange,
  onSyncNsfwChange,
  onSync,
  onRefresh,
  onAddToImage,
  onAddToVideo,
}) {
  return (
    <div className="skr-lora-panel">
      <div style={{ marginBottom: 16 }}>
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--skr-text-primary)",
            marginBottom: 4,
          }}
        >
          LoRA Catalog
        </p>
        <p style={{ fontSize: 12, color: "var(--skr-text-secondary)" }}>
          Sync LoRA entries from CivitAI, then attach them to character profiles.
        </p>
      </div>

      <form onSubmit={onSync} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label>
            <span className="skr-field-label">Search query</span>
            <input
              className="skr-input"
              style={{ width: "100%" }}
              value={syncQuery}
              onChange={(e) => onSyncQueryChange(e.target.value)}
              placeholder="frieren"
              maxLength={120}
            />
          </label>
          <label>
            <span className="skr-field-label">Base model filter</span>
            <input
              className="skr-input"
              style={{ width: "100%" }}
              value={syncBaseModel}
              onChange={(e) => onSyncBaseModelChange(e.target.value)}
              placeholder="SDXL 1.0"
              maxLength={120}
            />
          </label>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <label style={{ flex: 1 }}>
              <span className="skr-field-label">Sync limit</span>
              <input
                type="number"
                min={SYNC_MIN_LIMIT}
                max={SYNC_MAX_LIMIT}
                className="skr-input"
                style={{ width: "100%" }}
                value={syncLimit}
                onChange={(e) => onSyncLimitChange(e.target.value)}
              />
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                paddingBottom: 2,
              }}
            >
              <input
                type="checkbox"
                checked={syncNsfw}
                onChange={(e) => onSyncNsfwChange(e.target.checked)}
              />
              Include NSFW
            </label>
          </div>
          <div className="skr-lora-actions">
            <button type="submit" className="skr-btn-primary" disabled={isSyncing}>
              {isSyncing ? "Syncing..." : "Sync CivitAI"}
            </button>
            <button
              type="button"
              className="skr-btn-secondary"
              onClick={onRefresh}
              disabled={isCatalogLoading}
            >
              Refresh
            </button>
          </div>
        </div>
      </form>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          <span className="skr-field-label">Search local catalog</span>
          <input
            type="search"
            className="skr-input"
            style={{ width: "100%" }}
            value={catalogQuery}
            onChange={(e) => onCatalogQueryChange(e.target.value)}
            placeholder="Search by name, trigger, creator"
          />
        </label>
        <p style={{ fontSize: 11, color: "var(--skr-text-tertiary)" }}>
          {isCatalogLoading
            ? "Loading catalog..."
            : `${toNumberLabel(catalogItems.length)} item(s) shown • ${toNumberLabel(catalogTotal)} total`}
        </p>
      </div>

      <div>
        {catalogItems.length === 0 && !isCatalogLoading ? (
          <p style={{ fontSize: 12, color: "var(--skr-text-tertiary)" }}>
            No LoRA catalog entries. Run a sync from CivitAI.
          </p>
        ) : (
          catalogItems.map((item) => (
            <div key={item.catalogId} className="skr-lora-catalog-item">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <p className="skr-lora-item-name">{item.name || item.catalogId}</p>
                    <p className="skr-lora-item-meta">
                      {item.baseModel || "Base model n/a"} • {item.creatorName || "Creator n/a"}
                    </p>
                  </div>
                  {item.modelUrl && (
                    <a
                      href={item.modelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="skr-btn-secondary"
                      style={{ fontSize: 11, padding: "3px 8px", textDecoration: "none" }}
                    >
                      Open
                    </a>
                  )}
                </div>
                <p style={{ fontSize: 10, color: "var(--skr-text-tertiary)", marginTop: 2 }}>
                  {item.catalogId}
                </p>
                {(item.triggerWords || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                    {(item.triggerWords || []).slice(0, 8).map((word) => (
                      <span key={`${item.catalogId}-${word}`} className="skr-lora-chip">
                        {word}
                      </span>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 11, color: "var(--skr-text-tertiary)", marginTop: 4 }}>
                  Downloads: {toNumberLabel(item.stats.downloadCount)} · Favorites:{" "}
                  {toNumberLabel(item.stats.favoriteCount)} · Rating: {item.stats.rating || 0}
                </p>
                <div className="skr-lora-actions" style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="skr-btn-secondary"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => onAddToImage(item)}
                    disabled={!selectedCharacterId}
                  >
                    Add to Image
                  </button>
                  <button
                    type="button"
                    className="skr-btn-secondary"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => onAddToVideo(item)}
                    disabled={!selectedCharacterId}
                  >
                    Add to Video
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
