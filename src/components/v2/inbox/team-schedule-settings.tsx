"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

// ---------------------------------------------------------------------------
// Types (mirrored from the API response shape)
// ---------------------------------------------------------------------------

type ScheduleEntry = { weekday: number; startTime: string; endTime: string };

type MemberRow = {
  appUserId: string;
  fullName: string;
  autoAssignEligible: boolean;
  timezone: string | null;
  schedules: ScheduleEntry[];
};

type State = {
  loading: boolean;
  error: string | null;
  members: MemberRow[];
  saving: Record<string, boolean>; // appUserId -> saving
  saveErr: Record<string, boolean>; // appUserId -> save failed
};

type Action =
  | { type: "load_start" }
  | { type: "load_ok"; members: MemberRow[] }
  | { type: "load_err"; error: string }
  | { type: "patch_eligible"; appUserId: string; value: boolean }
  | { type: "patch_time"; appUserId: string; weekday: number; field: "startTime" | "endTime"; value: string }
  | { type: "save_start"; appUserId: string }
  | { type: "save_done"; appUserId: string }
  | { type: "save_err"; appUserId: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load_start":
      return { ...state, loading: true, error: null };
    case "load_ok":
      return { ...state, loading: false, members: action.members };
    case "load_err":
      return { ...state, loading: false, error: action.error };
    case "patch_eligible":
      return {
        ...state,
        members: state.members.map((m) =>
          m.appUserId === action.appUserId ? { ...m, autoAssignEligible: action.value } : m,
        ),
      };
    case "patch_time": {
      return {
        ...state,
        members: state.members.map((m) => {
          if (m.appUserId !== action.appUserId) return m;
          const existing = m.schedules.find((s) => s.weekday === action.weekday);
          let schedules: ScheduleEntry[];
          if (existing) {
            schedules = m.schedules.map((s) =>
              s.weekday === action.weekday ? { ...s, [action.field]: action.value } : s,
            );
          } else {
            schedules = [
              ...m.schedules,
              { weekday: action.weekday, startTime: "", endTime: "", [action.field]: action.value },
            ];
          }
          return { ...m, schedules };
        }),
      };
    }
    case "save_start":
      return { ...state, saving: { ...state.saving, [action.appUserId]: true }, saveErr: { ...state.saveErr, [action.appUserId]: false } };
    case "save_done":
      return { ...state, saving: { ...state.saving, [action.appUserId]: false } };
    case "save_err":
      return { ...state, saving: { ...state.saving, [action.appUserId]: false }, saveErr: { ...state.saveErr, [action.appUserId]: true } };
    default:
      return state;
  }
}

