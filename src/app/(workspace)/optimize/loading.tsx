export default function OptimizeLoading() {
  return (
    <div className="space-y-6" aria-label="Loading Optimize page">
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-[min(34rem,72vw)]" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {["spend", "creatives", "winners", "review"].map((item) => (
            <div key={item} className="rounded-lg border border-stone-100 p-3">
              <Skeleton className="mb-3 h-2 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="flex h-56 items-end gap-2 border-b border-l border-stone-100 px-2 pb-2">
          {[42, 68, 54, 80, 48, 72, 60, 86, 58, 74, 64, 78].map((height, index) => (
            <div key={index} className="flex flex-1 items-end">
              <Skeleton className="w-full rounded-t-sm" style={{ height }} />
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
        <div className="border-t border-stone-200" />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-3 py-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-40" />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="grid grid-cols-[minmax(18rem,1fr)_repeat(5,minmax(6rem,8rem))] border-b border-stone-200 bg-stone-50 px-3 py-2">
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="ml-auto h-3 w-14" />
          ))}
        </div>
        <div className="divide-y divide-stone-100">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(18rem,1fr)_repeat(5,minmax(6rem,8rem))] items-center px-3 py-3"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-5 w-6" />
                <Skeleton className="h-4 w-[min(22rem,42vw)]" />
              </div>
              {Array.from({ length: 5 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="ml-auto h-4 w-16" />
              ))}
            </div>
          ))}
        </div>
      </section>
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
      className={["block animate-pulse rounded bg-stone-200/80", className].join(" ")}
      style={style}
    />
  );
}
