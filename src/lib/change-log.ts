import {
  createAdsAnalystClient,
  getAdsAnalystEnvironment,
  withAdsAnalystEnvironment,
} from "./ads-analyst-db.ts";
import { entryIntersectsWindow } from "./change-log-window.ts";
import type {
  ChangeLogDraft, ChangeLogEntry, ChangeLogEntityRef, ChangeLogWindow,
} from "./change-log-types.ts";

type Actor = { appUserId: string | null; email: string | null };

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

type JsonRecord = Record<string, unknown>;
type DynamicQueryResult = { data: JsonRecord[] | null; error: Error | null };
type DynamicSingleResult = { data: JsonRecord | null; error: Error | null };
type DynamicQuery = PromiseLike<DynamicQueryResult> & {
  eq: (column: string, value: string | number | boolean | null) => DynamicQuery;
  in: (column: string, values: (string | number)[]) => DynamicQuery;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => DynamicQuery;
  limit: (count: number) => DynamicQuery;
  select: (columns: string) => DynamicQuery;
  single: () => Promise<DynamicSingleResult>;
};
type DynamicUpdateQuery = DynamicQuery & {
  select: (columns: string) => DynamicQuery;
};
type DynamicTable = {
  select: (columns: string) => DynamicQuery;
  insert: (row: JsonRecord | JsonRecord[]) => DynamicQuery;
  update: (row: JsonRecord) => DynamicUpdateQuery;
};
type DynamicRpcResult = { data: unknown; error: Error | null };
type DynamicSupabaseClient = {
  from: (table: string) => DynamicTable;
  rpc: (fn: string, params?: JsonRecord) => PromiseLike<DynamicRpcResult>;
};
function db(): DynamicSupabaseClient {
  return createAdsAnalystClient("web") as unknown as DynamicSupabaseClient;
}

type EntityRow = {
  entry_id: string; entity_kind: string; entity_meta_id: string | null;
  entity_name: string; match_status: string;
};
type EntryRow = {
  id: string; brand_code: string; meta_account_id: string | null;
  event_date: string; effective_start: string | null; effective_end: string | null;
  change_type: string; title: string; reason: string;
  before_value: string | null; after_value: string | null;
  verify_entity: string; verify_value: string;
  created_by_email: string | null; created_at: string;
};

function mapEntry(row: EntryRow, entities: ChangeLogEntityRef[], citationCount: number): ChangeLogEntry {
  return {
    id: row.id,
    brandCode: row.brand_code as ChangeLogEntry["brandCode"],
    metaAccountId: row.meta_account_id,
    eventDate: row.event_date,
    effectiveStart: row.effective_start,
    effectiveEnd: row.effective_end,
    changeType: row.change_type as ChangeLogEntry["changeType"],
    title: row.title,
    reason: row.reason,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    verifyEntity: row.verify_entity as ChangeLogEntry["verifyEntity"],
    verifyValue: row.verify_value as ChangeLogEntry["verifyValue"],
    entities,
    citationCount,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
  };
}

async function hydrate(rows: EntryRow[]): Promise<ChangeLogEntry[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const supabase = db();
  const [{ data: entityRows }, { data: citationRows }] = await Promise.all([
    supabase.from("change_log_entry_entities").select("*").in("entry_id", ids),
    supabase.from("change_log_citations").select("entry_id").in("entry_id", ids),
  ]);
  const byEntry = new Map<string, ChangeLogEntityRef[]>();
  for (const e of (entityRows ?? []) as EntityRow[]) {
    const ref: ChangeLogEntityRef = {
      entityKind: e.entity_kind as ChangeLogEntityRef["entityKind"],
      entityMetaId: e.entity_meta_id,
      entityName: e.entity_name,
      matchStatus: e.match_status as ChangeLogEntityRef["matchStatus"],
    };
    byEntry.set(e.entry_id, [...(byEntry.get(e.entry_id) ?? []), ref]);
  }
  const counts = new Map<string, number>();
  for (const c of (citationRows ?? []) as { entry_id: string }[]) {
    counts.set(c.entry_id, (counts.get(c.entry_id) ?? 0) + 1);
  }
  return rows.map((r) => mapEntry(r, byEntry.get(r.id) ?? [], counts.get(r.id) ?? 0));
}

export async function listChangeLogEntries(): Promise<ChangeLogEntry[]> {
  const supabase = db();
  const { data, error } = await supabase
    .from("change_log_entries")
    .select("*")
    .eq("environment", getAdsAnalystEnvironment())
    .eq("status", "active")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrate((data ?? []) as EntryRow[]);
}

