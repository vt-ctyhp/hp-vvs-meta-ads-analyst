export default function ConvertLoading() {
  return (
    <div className="space-y-6" aria-label="Loading Convert page">
      <section className="border border-hp-rule bg-hp-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-[min(36rem,72vw)]" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {["customers", "bookings", "conversations", "gaps"].map((item) => (
            <div key={item} className="border border-hp-rule-soft p-3">
              <Skeleton className="mb-3 h-2 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden border border-hp-rule bg-hp-card">
        <div className="flex items-center justify-between border-b border-hp-rule bg-hp-inset px-5 py-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="space-y-3 px-4 py-5">
          {[92, 76, 58, 36].map((width, index) => (
            <div key={index} className="grid grid-cols-[10rem_1fr_5rem] items-center gap-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-9" style={{ width: `${width}%` }} />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="overflow-hidden border border-hp-rule bg-hp-card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-hp-rule bg-hp-inset px-5 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="divide-y divide-hp-rule-soft">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[1fr_6rem_5rem] items-center gap-4 px-4 py-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[min(18rem,44vw)]" />
                  <Skeleton className="h-3 w-[min(26rem,56vw)]" />
                </div>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden border border-hp-rule bg-hp-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-hp-rule bg-hp-inset px-5 py-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-7 w-16" />
          </div>
          <div className="divide-y divide-hp-rule-soft">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Skeleton({
  className,
  style,
}: {
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={["block animate-pulse bg-hp-inset", className].join(" ")}
      style={style}
    />
  );
}
