import React from "react";

function ApiStatusCard({ apiBaseUrl, message }) {
  return (
    <div className="animate-fade-up glass-panel relative overflow-hidden rounded-[32px] p-8 shadow-soft md:p-12">
      <div className="absolute -right-16 top-6 h-40 w-40 animate-glow-pulse rounded-full bg-glow blur-2xl" />
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
        API Status
      </p>
      <p className="mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
        {apiBaseUrl
          ? message || "Connecting to the API..."
          : "Set API URL in config.json or .env"}
      </p>
    </div>
  );
}

export default ApiStatusCard;
