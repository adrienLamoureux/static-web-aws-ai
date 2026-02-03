import React from "react";

function ApiStatusCard({ apiBaseUrl, message }) {
  return (
    <div className="panel panel-hero animate-fade-up relative overflow-hidden rounded-[32px] p-8 md:p-12">
      <div className="absolute -right-10 top-8 h-40 w-40 animate-glow-pulse rounded-full bg-glow blur-3xl" />
      <div className="flex items-center gap-3">
        <span className="pill-tag">API Status</span>
        <span className="text-xs text-[#9a8a72]">Connection</span>
      </div>
      <p className="mt-6 max-w-2xl text-base text-[#5d5140] md:text-lg">
        {apiBaseUrl
          ? message || "Connecting to the API..."
          : "Set API URL in config.json or .env"}
      </p>
    </div>
  );
}

export default ApiStatusCard;
