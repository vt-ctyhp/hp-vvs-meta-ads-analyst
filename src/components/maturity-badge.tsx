/**
 * Maturity discipline badge.
 *
 * Every metric on the platform is either:
 *   - leading:  responds to ad changes within hours; signal only, not yet
 *               validated against business outcome (spend, CTR, message count,
 *               cost per message).
 *   - trailing: reflects an actual business outcome that takes 4–6 weeks to
 *               mature (closed sale, qualified lead, LTV).
 *   - pending:  the data pipeline exists but no values have arrived yet
 *               (e.g. Awaiting Sales Review).
 *
 * In v1 everything on the executive snapshot is `leading`. The trailing
 * column lights up in v1.5 once the sales review system feeds outcome data
 * back into the rollups.
 *
 * Pure presentational. Sits next to a metric, not inside it.
 */

export type MaturityLevel = "leading" | "trailing" | "pending";

const META: Record<MaturityLevel, { label: string; tooltip: string }> = {
  leading: {
    label: "Leading",
    tooltip:
      "Leading indicator — moves within hours of ad changes. Not yet validated against business outcomes (sales). Trailing data lands in v1.5.",
  },
  trailing: {
    label: "Trailing",
    tooltip:
      "Trailing indicator — reflects mature business outcomes (closed sales, qualified leads) that take 4–6 weeks to settle.",
  },
  pending: {
    label: "Pending",
    tooltip:
      "Data pipeline exists but values aren’t yet flowing. Surfaces here once the upstream source starts producing.",
  },
};

export function MaturityBadge({
  level,
  className,
}: {
  level: MaturityLevel;
  className?: string;
}) {
  const meta = META[level];
  return (
    <span
      title={meta.tooltip}
      className={`inline-flex items-center border border-hp-rule bg-hp-foundation px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-hp-muted ${className ?? ""}`.trim()}
    >
      {meta.label}
    </span>
  );
}
