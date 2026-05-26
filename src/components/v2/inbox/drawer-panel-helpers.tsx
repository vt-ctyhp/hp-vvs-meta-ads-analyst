import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

export function DrawerSection({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-hp-rule px-5 py-5 last:border-b-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-hp-ink">
          {icon}
          <span className="text-[11px] uppercase tracking-[0.14em]">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function InfoLine({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string | null;
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 text-sm leading-5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      {value ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 break-all text-hp-ink underline-offset-4 hover:underline"
          >
            <span className="min-w-0 break-all">{value}</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        ) : (
          <span className="min-w-0 break-words text-hp-ink">{value}</span>
        )
      ) : (
        <span className="text-hp-muted">Not captured</span>
      )}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
  warning = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  disabled?: boolean;
  warning?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      <select
        aria-label={label}
        data-tone={warning ? "warning" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={[
          "h-10 w-full border bg-white px-3 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted",
          warning ? "border-signal-warning" : "border-hp-rule",
        ].join(" ")}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function formatDateLabel(value: string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function titleCase(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortIdentifier(value: string) {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
}
