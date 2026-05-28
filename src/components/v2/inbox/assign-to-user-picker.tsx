"use client";

import { useEffect, useState } from "react";

type ActiveUser = { id: string; fullName: string | null; initials: string | null };

export function AssignToUserPicker({
  disabled,
  onAssign,
}: {
  disabled: boolean;
  onAssign: (targetUserId: string) => void;
}) {
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then(
        (payload: {
          users?: {
            id: string;
            fullName: string | null;
            initials: string | null;
            active: boolean;
          }[];
        }) => {
          if (cancelled) return;
          const active = (payload.users || [])
            .filter((u) => u.active)
            .map((u) => ({ id: u.id, fullName: u.fullName, initials: u.initials }));
          setUsers(active);
        },
      )
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Assign to
      </span>
      <select
        value={value}
        disabled={disabled || users.length === 0}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          if (next) onAssign(next);
        }}
        className="w-full border border-hp-rule bg-white px-3 py-2 text-sm text-hp-body outline-none focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted"
      >
        <option value="">Select a teammate…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.fullName || u.initials || u.id}
          </option>
        ))}
      </select>
    </label>
  );
}
