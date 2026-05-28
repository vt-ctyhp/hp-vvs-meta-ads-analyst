import Link from "next/link";

export function LeadNudge({ teammatesOverSla }: { teammatesOverSla: number }) {
  if (teammatesOverSla <= 0) return null;
  const noun = teammatesOverSla === 1 ? "teammate" : "teammates";
  return (
    <div
      data-component="inbox-lead-nudge"
      className="flex items-baseline gap-2 px-1 py-2 text-[11px] text-hp-muted smallcaps"
    >
      <span className="text-signal-warning lining-nums">
        {teammatesOverSla} {noun} over SLA today
      </span>
      <span aria-hidden>·</span>
      <Link href="/m/inbox/team" className="text-hp-ink underline-offset-2 hover:underline">
        view team →
      </Link>
    </div>
  );
}
