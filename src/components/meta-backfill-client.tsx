"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Database,
  Loader2,
  Lock,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Search,
  Shield,
  Square,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";

import type { AppPermission } from "@/lib/access-control";
import { createBrowserClient } from "@/lib/supabase";

type BackfillStatus = "pending" | "running" | "paused" | "success" | "partial" | "failed" | "canceled";
type ChunkStatus = "queued" | "running" | "success" | "failed" | "canceled";

type BackfillJob = {
  id: string;
  status: BackfillStatus;
  requestedStart: string;
  requestedEnd: string;
  accounts: Array<{ brandCode: string; metaAccountId: string }>;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  runningChunks: number;
  metrics: unknown;
  errors: unknown;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BackfillChunk = {
  id: string;
  jobId: string;
  metaAccountId: string;
  brandCode: string;
  startDate: string;
  endDate: string;
  status: ChunkStatus;
  attempts: number;
  insightRows: number;
  error: string | null;
  lockedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type HistoryCoverage = {
  metaAccountId: string;
  accountName: string | null;
  month: string;
  insightRows: number;
  firstDate: string | null;
  lastDate: string | null;
};

type BackfillState = {
  coverageRange: { start: string; end: string };
  jobs: BackfillJob[];
  chunks: BackfillChunk[];
  coverage: HistoryCoverage[];
};

type DataHealth = {
  generatedAt: string;
  syncPolicy: {
    incrementalDatePreset: string;
    incrementalRefreshDays: number;
    finalizedCutoffDate: string;
    finalizedRows: number;
    refreshableRows: number;
  };
  insights: {
    totalRows: number;
    uniqueAccountAdDateKeys: number;
    duplicateKeyCount: number;
    duplicateSamples?: Array<{ key: string; count: number; spend: number }>;
    nullKeyRows: number;
    dateRange: { min: string | null; max: string | null };
  };
  checks: {
    duplicateRowsOk: boolean;
    nullKeysOk: boolean;
    hasInsightRows: boolean;
    spendJumpsOk: boolean;
    recentSyncWarningsOk: boolean;
  };
  accounts: Array<{
    metaAccountId: string | null;
    name: string | null;
    lastSyncedAt: string | null;
    updatedAt: string | null;
  }>;
  lastSync: {
    id: string | null;
    trigger: string | null;
    status: string | null;
    startedAt: string | null;
    completedAt: string | null;
    warnings: string[];
    errors: unknown;
  } | null;
  monthlyTotals: MonthlyDiagnostic[];
  lockedMonths: MonthlyDiagnostic[];
  monthlyUmbrella: Array<{
    month: string;
    campaignUmbrella: string;
    rows: number;
    spend: number;
    leads: number;
    bookings: number;
    conversions: number;
  }>;
  spendAlerts: Array<{
    month: string;
    campaignUmbrella: string;
    spend: number;
    previousSpend: number;
    spendDelta: number;
    spendDeltaPct: number;
  }>;
  warnings: string[];
  metaComparison: {
    month: string;
    start: string;
    end: string;
    comparedAt: string;
    accounts: Array<{
      brandCode: string;
      metaAccountId: string;
      supabase: MetricTotals;
      meta: MetricTotals;
      delta: MetricTotals;
      spendDeltaPct: number | null;
    }>;
    totals: {
      supabase: MetricTotals;
      meta: MetricTotals;
      delta: MetricTotals;
      spendDeltaPct: number | null;
    } | null;
    error: string | null;
  } | null;
  recentSyncRuns: Array<{
    id: string | null;
    trigger: string | null;
    status: string | null;
    startedAt: string | null;
    completedAt: string | null;
    metrics: {
      audit?: {
        warnings?: string[];
      };
    } & Record<string, unknown>;
    errors: unknown;
  }>;
};

type MetricTotals = {
  rows: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  bookings: number;
  conversions: number;
};

type MonthlyDiagnostic = MetricTotals & {
  month: string;
  monthStart: string;
  monthEnd: string;
  lockStatus: "locked" | "settling" | "active";
  isLocked: boolean;
  previousSpend: number | null;
  spendDelta: number;
  spendDeltaPct: number | null;
};

const STATUS_CLASS: Record<BackfillStatus | ChunkStatus, string> = {
  pending: "border-hp-rule bg-hp-inset text-hp-body",
  queued: "border-hp-rule bg-hp-inset text-hp-body",
  running: "border-hp-pink/30 bg-hp-pink/10 text-hp-ink",
  paused: "border-signal-warning/30 bg-signal-warning/10 text-signal-warning",
  success: "border-signal-positive/30 bg-signal-positive/10 text-signal-positive",
  partial: "border-signal-warning/30 bg-signal-warning/10 text-signal-warning",
  failed: "border-signal-danger/30 bg-signal-danger/10 text-signal-danger",
  canceled: "border-hp-muted/30 bg-hp-inset text-hp-muted",
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

async function readOnlyRequest<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(path, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload as T;
}

type MetaBackfillClientProps = {
  initialState?: BackfillState | null;
  initialDataHealth?: DataHealth | null;
  initialError?: string | null;
};

type AccessState = {
  status: "loading" | "signed-out" | "denied" | "ready";
  permissions: AppPermission[];
  accessToken: string | null;
};

export function MetaBackfillClient({
  initialState = null,
  initialDataHealth = null,
  initialError = null,
}: MetaBackfillClientProps = {}) {
  const [access, setAccess] = useState<AccessState>({
    status: "loading",
    permissions: [],
    accessToken: null,
  });
  const [secret, setSecret] = useState("");
  const [startDate, setStartDate] = useState("2007-01-01");
  const [endDate, setEndDate] = useState(todayString());
  const [state, setState] = useState<BackfillState | null>(initialState);
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(initialDataHealth);
  const [compareMonth, setCompareMonth] = useState(todayString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [readOnlyLoaded, setReadOnlyLoaded] = useState(Boolean(initialState || initialDataHealth));
  const [status, setStatus] = useState(
    initialError ? `Could not load read-only admin data: ${initialError}` : "",
  );

  const coverageSummary = useMemo(() => summarizeCoverage(state?.coverage || []), [state]);
  const hasSecret = Boolean(secret.trim());
  const canManageBackfill = access.permissions.includes("manage_backfill");
  const operatorReady = canManageBackfill && hasSecret;

  useEffect(() => {
    let mounted = true;
    const supabase = createBrowserClient();

    async function loadAccess() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (mounted) setAccess({ status: "signed-out", permissions: [], accessToken: null });
        return;
      }

      const response = await fetch("/api/auth/me", {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      const permissions = Array.isArray(payload?.permissions)
        ? (payload.permissions as AppPermission[])
        : [];

      if (!payload?.authenticated) {
        if (mounted) setAccess({ status: "signed-out", permissions: [], accessToken: null });
        return;
      }

      if (!permissions.includes("view_backfill") && !permissions.includes("manage_backfill")) {
        if (mounted) setAccess({ status: "denied", permissions, accessToken: token });
        return;
      }

      if (mounted) setAccess({ status: "ready", permissions, accessToken: token });
    }

    void loadAccess();
    const subscription = supabase.auth.onAuthStateChange(() => {
      void loadAccess();
    });

    return () => {
      mounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (access.status !== "ready" || !access.accessToken || readOnlyLoaded) return;

    async function loadReadOnlyData() {
      if (!access.accessToken) return;

      setLoading(true);
      setStatus("");
      try {
        const query = new URLSearchParams();
        if (startDate) query.set("start", startDate);
        if (endDate) query.set("end", endDate);

        const [nextState, nextHealth] = await Promise.all([
          readOnlyRequest<BackfillState>(`/api/meta/backfill?${query.toString()}`, access.accessToken),
          readOnlyRequest<DataHealth>("/api/meta/data-health", access.accessToken),
        ]);

        setState(nextState);
        setDataHealth(nextHealth);
        setReadOnlyLoaded(true);
        setStatus(canManageBackfill ? "Backfill data loaded." : "Read-only backfill data loaded.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }

    void loadReadOnlyData();
  }, [
    access.accessToken,
    access.status,
    canManageBackfill,
    endDate,
    readOnlyLoaded,
    startDate,
  ]);

  async function request(path: string, init: RequestInit = {}) {
    if (!canManageBackfill) throw new Error("Admin access is required for backfill actions.");
    if (!secret.trim()) throw new Error("CRON_SECRET is required.");
    const response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-cron-secret": secret.trim(),
        ...(init.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  }

  async function loadState(nextStatus = "Backfill state refreshed.") {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams();
      if (startDate) query.set("start", startDate);
      if (endDate) query.set("end", endDate);
      const payload = await request(`/api/meta/backfill?${query.toString()}`);
      setState(payload);
      setStatus(nextStatus);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadDataHealth(options: { compare?: boolean } = {}) {
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams();
      if (options.compare && compareMonth) query.set("compareMonth", compareMonth);
      const queryString = query.toString();
      const payload = await request(`/api/meta/data-health${queryString ? `?${queryString}` : ""}`);
      setDataHealth(payload);
      setStatus(options.compare ? `Compared ${compareMonth} against Meta.` : "Data health refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function resyncMonth(month: string) {
    const range = monthRange(month);
    const label = range ? `${range.start} to ${range.end}` : month;
    if (!window.confirm(`Re-sync ${month} from Meta and overwrite stored daily rows for ${label}?`)) return;

    setLoading(true);
    setStatus("");
    try {
      const payload = await request("/api/meta/backfill/month-resync", {
        method: "POST",
        body: JSON.stringify({ month }),
      });
      const query = new URLSearchParams();
      if (compareMonth === month) query.set("compareMonth", month);
      const queryString = query.toString();
      const health = await request(`/api/meta/data-health${queryString ? `?${queryString}` : ""}`);
      setDataHealth(health);
      const insightRows = Number(payload.metrics?.insightRows || 0);
      setStatus(
        `Re-synced ${month}: ${insightRows.toLocaleString()} insight row(s).`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function createJob() {
    setLoading(true);
    setStatus("");
    try {
      const payload = await request("/api/meta/backfill", {
        method: "POST",
        body: JSON.stringify({ startDate: startDate || null, endDate: endDate || null }),
      });
      setStatus(`Created job ${payload.id || ""}.`);
      await loadState("Backfill job created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  }

  async function runBatch() {
    setLoading(true);
    setStatus("");
    try {
      const payload = await request("/api/meta/backfill/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadState(`Processed ${payload.processed || 0} chunk(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  }

  async function updateJob(jobId: string, action: "pause" | "resume" | "cancel" | "retry_failed") {
    if (action === "cancel" && !window.confirm("Cancel queued chunks for this job?")) return;

    setLoading(true);
    setStatus("");
    try {
      await request("/api/meta/backfill", {
        method: "PATCH",
        body: JSON.stringify({ jobId, action }),
      });
      await loadState(`Job ${action.replace("_", " ")} complete.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  }

  if (access.status === "loading") {
    return (
      <BackfillAccessState
        title="Checking access"
        body="Loading your internal permissions."
      />
    );
  }

  if (access.status === "signed-out") {
    return (
      <BackfillAccessState
        title="Sign in required"
        body="Backfill access requires an approved internal account."
        actionHref="/login?next=/admin/backfill"
        actionLabel="Sign in"
      />
    );
  }

  if (access.status === "denied") {
    return (
      <BackfillAccessState
        title="Access restricted"
        body="This page is available to admin users and marketing users with read-only backfill access."
      />
    );
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <header className="mx-auto flex max-w-7xl flex-col gap-5 border-b border-hp-rule pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Meta Ads
          </span>
          <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Historical Backfill
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageBackfill ? (
            <>
              <Button onClick={() => loadState()} disabled={loading || !operatorReady} icon={RefreshCcw}>
                Refresh
              </Button>
              <Button onClick={() => loadDataHealth()} disabled={loading || !operatorReady} icon={Shield}>
                Data Health
              </Button>
              <Button onClick={runBatch} disabled={loading || !operatorReady} icon={Play} intent="primary">
                Run Batch
              </Button>
            </>
          ) : (
            <span className="border border-hp-rule bg-hp-card px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Read-only
            </span>
          )}
        </div>
      </header>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="border border-hp-rule bg-hp-card p-4">
            <PanelTitle icon={Shield} title="Access" />
            {canManageBackfill ? (
              <>
                <label className="mt-4 block text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  Operator Secret
                </label>
                <input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  className="mt-2 h-11 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none focus:border-hp-ink"
                  placeholder="Required for sync actions"
                />
                <p className="mt-2 text-xs leading-relaxed text-hp-muted">
                  Enter the secret to refresh live data, create jobs, run batches, compare
                  against Meta, or re-sync locked months.
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm leading-6 text-hp-body">
                Marketing can inspect coverage, jobs, and data health here. Sync actions and
                overrides are admin-only.
              </p>
            )}
          </section>

          {canManageBackfill ? (
            <section className="border border-hp-rule bg-hp-card p-4">
              <PanelTitle icon={CalendarClock} title="Range" />
              <div className="mt-4 grid gap-3">
                <DateInput label="Start" value={startDate} onChange={setStartDate} />
                <DateInput label="End" value={endDate} onChange={setEndDate} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button onClick={createJob} disabled={loading || !operatorReady} icon={Database} intent="primary">
                  Create Job
                </Button>
                <Button onClick={() => loadState()} disabled={loading || !operatorReady} icon={RefreshCcw}>
                  Load
                </Button>
              </div>
            </section>
          ) : null}

          <section className="border border-hp-rule bg-hp-card p-4">
            <PanelTitle icon={Database} title="Coverage" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Accounts" value={coverageSummary.accounts} />
              <Stat label="Months" value={coverageSummary.months} />
              <Stat label="Filled" value={coverageSummary.filledMonths} />
              <Stat label="Rows" value={coverageSummary.rows.toLocaleString()} />
            </div>
          </section>
        </aside>

        <section className="space-y-6">
          {status ? (
            <div className="flex items-center gap-2 border border-hp-rule bg-hp-card px-4 py-3 text-sm text-hp-ink">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              <span>{status}</span>
            </div>
          ) : null}

          <DataHealthPanel
            health={dataHealth}
            compareMonth={compareMonth}
            disabled={loading || !canManageBackfill}
            operatorReady={operatorReady}
            onCompareMonth={() => loadDataHealth({ compare: true })}
            onCompareMonthChange={setCompareMonth}
            onResyncMonth={resyncMonth}
          />

          <section className="border border-hp-rule bg-hp-card p-4">
            <div className="flex items-center justify-between gap-3">
              <PanelTitle icon={Database} title="Jobs" />
              {loading ? <Loader2 size={18} className="animate-spin text-hp-muted" /> : null}
            </div>
            <div className="mt-4 space-y-3">
              {(state?.jobs || []).map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  onAction={(action) => updateJob(job.id, action)}
                  disabled={loading || !operatorReady}
                  canManage={canManageBackfill}
                />
              ))}
              {state && state.jobs.length === 0 ? (
                <EmptyState text="No backfill jobs found for this project." />
              ) : null}
              {!state ? (
                <EmptyState
                  text={
                    canManageBackfill
                      ? "Enter the secret and load backfill state."
                      : "No read-only backfill state is available."
                  }
                />
              ) : null}
            </div>
          </section>

          <section className="border border-hp-rule bg-hp-card p-4">
            <PanelTitle icon={CalendarClock} title="Recent Chunks" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  <tr className="border-b border-hp-rule">
                    <th className="py-2 pr-3 font-normal">Account</th>
                    <th className="py-2 pr-3 font-normal">Range</th>
                    <th className="py-2 pr-3 font-normal">Status</th>
                    <th className="py-2 pr-3 font-normal">Attempts</th>
                    <th className="py-2 pr-3 font-normal">Rows</th>
                    <th className="py-2 pr-3 font-normal">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {(state?.chunks || []).slice(0, 60).map((chunk) => (
                    <tr key={chunk.id} className="border-b border-hp-rule/70">
                      <td className="py-2 pr-3 text-hp-ink">{chunk.brandCode}</td>
                      <td className="py-2 pr-3">
                        {chunk.startDate} to {chunk.endDate}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusPill status={chunk.status} />
                      </td>
                      <td className="py-2 pr-3">{chunk.attempts}</td>
                      <td className="py-2 pr-3">{chunk.insightRows.toLocaleString()}</td>
                      <td className="max-w-[260px] truncate py-2 pr-3 text-signal-danger">
                        {chunk.error || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {state && state.chunks.length === 0 ? (
                <EmptyState text="No chunks found yet." />
              ) : null}
            </div>
          </section>

          <section className="border border-hp-rule bg-hp-card p-4">
            <PanelTitle icon={CheckCircle2} title="Monthly Coverage" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  <tr className="border-b border-hp-rule">
                    <th className="py-2 pr-3 font-normal">Account</th>
                    <th className="py-2 pr-3 font-normal">Month</th>
                    <th className="py-2 pr-3 font-normal">Rows</th>
                    <th className="py-2 pr-3 font-normal">First Date</th>
                    <th className="py-2 pr-3 font-normal">Last Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(state?.coverage || [])
                    .filter((row) => row.insightRows === 0)
                    .slice(0, 80)
                    .map((row) => (
                      <tr
                        key={`${row.metaAccountId}-${row.month}`}
                        className="border-b border-hp-rule/70"
                      >
                        <td className="py-2 pr-3 text-hp-ink">
                          {row.accountName || row.metaAccountId}
                        </td>
                        <td className="py-2 pr-3">{row.month}</td>
                        <td className="py-2 pr-3">{row.insightRows.toLocaleString()}</td>
                        <td className="py-2 pr-3">{row.firstDate || "-"}</td>
                        <td className="py-2 pr-3">{row.lastDate || "-"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {state && state.coverage.every((row) => row.insightRows > 0) ? (
                <EmptyState text="No empty months in the selected coverage range." />
              ) : null}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function BackfillAccessState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-3xl border border-hp-rule bg-hp-card p-6">
        <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          HP/VVS Meta Ads
        </span>
        <h1 className="mt-3 font-title text-4xl leading-tight text-hp-ink">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-hp-body">{body}</p>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="mt-6 inline-flex bg-hp-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
          >
            {actionLabel}
          </Link>
        ) : null}
      </section>
    </main>
  );
}

function JobRow({
  job,
  canManage,
  disabled,
  onAction,
}: {
  job: BackfillJob;
  canManage: boolean;
  disabled: boolean;
  onAction: (action: "pause" | "resume" | "cancel" | "retry_failed") => void;
}) {
  const progress = job.totalChunks > 0 ? Math.round((job.completedChunks / job.totalChunks) * 100) : 0;
  const insightRows =
    typeof job.metrics === "object" && job.metrics && "insightRows" in job.metrics
      ? Number(job.metrics.insightRows || 0)
      : 0;

  return (
    <article className="border border-hp-rule bg-hp-foundation p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={job.status} />
            <span className="font-mono text-xs text-hp-muted">{job.id.slice(0, 8)}</span>
          </div>
          <h2 className="mt-2 text-lg text-hp-ink">
            {job.requestedStart} to {job.requestedEnd}
          </h2>
          <p className="mt-1 text-sm text-hp-muted">
            {job.accounts.map((account) => account.brandCode).join(", ")} ·{" "}
            {insightRows.toLocaleString()} insight rows
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {job.status === "running" ? (
              <IconButton label="Pause" icon={Pause} disabled={disabled} onClick={() => onAction("pause")} />
            ) : null}
            {job.status === "paused" || job.status === "partial" || job.status === "failed" ? (
              <IconButton label="Resume" icon={Play} disabled={disabled} onClick={() => onAction("resume")} />
            ) : null}
            {job.failedChunks > 0 ? (
              <IconButton
                label="Retry failed"
                icon={RotateCcw}
                disabled={disabled}
                onClick={() => onAction("retry_failed")}
              />
            ) : null}
            {job.status !== "success" && job.status !== "canceled" ? (
              <IconButton label="Cancel" icon={Square} disabled={disabled} onClick={() => onAction("cancel")} />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 h-2 overflow-hidden bg-hp-inset">
        <div className="h-full bg-hp-pink" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
        <SmallMetric label="Completed" value={`${job.completedChunks}/${job.totalChunks}`} />
        <SmallMetric label="Running" value={job.runningChunks.toLocaleString()} />
        <SmallMetric label="Failed" value={job.failedChunks.toLocaleString()} />
        <SmallMetric label="Updated" value={formatDateTime(job.updatedAt)} />
      </div>
      {Array.isArray(job.errors) && job.errors.length ? (
        <div className="mt-3 flex items-start gap-2 border border-signal-danger/30 bg-signal-danger/10 p-3 text-sm text-signal-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{String(job.errors[0])}</span>
        </div>
      ) : null}
    </article>
  );
}

function DataHealthPanel({
  health,
  compareMonth,
  disabled,
  operatorReady,
  onCompareMonth,
  onCompareMonthChange,
  onResyncMonth,
}: {
  health: DataHealth | null;
  compareMonth: string;
  disabled: boolean;
  operatorReady: boolean;
  onCompareMonth: () => void;
  onCompareMonthChange: (month: string) => void;
  onResyncMonth: (month: string) => void;
}) {
  const recentWarnings = (health?.warnings || []).slice(0, 8);
  const recentUmbrellaRows = (health?.monthlyUmbrella || []).slice(-12).reverse();
  const recentMonthlyRows = (health?.monthlyTotals || []).slice(-12).reverse();
  const lockedRows = (health?.lockedMonths || []).slice(-8).reverse();
  const maxRecentSpend = Math.max(...recentMonthlyRows.map((row) => row.spend), 1);
  const checks = health
    ? [
        {
          label: "Duplicate account/ad/date keys",
          ok: health.checks.duplicateRowsOk,
          value: health.insights.duplicateKeyCount.toLocaleString(),
        },
        {
          label: "Missing required insight keys",
          ok: health.checks.nullKeysOk,
          value: health.insights.nullKeyRows.toLocaleString(),
        },
        {
          label: "Stored insight history",
          ok: health.checks.hasInsightRows,
          value: health.insights.totalRows.toLocaleString(),
        },
        {
          label: "Unusual spend jumps",
          ok: health.checks.spendJumpsOk,
          value: health.spendAlerts.length.toLocaleString(),
        },
        {
          label: "Recent sync warnings",
          ok: health.checks.recentSyncWarningsOk,
          value: (health.lastSync?.warnings.length || 0).toLocaleString(),
        },
      ]
    : [];

  return (
    <section className="border border-hp-rule bg-hp-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <PanelTitle icon={Shield} title="Data Health Dashboard" />
        {health ? (
          <span className="text-xs text-hp-muted">Checked {formatDateTime(health.generatedAt)}</span>
        ) : null}
      </div>

      {health ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Stat label="Insight Rows" value={health.insights.totalRows.toLocaleString()} />
            <Stat label="Duplicate Keys" value={health.insights.duplicateKeyCount.toLocaleString()} />
            <Stat label="Null Keys" value={health.insights.nullKeyRows.toLocaleString()} />
            <Stat label="Locked Months" value={health.lockedMonths.length.toLocaleString()} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <SmallMetric
              label="Date Range"
              value={`${health.insights.dateRange.min || "-"} to ${health.insights.dateRange.max || "-"}`}
            />
            <SmallMetric label="Finalized Before" value={health.syncPolicy.finalizedCutoffDate} />
            <SmallMetric label="Refresh Window" value={health.syncPolicy.incrementalDatePreset} />
            <SmallMetric
              label="Last Sync"
              value={
                health.lastSync
                  ? `${health.lastSync.status || "unknown"} · ${formatDateTime(health.lastSync.completedAt || health.lastSync.startedAt)}`
                  : "-"
              }
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {checks.map((check) => (
              <div
                key={check.label}
                className={`border p-3 ${
                  check.ok
                    ? "border-signal-positive/30 bg-signal-positive/10"
                    : "border-signal-warning/30 bg-signal-warning/10"
                }`}
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {check.ok ? (
                    <CheckCircle2 size={14} className="text-signal-positive" />
                  ) : (
                    <AlertTriangle size={14} className="text-signal-warning" />
                  )}
                  <span>{check.label}</span>
                </div>
                <div className="mt-2 text-lg text-hp-ink">{check.value}</div>
              </div>
            ))}
          </div>

          {recentWarnings.length ? (
            <div className="mt-3 border border-signal-warning/30 bg-signal-warning/10 p-3 text-sm text-signal-warning">
              {recentWarnings.map((warning, index) => (
                <div key={`${warning}-${index}`}>{warning}</div>
              ))}
            </div>
          ) : (
            <div className="mt-3 border border-signal-positive/30 bg-signal-positive/10 p-3 text-sm text-signal-positive">
              No duplicate keys, null insight keys, or recent sync warnings were reported.
            </div>
          )}

          <div className="mt-5 border-t border-hp-rule pt-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <PanelTitle icon={Search} title="Meta vs Supabase" />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    Month
                  </span>
                  <input
                    type="month"
                    value={compareMonth}
                    onChange={(event) => onCompareMonthChange(event.target.value)}
                    className="mt-1 h-10 border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none focus:border-hp-ink"
                  />
                </label>
                <Button onClick={onCompareMonth} disabled={disabled || !operatorReady} icon={Search}>
                  Compare
                </Button>
              </div>
            </div>
            {!operatorReady ? (
              <p className="mt-2 text-xs text-hp-muted">
                Live Meta comparisons require the operator secret because they call the Meta API.
              </p>
            ) : null}
            <MetaComparisonView comparison={health.metaComparison} />
          </div>

          <div className="mt-5 border-t border-hp-rule pt-4">
            <PanelTitle icon={Lock} title="Finalized Month Locks" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  <tr className="border-b border-hp-rule">
                    <th className="py-2 pr-3 font-normal">Month</th>
                    <th className="py-2 pr-3 font-normal">Status</th>
                    <th className="py-2 pr-3 font-normal">Spend</th>
                    <th className="py-2 pr-3 font-normal">Rows</th>
                    <th className="py-2 pr-3 font-normal">Manual Override</th>
                  </tr>
                </thead>
                <tbody>
                  {lockedRows.map((row) => (
                    <tr key={row.month} className="border-b border-hp-rule/70">
                      <td className="py-2 pr-3 text-hp-ink">{row.month}</td>
                      <td className="py-2 pr-3">
                        <LockStatusPill status={row.lockStatus} />
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{formatMoney(row.spend)}</td>
                      <td className="py-2 pr-3">{row.rows.toLocaleString()}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          disabled={disabled || !operatorReady}
                          onClick={() => onResyncMonth(row.month)}
                          className="inline-flex h-9 items-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-body transition-colors hover:border-hp-ink hover:bg-hp-inset disabled:opacity-50"
                        >
                          <RefreshCcw size={13} />
                          Re-sync
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lockedRows.length === 0 ? (
                <EmptyState text="No finalized months are locked yet." />
              ) : null}
            </div>
          </div>

          <div className="mt-5 border-t border-hp-rule pt-4">
            <PanelTitle icon={BarChart3} title="Monthly Rows and Spend" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  <tr className="border-b border-hp-rule">
                    <th className="py-2 pr-3 font-normal">Month</th>
                    <th className="py-2 pr-3 font-normal">Lock</th>
                    <th className="py-2 pr-3 font-normal">Rows</th>
                    <th className="py-2 pr-3 font-normal">Spend</th>
                    <th className="py-2 pr-3 font-normal">Delta</th>
                    <th className="py-2 pr-3 font-normal">Leads</th>
                    <th className="py-2 pr-3 font-normal">Bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMonthlyRows.map((row) => (
                    <tr key={row.month} className="border-b border-hp-rule/70">
                      <td className="py-2 pr-3 text-hp-ink">{row.month}</td>
                      <td className="py-2 pr-3">
                        <LockStatusPill status={row.lockStatus} />
                      </td>
                      <td className="py-2 pr-3">{row.rows.toLocaleString()}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        <div>{formatMoney(row.spend)}</div>
                        <div className="mt-1 h-1.5 w-28 bg-hp-inset">
                          <div
                            className="h-full bg-hp-ink"
                            style={{ width: `${Math.max(4, Math.round((row.spend / maxRecentSpend) * 100))}%` }}
                          />
                        </div>
                      </td>
                      <td className={deltaClassName(row.spendDelta)}>
                        {formatDeltaMoney(row.spendDelta)}
                        {row.spendDeltaPct !== null ? ` (${formatPct(row.spendDeltaPct)})` : ""}
                      </td>
                      <td className="py-2 pr-3">{row.leads.toLocaleString()}</td>
                      <td className="py-2 pr-3">{row.bookings.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {health.spendAlerts.length ? (
            <div className="mt-5 border-t border-hp-rule pt-4">
              <PanelTitle icon={AlertTriangle} title="Spend Jump Alerts" />
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {health.spendAlerts.slice(0, 6).map((alert) => (
                  <div
                    key={`${alert.month}-${alert.campaignUmbrella}`}
                    className="border border-signal-warning/30 bg-signal-warning/10 p-3 text-sm"
                  >
                    <div className="text-hp-ink">
                      {alert.month} · {alert.campaignUmbrella}
                    </div>
                    <div className="mt-1 text-signal-warning">
                      {formatMoney(alert.previousSpend)} to {formatMoney(alert.spend)} ·{" "}
                      {formatDeltaMoney(alert.spendDelta)} ({formatPct(alert.spendDeltaPct)})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                <tr className="border-b border-hp-rule">
                  <th className="py-2 pr-3 font-normal">Month</th>
                  <th className="py-2 pr-3 font-normal">Umbrella</th>
                  <th className="py-2 pr-3 font-normal">Spend</th>
                  <th className="py-2 pr-3 font-normal">Rows</th>
                  <th className="py-2 pr-3 font-normal">Leads</th>
                  <th className="py-2 pr-3 font-normal">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {recentUmbrellaRows.map((row) => (
                  <tr key={`${row.month}-${row.campaignUmbrella}`} className="border-b border-hp-rule/70">
                    <td className="py-2 pr-3 text-hp-ink">{row.month}</td>
                    <td className="py-2 pr-3">{row.campaignUmbrella}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatMoney(row.spend)}</td>
                    <td className="py-2 pr-3">{row.rows.toLocaleString()}</td>
                    <td className="py-2 pr-3">{row.leads.toLocaleString()}</td>
                    <td className="py-2 pr-3">{row.bookings.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyState text="Click Data Health to check duplicate keys, sync policy, locked months, spend jumps, and monthly totals." />
      )}
    </section>
  );
}

function MetaComparisonView({ comparison }: { comparison: DataHealth["metaComparison"] }) {
  if (!comparison) {
    return (
      <EmptyState text="Choose a month and click Compare to pull live Meta totals and compare them against Supabase." />
    );
  }

  if (comparison.error) {
    return (
      <div className="mt-3 flex items-start gap-2 border border-signal-warning/30 bg-signal-warning/10 p-3 text-sm text-signal-warning">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>{comparison.error}</span>
      </div>
    );
  }

  const totals = comparison.totals;

  return (
    <div className="mt-3 overflow-x-auto">
      <div className="mb-2 text-xs text-hp-muted">
        {comparison.month} · {comparison.start} to {comparison.end} · Supabase minus Meta
      </div>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          <tr className="border-b border-hp-rule">
            <th className="py-2 pr-3 font-normal">Account</th>
            <th className="py-2 pr-3 font-normal">Supabase Spend</th>
            <th className="py-2 pr-3 font-normal">Meta Spend</th>
            <th className="py-2 pr-3 font-normal">Difference</th>
            <th className="py-2 pr-3 font-normal">Rows</th>
            <th className="py-2 pr-3 font-normal">Clicks</th>
          </tr>
        </thead>
        <tbody>
          {comparison.accounts.map((account) => (
            <tr key={account.metaAccountId} className="border-b border-hp-rule/70">
              <td className="py-2 pr-3 text-hp-ink">{account.brandCode}</td>
              <td className="py-2 pr-3 tabular-nums">{formatMoney(account.supabase.spend)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatMoney(account.meta.spend)}</td>
              <td className={deltaClassName(account.delta.spend)}>
                {formatDeltaMoney(account.delta.spend)}
                {account.spendDeltaPct !== null ? ` (${formatPct(account.spendDeltaPct)})` : ""}
              </td>
              <td className="py-2 pr-3">
                {account.supabase.rows.toLocaleString()} / {account.meta.rows.toLocaleString()}
              </td>
              <td className={deltaClassName(account.delta.clicks)}>
                {account.supabase.clicks.toLocaleString()} / {account.meta.clicks.toLocaleString()}
              </td>
            </tr>
          ))}
          {totals ? (
            <tr className="border-b border-hp-rule bg-hp-inset/60">
              <td className="py-2 pr-3 text-hp-ink">Total</td>
              <td className="py-2 pr-3 tabular-nums">{formatMoney(totals.supabase.spend)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatMoney(totals.meta.spend)}</td>
              <td className={deltaClassName(totals.delta.spend)}>
                {formatDeltaMoney(totals.delta.spend)}
                {totals.spendDeltaPct !== null ? ` (${formatPct(totals.spendDeltaPct)})` : ""}
              </td>
              <td className="py-2 pr-3">
                {totals.supabase.rows.toLocaleString()} / {totals.meta.rows.toLocaleString()}
              </td>
              <td className={deltaClassName(totals.delta.clicks)}>
                {totals.supabase.clicks.toLocaleString()} / {totals.meta.clicks.toLocaleString()}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none focus:border-hp-ink"
      />
    </label>
  );
}

function Button({
  children,
  icon: Icon,
  intent = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ComponentType<{ size?: number; className?: string }>;
  intent?: "default" | "primary";
}) {
  return (
    <button
      {...props}
      className={`flex h-11 items-center justify-center gap-2 border px-4 text-[11px] uppercase tracking-[0.14em] transition-colors ${
        intent === "primary"
          ? "border-hp-ink bg-hp-ink text-hp-foundation"
          : "border-hp-rule text-hp-body hover:border-hp-ink hover:bg-hp-inset"
      } ${props.className || ""}`}
    >
      <Icon size={15} />
      {children}
    </button>
  );
}

function IconButton({
  label,
  icon: Icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center border border-hp-rule text-hp-body transition-colors hover:border-hp-ink hover:bg-hp-inset"
    >
      <Icon size={16} />
    </button>
  );
}

function PanelTitle({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-hp-ink">
      <Icon size={18} />
      <span className="text-[11px] uppercase tracking-[0.14em]">{title}</span>
    </div>
  );
}

function StatusPill({ status }: { status: BackfillStatus | ChunkStatus }) {
  return (
    <span className={`inline-flex border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${STATUS_CLASS[status]}`}>
      {status}
    </span>
  );
}

function LockStatusPill({ status }: { status: MonthlyDiagnostic["lockStatus"] }) {
  const Icon = status === "locked" ? Lock : status === "settling" ? CalendarClock : Unlock;
  const label = status === "locked" ? "locked" : status === "settling" ? "settling" : "active";
  const className =
    status === "locked"
      ? "border-hp-rule bg-hp-inset text-hp-body"
      : status === "settling"
        ? "border-signal-warning/30 bg-signal-warning/10 text-signal-warning"
        : "border-signal-positive/30 bg-signal-positive/10 text-signal-positive";

  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${className}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-hp-rule bg-hp-foundation p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-1 text-lg text-hp-ink">{value}</div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-hp-rule bg-hp-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-1 text-hp-ink">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="border border-dashed border-hp-rule bg-hp-foundation p-4 text-sm text-hp-muted">{text}</div>;
}

function summarizeCoverage(rows: HistoryCoverage[]) {
  const accounts = new Set(rows.map((row) => row.metaAccountId));
  const months = new Set(rows.map((row) => row.month));
  return {
    accounts: accounts.size,
    months: months.size,
    filledMonths: rows.filter((row) => row.insightRows > 0).length,
    rows: rows.reduce((sum, row) => sum + row.insightRows, 0),
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatDeltaMoney(value: number) {
  const formatted = formatMoney(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatPct(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function deltaClassName(value: number) {
  const tone = value > 0 ? "text-signal-warning" : value < 0 ? "text-signal-positive" : "text-hp-body";
  return `py-2 pr-3 tabular-nums ${tone}`;
}

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const start = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 7) !== month) return null;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