const INITIAL_STATE: State = { loading: true, error: null, members: [], saving: {}, saveErr: {} };

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeamScheduleSettings() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  // Debounce saves per member
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    dispatch({ type: "load_start" });
    fetch("/api/social-inbox/team/schedules")
      .then((r) => r.json())
      .then((data: { members?: MemberRow[]; error?: string }) => {
        if (data.error) {
          dispatch({ type: "load_err", error: data.error });
        } else {
          dispatch({ type: "load_ok", members: data.members ?? [] });
        }
      })
      .catch(() => dispatch({ type: "load_err", error: "Failed to load schedule settings." }));
  }, []);

  const schedulePatch = useCallback(
    (member: MemberRow) => {
      const uid = member.appUserId;
      clearTimeout(saveTimers.current[uid]);
      dispatch({ type: "save_start", appUserId: uid });
      saveTimers.current[uid] = setTimeout(async () => {
        try {
          const schedules = Array.from({ length: 7 }, (_, weekday) => {
            const entry = member.schedules.find((s) => s.weekday === weekday);
            return {
              weekday,
              startTime: entry?.startTime ?? null,
              endTime: entry?.endTime ?? null,
            };
          });
          const response = await fetch("/api/social-inbox/team/schedules", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appUserId: uid, schedules }),
          });
          if (!response.ok) throw new Error(`Save failed (${response.status})`);
          dispatch({ type: "save_done", appUserId: uid });
        } catch {
          dispatch({ type: "save_err", appUserId: uid });
        }
      }, 600);
    },
    [],
  );

  const eligibilityPatch = useCallback(async (appUserId: string, value: boolean) => {
    dispatch({ type: "patch_eligible", appUserId, value });
    dispatch({ type: "save_start", appUserId });
    try {
      const response = await fetch("/api/social-inbox/team/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appUserId, autoAssignEligible: value }),
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      dispatch({ type: "save_done", appUserId });
    } catch {
      dispatch({ type: "save_err", appUserId });
    }
  }, []);

  if (state.loading) {
    return (
      <div className="border border-hp-rule px-4 py-6 text-[11px] smallcaps text-hp-muted">
        Loading schedule settings…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="border border-hp-rule bg-hp-inset px-4 py-4 text-[12px] text-hp-ink">
        {state.error}
      </div>
    );
  }

  if (state.members.length === 0) {
    return (
      <div className="border border-hp-rule bg-hp-card px-4 py-6 text-center text-[11px] smallcaps text-hp-muted">
        No managed team members found.
      </div>
    );
  }

  return (
    <section data-component="team-schedule-settings" className="mt-8">
      <header className="border-b border-hp-rule px-1 pb-2">
        <h2 className="text-[10px] smallcaps tracking-widest text-hp-muted uppercase">
          Auto-Assign Eligibility &amp; Schedules
        </h2>
      </header>

      <div className="mt-4 divide-y divide-hp-rule border border-hp-rule">
        {state.members.map((member) => {
          const isSaving = state.saving[member.appUserId] ?? false;
          const hasSaveErr = state.saveErr[member.appUserId] ?? false;
          return (
            <MemberScheduleRow
              key={member.appUserId}
              member={member}
              isSaving={isSaving}
              hasSaveErr={hasSaveErr}
              onEligibilityChange={(value) => eligibilityPatch(member.appUserId, value)}
              onTimeChange={(weekday, field, value) => {
                dispatch({ type: "patch_time", appUserId: member.appUserId, weekday, field, value });
                // Re-read member from state after dispatch via functional update
                // We pass the updated member via a deferred ref in the save
                const updated: MemberRow = {
                  ...member,
                  schedules: (() => {
                    const existing = member.schedules.find((s) => s.weekday === weekday);
                    if (existing) {
                      return member.schedules.map((s) =>
                        s.weekday === weekday ? { ...s, [field]: value } : s,
                      );
                    }
                    return [
                      ...member.schedules,
                      { weekday, startTime: "", endTime: "", [field]: value },
                    ];
                  })(),
                };
                schedulePatch(updated);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: one member row
// ---------------------------------------------------------------------------

function MemberScheduleRow({
  member,
  isSaving,
  hasSaveErr,
  onEligibilityChange,
  onTimeChange,
}: {
  member: MemberRow;
  isSaving: boolean;
  hasSaveErr: boolean;
  onEligibilityChange: (value: boolean) => void;
  onTimeChange: (weekday: number, field: "startTime" | "endTime", value: string) => void;
}) {
  return (
    <div className="bg-white px-4 py-4">
      {/* Member header row */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-3">
          <span className="font-title text-[14px] text-hp-ink">{member.fullName}</span>
          {member.timezone && (
            <span className="text-[10px] smallcaps text-hp-muted">{member.timezone}</span>
          )}
          {isSaving && (
            <span className="text-[10px] smallcaps text-hp-muted">saving…</span>
          )}
          {!isSaving && hasSaveErr && (
            <span className="text-[10px] smallcaps text-signal-warning border border-signal-warning px-1">Save failed</span>
          )}
        </div>
        {/* Eligibility toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-[10px] smallcaps text-hp-muted uppercase tracking-widest">
            Auto-assign
          </span>
          <input
            type="checkbox"
            checked={member.autoAssignEligible}
            onChange={(e) => onEligibilityChange(e.target.checked)}
            className="h-3.5 w-3.5 border border-hp-rule accent-hp-ink"
          />
        </label>
      </div>

      {/* Weekday schedule grid */}
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const entry = member.schedules.find((s) => s.weekday === weekday);
          const start = entry?.startTime ?? "";
          const end = entry?.endTime ?? "";
          return (
            <div key={weekday} className="flex flex-col gap-1">
              <span className="text-[9px] smallcaps text-hp-muted text-center">{label}</span>
              <input
                type="time"
                value={start}
                onChange={(e) => onTimeChange(weekday, "startTime", e.target.value)}
                title={`${label} start`}
                className="w-full border border-hp-rule bg-hp-inset px-1 py-0.5 text-[11px] text-hp-ink focus:outline-none focus:ring-0"
              />
              <input
                type="time"
                value={end}
                onChange={(e) => onTimeChange(weekday, "endTime", e.target.value)}
                title={`${label} end`}
                className="w-full border border-hp-rule bg-hp-inset px-1 py-0.5 text-[11px] text-hp-ink focus:outline-none focus:ring-0"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
