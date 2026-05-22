import type { UserRole } from "@/lib/access-control";
import { ROLE_LABELS } from "@/lib/access-control";

export type RosterEntry = {
  appUserId: string | null;
  authUserId: string | null;
  email: string;
  fullName: string;
  initials: string | null;
  active: boolean;
  roles: UserRole[];
};

type Props = {
  roster: RosterEntry[];
  erpManagementUrl?: string | null;
};

/**
 * Users route — read-only roster of internal teammates.
 *
 * Data flows through `analytics.ads_analyst_identity_profiles_v1` so we
 * never read Sales/ERP Core tables directly. The Ads Analyst app does
 * not write to user/role state; the callout points operators at the ERP
 * where roster management lives.
 */

export function PeopleRoster({ roster, erpManagementUrl }: Props) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p>
          Roster reads through{" "}
          <code className="rounded bg-amber-100 px-1">
            analytics.ads_analyst_identity_profiles_v1
          </code>
          . The Ads Analyst app does not edit users or roles — those changes
          happen in the ERP system.
          {erpManagementUrl ? (
            <>
              {" "}
              <a
                href={erpManagementUrl}
                className="font-medium underline hover:no-underline"
                target="_blank"
                rel="noreferrer"
              >
                Open in ERP →
              </a>
            </>
          ) : null}
        </p>
      </section>

      <section
        aria-label="Internal roster"
        className="overflow-hidden rounded-xl border border-stone-200 bg-white"
      >
        <header className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs uppercase tracking-wider text-stone-600">
          <span>Teammates</span>
          <span>{roster.length}</span>
        </header>
        {roster.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-stone-500">
            No teammates returned from the identity view.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-stone-500">
              <tr className="border-b border-stone-200">
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Roles</Th>
              </tr>
            </thead>
            <tbody>
              {roster
                .slice()
                .sort((a, b) => a.fullName.localeCompare(b.fullName))
                .map((entry) => (
                  <tr key={entry.appUserId ?? entry.email} className="border-b border-stone-100">
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-[10px] font-semibold text-stone-50">
                          {entry.initials ?? defaultInitials(entry.fullName)}
                        </span>
                        <span className="font-medium text-stone-900">
                          {entry.fullName}
                        </span>
                      </div>
                    </Td>
                    <Td className="text-stone-700">{entry.email}</Td>
                    <Td>
                      <ActiveChip active={entry.active} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {entry.roles.length === 0 ? (
                          <span className="text-stone-400">—</span>
                        ) : (
                          entry.roles.map((role) => (
                            <span
                              key={role}
                              className="inline-flex h-5 items-center rounded-full border border-stone-300 bg-white px-2 text-[10px] text-stone-700"
                            >
                              {ROLE_LABELS[role] ?? role}
                            </span>
                          ))
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-semibold">{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 align-middle text-stone-800 ${className ?? ""}`}>
      {children}
    </td>
  );
}

function ActiveChip({ active }: { active: boolean }) {
  return (
    <span
      className={
        "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium " +
        (active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-stone-200 bg-stone-50 text-stone-600")
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function defaultInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "—"
  );
}
