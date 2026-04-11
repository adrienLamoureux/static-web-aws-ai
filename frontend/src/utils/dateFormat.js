export function formatTimestamp(value) {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return String(value);
  return new Date(parsed).toLocaleString();
}
