import { OptimizeFilterBar } from "@/components/v2/optimize/filter-bar";
import type { OptimizeTab } from "@/components/v2/optimize/optimize-tabs";
import { PeriodControls } from "@/components/v2/optimize/period-controls";
import type { PeriodMetric } from "@/lib/period-pivot-data";
import type { Frequency } from "@/lib/period-windows";

type Option = { value: string; label: string };

type Props = {
  activeTab: OptimizeTab;
  brands: Option[];
  groups: Option[];
  periods: number;
  frequency: Frequency;
  metric: PeriodMetric;
};

export function OptimizeControls({
  activeTab,
  brands,
  groups,
  periods,
  frequency,
  metric,
}: Props) {
  const showPeriodControls = activeTab === "breakdown";

  return (
    <section
      aria-label={
        showPeriodControls
          ? "Optimize filters and period grouping"
          : "Optimize filters"
      }
      className="overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      <OptimizeFilterBar activeTab={activeTab} brands={brands} groups={groups} />
      {showPeriodControls ? (
        <>
          <div className="border-t border-stone-200" />
          <PeriodControls periods={periods} frequency={frequency} metric={metric} />
        </>
      ) : null}
    </section>
  );
}
