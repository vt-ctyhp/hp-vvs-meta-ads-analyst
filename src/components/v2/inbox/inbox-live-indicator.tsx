type InboxLiveIndicatorProps = {
  live: boolean;
};

export function InboxLiveIndicator({ live }: InboxLiveIndicatorProps) {
  return (
    <p className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 ${live ? "bg-hp-pink" : "bg-hp-muted"}`}
      />
      {live ? "Live" : "Reconnecting…"}
    </p>
  );
}
