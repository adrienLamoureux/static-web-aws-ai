import React from "react";

function WhiskHero({
  error,
  isGeneratingImage,
  isUploading,
}) {
  const showStatusRow = isGeneratingImage || isUploading || Boolean(error);

  return (
    <header className="whisk-hero-block">
      {showStatusRow && (
        <div className="whisk-status-row">
          {(isGeneratingImage || isUploading) && (
            <span className="whisk-pill">
              {isUploading ? "Uploading" : "Rendering"}
            </span>
          )}
          {error && <span className="whisk-error">{error}</span>}
        </div>
      )}
    </header>
  );
}

export default WhiskHero;
