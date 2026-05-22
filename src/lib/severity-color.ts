export function severityColor(value: string): string {
  const v = (value || "").toLowerCase();
  if (v === "ok" || v === "healthy") return "var(--positive)";
  if (v === "warning" || v === "warn") return "var(--warning)";
  if (v === "critical" || v === "error" || v === "fail") return "var(--danger)";
  return "var(--ink-muted)";
}

export function severityBg(value: string): string {
  const v = (value || "").toLowerCase();
  if (v === "ok" || v === "healthy") return "var(--positive-bg)";
  if (v === "warning" || v === "warn") return "var(--warning-bg)";
  if (v === "critical" || v === "error" || v === "fail") return "var(--danger-bg)";
  return "transparent";
}
