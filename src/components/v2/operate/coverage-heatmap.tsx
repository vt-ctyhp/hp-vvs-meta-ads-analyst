import type { MetaAdsHistoryCoverage } from "@/lib/meta-backfill";

/**
 * Month × Account coverage heatmap.
 *
 * Each cell shows insight_rows for that account-month. Color intensity scales
 * by row count: empty (0) → light beige, moderate → mid pink, full → dark pink.
 * Hover reveals first_date / last_date.
 *
 * Source: meta_ads_history_coverage RPC. The heatmap helps an admin spot
 * gaps that need a backfill job (months with low/zero rows on an active
 * account).
 */

type Props = {
  coverage: MetaAdsHistoryCoverage[];
  rangeStart: string;
  rangeEnd: string;
};

export function CoverageHeatmap({ coverage, rangeStart, rangeEnd }: Props) {
  // Pivot: months × accounts → cells.
  const months = uniqueSorted(coverage.map((c) => c.month));
  const accounts = uniqueSorted(
    coverage.map((c) => `${c.metaAccountId}::${c.accountName ?? ""}`),
  ).map((key) => {
    const [id, name] = key.split("::");
    return { metaAccountId: id, accountName: name || null };
  });

  const maxRows = Math.max(0, ...coverage.map((c) => c.insightRows));

  const cellLookup = new Map<string, MetaAdsHistoryCoverage>();
  for (const c of coverage) {
    cellLookup.set(`${c.metaAccountId}::${c.month}`, c);
  }

  if (months.length === 0 || accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-600">
        No coverage data in this range yet. Run a sync (Pipelines tab) and
        revisit.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-stone-900">Historical coverage</h2>
        <span className="text-xs text-stone-500 tabular-nums">
          {rangeStart} → {rangeEnd}
        </span>
      </header>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2 text-left text-[10px] uppercase tracking-wider text-stone-500">
                Account
              </th>
              {months.map((month) => (
                <th
                  key={month}
                  className="whitespace-nowrap px-2 py-2 text-[10px] uppercase tracking-wider text-stone-500"
                >
                  {month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((acct) => (
              <tr key={acct.metaAccountId} className="border-t border-stone-100">
                <th className="sticky left-0 bg-white px-3 py-2 text-left text-stone-800 whitespace-nowrap">
                  {acct.accountName ?? acct.metaAccountId}
                </th>
                {months.map((month) => {
                  const cell = cellLookup.get(`${acct.metaAccountId}::${month}`);
                  const rows = cell?.insightRows ?? 0;
                  const intensity = maxRows > 0 ? Math.min(1, rows / maxRows) : 0;
                  const bg = intensityToColor(intensity);
                  const title = cell
                    ? `${month}  •  ${rows} rows${
                        cell.firstDate ? `  •  ${cell.firstDate} → ${cell.lastDate}` : ""
                      }`
                    : `${month}  •  no data`;
                  return (
                    <td
                      key={month}
                      title={title}
                      className="px-2 py-1 text-center tabular-nums"
                      style={{ background: bg, color: intensity > 0.55 ? "white" : "#1F1A14" }}
                    >
                      {rows}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend max={maxRows} />
    </section>
  );
}

function Legend({ max }: { max: number }) {
  if (max === 0) return null;
  const stops = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="flex items-center gap-2 text-[10px] text-stone-500">
      <span>0</span>
      <div className="flex h-3 w-40 overflow-hidden rounded-full">
        {stops.map((s, i) => (
          <span
            key={i}
            className="block h-3 flex-1"
            style={{ background: intensityToColor(s) }}
          />
        ))}
      </div>
      <span>{max.toLocaleString()}</span>
    </div>
  );
}

/**
 * Map a 0..1 intensity to a beige-to-pink gradient. Picked to match the brand
 * accent while remaining readable. Values: 0 → near-bg, 1 → primary accent.
 */
function intensityToColor(intensity: number): string {
  // Approximate gradient: F1ECE3 (beige) → FDE6EE (light pink) → E14B7B (accent)
  type Stop = readonly [number, readonly [number, number, number]];
  const stops: readonly Stop[] = [
    [0.0, [241, 236, 227]],
    [0.5, [253, 230, 238]],
    [1.0, [225, 75, 123]],
  ];
  let lo: Stop = stops[0];
  let hi: Stop = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (intensity >= stops[i][0] && intensity <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0];
  const t = span === 0 ? 0 : (intensity - lo[0]) / span;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const [r, g, b] = [
    mix(lo[1][0], hi[1][0]),
    mix(lo[1][1], hi[1][1]),
    mix(lo[1][2], hi[1][2]),
  ];
  return `rgb(${r}, ${g}, ${b})`;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}
