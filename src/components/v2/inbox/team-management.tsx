"use client";

import { useCallback, useEffect, useState } from "react";

type Member = { appUserId: string; fullName: string; role: "member" | "lead" };
type Team = { id: string; name: string; members: Member[]; coverage: string[] };
type TeamAdminData = {
  teams: Team[];
  salesUsers: { appUserId: string; fullName: string }[];
  categories: { key: string; label: string }[];
};

const FIELD =
  "border border-hp-rule bg-white px-3 py-2 text-sm text-hp-body outline-none focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted";
const BTN =
  "border border-hp-rule px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50";

export function TeamManagement() {
  const [data, setData] = useState<TeamAdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [addSel, setAddSel] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/social-inbox/team/manage");
      if (!r.ok) throw new Error(`Failed to load teams (${r.status})`);
      setData((await r.json()) as TeamAdminData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load teams.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/social-inbox/team/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`Action failed (${r.status})`);
      setData((await r.json()) as TeamAdminData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="border-t border-hp-rule pt-6">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">Teams &amp; Coverage</h2>

      {error ? (
        <p className="mt-3 border border-signal-warning bg-signal-warning-bg px-3 py-2 text-xs leading-5 text-hp-body">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            New team
          </span>
          <input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="e.g. US Sales"
            disabled={busy}
            className={FIELD}
          />
        </label>
        <button
          type="button"
          disabled={busy || !newTeamName.trim()}
          onClick={async () => {
            await act({ action: "create_team", name: newTeamName });
            setNewTeamName("");
          }}
          className={BTN}
        >
          Create team
        </button>
      </div>

      {!data ? (
        <p className="mt-4 text-sm text-hp-muted">Loading teams…</p>
      ) : data.teams.length === 0 ? (
        <p className="mt-4 text-sm text-hp-muted">No teams yet. Create one above.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {data.teams.map((team) => {
            const memberIds = new Set(team.members.map((m) => m.appUserId));
            const addable = data.salesUsers.filter((u) => !memberIds.has(u.appUserId));
            const selected = addSel[team.id] ?? "";
            return (
              <section key={team.id} className="border border-hp-rule bg-hp-card p-4">
                <header className="flex items-center justify-between gap-3 border-b border-hp-rule pb-3">
                  <h3 className="font-title text-lg text-hp-ink">{team.name}</h3>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete team "${team.name}"? Members and coverage are removed.`)) {
                        void act({ action: "delete_team", teamId: team.id });
                      }
                    }}
                    className="text-[10px] uppercase tracking-[0.14em] text-hp-muted transition hover:text-signal-warning"
                  >
                    Delete
                  </button>
                </header>

                {/* Members */}
                <div className="mt-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Members</span>
                  {team.members.length === 0 ? (
                    <p className="mt-1 text-sm text-hp-muted">No members yet.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-hp-rule border border-hp-rule">
                      {team.members.map((m) => (
                        <li key={m.appUserId} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm text-hp-body">
                            {m.fullName}
                            {m.role === "lead" ? (
                              <span className="ml-2 border border-hp-rule px-1.5 py-px text-[9px] uppercase tracking-[0.14em] text-hp-ink">
                                Lead
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void act({
                                  action: "set_member_role",
                                  teamId: team.id,
                                  appUserId: m.appUserId,
                                  role: m.role === "lead" ? "member" : "lead",
                                })
                              }
                              className="text-[10px] uppercase tracking-[0.14em] text-hp-muted transition hover:text-hp-ink"
                            >
                              {m.role === "lead" ? "Make member" : "Make lead"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void act({
                                  action: "remove_member",
                                  teamId: team.id,
                                  appUserId: m.appUserId,
                                })
                              }
                              className="text-[10px] uppercase tracking-[0.14em] text-hp-muted transition hover:text-signal-warning"
                            >
                              Remove
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Add member */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={selected}
                      disabled={busy || addable.length === 0}
                      onChange={(e) => setAddSel((s) => ({ ...s, [team.id]: e.target.value }))}
                      className={FIELD}
                    >
                      <option value="">
                        {addable.length === 0 ? "All sales users added" : "Add a sales user…"}
                      </option>
                      {addable.map((u) => (
                        <option key={u.appUserId} value={u.appUserId}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || !selected}
                      onClick={async () => {
                        await act({
                          action: "add_member",
                          teamId: team.id,
                          appUserId: selected,
                          role: "member",
                        });
                        setAddSel((s) => ({ ...s, [team.id]: "" }));
                      }}
                      className={BTN}
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Coverage */}
                <div className="mt-4">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    Covers categories (auto-assign pool)
                  </span>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {data.categories.map((c) => {
                      const checked = team.coverage.includes(c.key);
                      return (
                        <label key={c.key} className="flex items-center gap-2 text-sm text-hp-body">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={() => {
                              const next = checked
                                ? team.coverage.filter((k) => k !== c.key)
                                : [...team.coverage, c.key];
                              void act({ action: "set_coverage", teamId: team.id, categoryKeys: next });
                            }}
                          />
                          {c.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
