import React from 'react';

export default function StatCard({ label, value, isLoading }) {
  return (
    <div className="skr-card skr-stat-card">
      <p className="skr-stat-label">{label}</p>
      <p className="skr-stat-value">{isLoading ? '—' : value}</p>
    </div>
  );
}
