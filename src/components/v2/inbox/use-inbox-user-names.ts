"use client";

import { useEffect, useState } from "react";

// Resolve assignee names from /api/users once, cached at module scope so every
// consumer (conversation header, queue rows) shares a single fetch. Falls back
// to an empty map on failure; callers fall back to the raw id or a generic label.
let cachedUserNames: Map<string, string> | null = null;
let inflightUserNames: Promise<Map<string, string>> | null = null;

export function loadInboxUserNames(): Promise<Map<string, string>> {
  if (cachedUserNames) return Promise.resolve(cachedUserNames);
  if (inflightUserNames) return inflightUserNames;
  inflightUserNames = fetch("/api/users")
    .then((r) => (r.ok ? r.json() : { users: [] }))
    .then((payload: { users?: { id: string; fullName: string | null }[] }) => {
      const map = new Map<string, string>();
      for (const u of payload.users || []) if (u.fullName) map.set(u.id, u.fullName);
      cachedUserNames = map;
      return map;
    })
    .catch(() => new Map<string, string>());
  return inflightUserNames;
}

export function useInboxUserNames(): Map<string, string> | null {
  const [userNames, setUserNames] = useState<Map<string, string> | null>(cachedUserNames);
  useEffect(() => {
    let alive = true;
    void loadInboxUserNames().then((map) => {
      if (alive) setUserNames(map);
    });
    return () => {
      alive = false;
    };
  }, []);
  return userNames;
}