export async function getChangeLogEntriesForWindow(input: {
  brandCode?: string | null;
  entityMetaIds?: string[];
  window: ChangeLogWindow;
}): Promise<ChangeLogEntry[]> {
  const all = await listChangeLogEntries();
  return all.filter((e) => {
    if (input.brandCode && e.brandCode !== input.brandCode) return false;
    if (input.entityMetaIds && input.entityMetaIds.length > 0) {
      const ids = new Set(input.entityMetaIds);
      if (!e.entities.some((x) => x.entityMetaId && ids.has(x.entityMetaId))) return false;
    }
    return entryIntersectsWindow(e, input.window);
  });
}

export async function createChangeLogEntry(draft: ChangeLogDraft, actor: Actor): Promise<string> {
  const supabase = db();
  // Atomic: a Postgres function inserts the entry, its entities, and the
  // 'create' revision in one transaction so a mid-sequence failure can no
  // longer leave an orphan entry (active, listed, AI-fed) with no entities
  // and no audit row. Environment scoping lives in the function, mirroring
  // the column default / RLS policy, so withAdsAnalystEnvironment is not used here.
  const { data, error } = await supabase.rpc("create_change_log_entry", {
    p_brand_code: draft.brandCode,
    p_meta_account_id: null,
    p_event_date: draft.eventDate,
    p_effective_start: draft.effectiveStart,
    p_effective_end: draft.effectiveEnd,
    p_change_type: draft.changeType,
    p_title: draft.title,
    p_reason: draft.reason,
    p_before_value: draft.beforeValue,
    p_after_value: draft.afterValue,
    p_raw_input: draft.rawInput,
    p_verify_entity: draft.verifyEntity,
    p_verify_value: draft.verifyValue,
    p_created_by: uuidOrNull(actor.appUserId),
    p_created_by_email: actor.email,
    p_entities: draft.entities.map((e) => ({
      entity_kind: e.entityKind,
      entity_meta_id: e.entityMetaId,
      entity_name: e.entityName,
      match_status: e.matchStatus,
    })),
    p_actor_id: uuidOrNull(actor.appUserId),
    p_actor_email: actor.email,
    p_snapshot: { draft },
  });
  if (error) throw error;
  return data as string;
}

export async function updateChangeLogEntry(
  id: string,
  patch: Partial<Pick<ChangeLogEntry, "title" | "reason" | "beforeValue" | "afterValue" | "eventDate" | "effectiveStart" | "effectiveEnd" | "changeType">>,
  actor: Actor,
): Promise<void> {
  const supabase = db();
  const { error } = await supabase
    .from("change_log_entries")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
      ...(patch.beforeValue !== undefined ? { before_value: patch.beforeValue } : {}),
      ...(patch.afterValue !== undefined ? { after_value: patch.afterValue } : {}),
      ...(patch.eventDate !== undefined ? { event_date: patch.eventDate } : {}),
      ...(patch.effectiveStart !== undefined ? { effective_start: patch.effectiveStart } : {}),
      ...(patch.effectiveEnd !== undefined ? { effective_end: patch.effectiveEnd } : {}),
      ...(patch.changeType !== undefined ? { change_type: patch.changeType } : {}),
    })
    .eq("id", id)
    .eq("environment", getAdsAnalystEnvironment());
  if (error) throw error;
  await writeRevision(id, "edit", { patch }, actor);
}

export async function softDeleteChangeLogEntry(id: string, actor: Actor): Promise<void> {
  const supabase = db();
  const { error } = await supabase
    .from("change_log_entries")
    .update({ status: "deleted", deleted_at: new Date().toISOString(), deleted_by: uuidOrNull(actor.appUserId), deleted_by_email: actor.email })
    .eq("id", id)
    .eq("environment", getAdsAnalystEnvironment());
  if (error) throw error;
  await writeRevision(id, "delete", {}, actor);
}

async function writeRevision(entryId: string, action: "create" | "edit" | "delete" | "restore", snapshot: unknown, actor: Actor): Promise<void> {
  const supabase = db();
  const { error } = await supabase
    .from("change_log_entry_revisions")
    .insert(withAdsAnalystEnvironment({
      entry_id: entryId,
      action,
      snapshot,
      actor_id: uuidOrNull(actor.appUserId),
      actor_email: actor.email,
    }));
  if (error) throw error;
}
