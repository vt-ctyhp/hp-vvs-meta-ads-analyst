"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";

import type { SocialInboxSyncRun } from "../../../lib/social-inbox.ts";

type PermissionBlock = {
  ok?: boolean;
  required?: string[];
  missing?: string[];
  optionalMissing?: string[];
  warnings?: string[];
};

type MetaPermissionStatus = {
  granted?: string[];
  forbiddenGranted?: string[];
  adsSync?: PermissionBlock;
  socialInbox?: PermissionBlock;
  socialReply?: PermissionBlock;
};

type AccountStatus = {
  brandCode: string;
  accountId: string;
  ok: boolean;
  name?: string | null;
  accountStatus?: number | null;
  error?: string;
};

export type InboxHealthStatus = {
  ok: boolean;
  missingEnv: string[];
  permissions: MetaPermissionStatus | null;
  accounts: AccountStatus[];
  readiness: {
    adsSync: boolean;
    socialInbox: boolean;
    socialReply: boolean;
  };
  error: string | null;
};

export function InboxHealthRow({
  status,
  syncRun,
}: {
  status: InboxHealthStatus;
  syncRun: SocialInboxSyncRun | null;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const health = getInboxHealth(status, syncRun);

  if (!health.unhealthy) return null;

  return (
    <section className="mx-auto mt-4 max-w-7xl" data-component="inbox-health-row">
      <div className="border border-hp-rule bg-signal-warning-bg">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-[11px] text-signal-warning smallcaps">
            {health.actionNeeded ? "Action needed" : "Heads up"}
          </span>
          <span className="min-w-[220px] flex-1 text-sm text-hp-ink">
            {health.headline}
            {health.detail ? (
              <span className="ml-2 text-xs text-hp-muted">{health.detail}</span>
            ) : null}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              id="inbox-read"
              label="Inbox read"
              ready={status.readiness.socialInbox}
              readyLabel="Ready"
              blockedLabel="Blocked"
            />
            <StatusPill
              id="replies"
              label="Replies"
              ready={status.readiness.socialReply}
              readyLabel="Ready"
              blockedLabel="Limited"
            />
          </div>
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            className="text-[10px] text-hp-muted transition-colors duration-150 hover:text-hp-ink smallcaps"
          >
            {detailsOpen ? "Hide details" : "Show details"}
          </button>
        </div>

        {detailsOpen ? (
          <div className="grid gap-4 border-t border-hp-rule p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <MetaReadinessDetails status={status} />
            <SyncRunDetails syncRun={syncRun} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getInboxHealth(status: InboxHealthStatus, syncRun: SocialInboxSyncRun | null) {
  const replyMissing = status.permissions?.socialReply?.missing?.length ?? 0;
  const forbiddenGranted = status.permissions?.forbiddenGranted?.length ?? 0;
  const hasConnectionIssue = Boolean(
    status.error ||
      status.missingEnv.length ||
      forbiddenGranted > 0 ||
      syncRun?.status === "failed",
  );
  const unhealthy =
    !status.readiness.socialInbox ||
    !status.readiness.socialReply ||
    hasConnectionIssue ||
    replyMissing > 0;

  if (!unhealthy) {
    return { unhealthy: false, actionNeeded: false, headline: "", detail: "" };
  }

  if (!status.readiness.socialInbox) {
    return {
      unhealthy: true,
      actionNeeded: true,
      headline: "Inbox can't read Meta messages",
      detail: "",
    };
  }

  if (hasConnectionIssue) {
    const detail = connectionIssueDetail(status, syncRun);
    return {
      unhealthy: true,
      actionNeeded: Boolean(status.error || status.missingEnv.length || forbiddenGranted > 0),
      headline: "Inbox connection issue",
      detail,
    };
  }

  if (!status.readiness.socialReply || replyMissing > 0) {
    if (replyMissing > 0) {
      return {
        unhealthy: true,
        actionNeeded: false,
        headline: `${replyMissing} permission${replyMissing === 1 ? "" : "s"} missing for replies`,
        detail: "",
      };
    }
    return {
      unhealthy: true,
      actionNeeded: false,
      headline: "Replies blocked by permission gaps",
      detail: "",
    };
  }

  return { unhealthy: false, actionNeeded: false, headline: "", detail: "" };
}

function connectionIssueDetail(status: InboxHealthStatus, syncRun: SocialInboxSyncRun | null) {
  if (status.error) return status.error;
  if (status.missingEnv.length) return `Missing env vars: ${status.missingEnv.join(", ")}`;
  if (status.permissions?.forbiddenGranted?.length) {
    return `Forbidden permission granted: ${status.permissions.forbiddenGranted.join(", ")}`;
  }
  if (syncRun?.status === "failed") return "Last sync failed";
  return "";
}

function StatusPill({
  id,
  label,
  ready,
  readyLabel,
  blockedLabel,
}: {
  id: string;
  label: string;
  ready: boolean;
  readyLabel: string;
  blockedLabel: string;
}) {
  const tone = ready ? "positive" : "warning";
  return (
    <span
      data-status-pill={id}
      data-tone={tone}
      className={`inline-flex h-7 items-center gap-1.5 border px-2 text-[10px] smallcaps ${
        ready
          ? "border-signal-positive/30 bg-signal-positive-bg text-signal-positive"
          : "border-signal-warning/30 bg-signal-warning-bg text-signal-warning"
      }`}
    >
      <span className="text-hp-muted">{label}</span>
      <span>{ready ? readyLabel : blockedLabel}</span>
    </span>
  );
}

function MetaReadinessDetails({ status }: { status: InboxHealthStatus }) {
  const permissions = status.permissions;
  const socialReplyWarnings = permissions?.socialReply?.warnings || [];

  return (
    <section className="border border-hp-rule bg-hp-card p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="text-[11px] text-hp-muted smallcaps">Meta Integration Status</span>
          <h2 className="mt-2 font-title text-[30px] leading-tight text-hp-ink">
            {status.readiness.socialInbox ? "Inbox read access is ready" : "Inbox setup needed"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-hp-muted">
            This page uses live Meta permission checks. The inbox can read Facebook and Instagram
            message/comment surfaces, while reply actions stay disabled until the backend and final
            permission set are in place.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-3 xl:w-[620px]">
          <ReadinessCard
            title="Ads Sync"
            ready={status.readiness.adsSync}
            detail={status.readiness.adsSync ? "Operational" : "Needs attention"}
          />
          <ReadinessCard
            title="Social Inbox"
            ready={status.readiness.socialInbox}
            detail={status.readiness.socialInbox ? "Read access ready" : "Missing permissions"}
          />
          <ReadinessCard
            title="Replies"
            ready={status.readiness.socialReply}
            detail={status.readiness.socialReply ? "Ready for send APIs" : "Limited"}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="border border-hp-rule bg-hp-inset p-4">
          <div className="text-[11px] text-hp-muted smallcaps">Connected Accounts</div>
          <div className="mt-3 space-y-2">
            {status.accounts.length ? (
              status.accounts.map((account) => (
                <div
                  key={account.accountId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-hp-ink">{account.name || account.accountId}</span>
                  <span className={account.ok ? "text-signal-positive" : "text-signal-danger"}>
                    {account.ok ? "Ready" : account.error || "Error"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-hp-muted">No configured Meta accounts available.</p>
            )}
          </div>
        </div>

        <div className="border border-hp-rule bg-hp-inset p-4">
          <div className="text-[11px] text-hp-muted smallcaps">Remaining Setup</div>
          <div className="mt-3 space-y-2 text-sm leading-6">
            {status.error ? <p className="text-signal-danger">{status.error}</p> : null}
            {status.missingEnv.length ? (
              <p className="text-signal-danger">
                Missing env vars: {status.missingEnv.join(", ")}
              </p>
            ) : null}
            {permissions?.forbiddenGranted?.length ? (
              <p className="text-signal-danger">
                Forbidden permission granted: {permissions.forbiddenGranted.join(", ")}
              </p>
            ) : null}
            {permissions?.socialReply?.missing?.length ? (
              <p className="text-signal-warning">
                Missing for Facebook comment replies: {permissions.socialReply.missing.join(", ")}
              </p>
            ) : null}
            {permissions?.adsSync?.optionalMissing?.length ? (
              <p className="text-hp-muted">
                Optional ads permission missing: {permissions.adsSync.optionalMissing.join(", ")}
              </p>
            ) : null}
            {socialReplyWarnings.map((warning) => (
              <p key={warning} className="text-hp-muted">
                {warning}
              </p>
            ))}
            {!status.error &&
            !status.missingEnv.length &&
            !permissions?.socialReply?.missing?.length &&
            !permissions?.forbiddenGranted?.length ? (
              <p className="text-signal-positive">All tracked permissions are ready.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReadinessCard({
  title,
  ready,
  detail,
}: {
  title: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="border border-hp-rule bg-hp-inset p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] text-hp-muted smallcaps">{title}</div>
        {ready ? (
          <CheckCircle2 size={16} className="text-signal-positive" />
        ) : (
          <AlertTriangle size={16} className="text-signal-warning" />
        )}
      </div>
      <div className={`mt-3 text-sm ${ready ? "text-signal-positive" : "text-signal-warning"}`}>
        {detail}
      </div>
    </div>
  );
}

function SyncRunDetails({ syncRun }: { syncRun: SocialInboxSyncRun | null }) {
  const metrics = syncRun?.metrics || {};
  const firstError = syncRun?.errors?.[0];

  return (
    <section className="border border-hp-rule bg-hp-card p-5">
      <span className="text-[11px] text-hp-muted smallcaps">Sync Run</span>
      <h2 className={`mt-2 font-title text-2xl leading-tight ${syncRunToneClass(syncRun)}`}>
        {syncRunHeadline(syncRun)}
      </h2>
      <dl className="mt-4 space-y-3 text-sm leading-6">
        <div className="flex justify-between gap-4">
          <dt className="text-hp-muted">Status</dt>
          <dd className="text-hp-ink">{syncRun?.status || "Unavailable"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-hp-muted">Completed</dt>
          <dd className="text-hp-ink">{formatDateLabel(syncRun?.completed_at)}</dd>
        </div>
        <MetricRow label="Threads" value={metrics.threads} />
        <MetricRow label="Messages" value={metrics.messages} />
        <MetricRow label="Comments" value={metrics.comments} />
        <div className="border-t border-hp-rule-soft pt-3">
          <dt className="text-hp-muted">First error</dt>
          <dd className={firstError ? "text-signal-danger" : "text-hp-ink"}>
            {formatUnknown(firstError) || "None recorded"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-hp-muted">{label}</dt>
      <dd className="text-hp-ink lining-nums">{typeof value === "number" ? value : 0}</dd>
    </div>
  );
}

function syncRunHeadline(syncRun: SocialInboxSyncRun | null) {
  if (!syncRun) return "No sync run recorded";
  if (syncRun.status === "failed") return "Last sync failed";
  if (syncRun.status === "partial") return "Last sync partially completed";
  if (syncRun.status === "running") return "Sync running";
  return "Last sync completed";
}

function syncRunToneClass(syncRun: SocialInboxSyncRun | null) {
  if (syncRun?.status === "failed") return "text-signal-danger";
  if (syncRun?.status === "partial" || syncRun?.status === "running") return "text-signal-warning";
  return "text-hp-ink";
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatUnknown(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
