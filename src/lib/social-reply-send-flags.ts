/**
 * Standalone safety primitives for Phase 11 live Meta send.
 *
 * Kept in its own zero-dependency module so node:test's
 * --experimental-strip-types runner can import it directly without
 * needing to resolve the rest of the Next.js alias graph.
 */

/**
 * Whether ALLOW_LIVE_META_SEND is explicitly opted in. Defaults to false,
 * so any new environment (preview, staging, prod first boot) is dry-run
 * by default — Phase 11 §17 verification step requires this opt-in to
 * live-fire to Meta.
 */
export function isLiveSendEnabled(): boolean {
  const flag = (process.env.ALLOW_LIVE_META_SEND || "").trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

/**
 * Error subclass thrown by the send executor when a step fails. Carries an
 * HTTP `status` so the route handler can surface a useful code (e.g. 409
 * for a missing page_id, 502 for upstream Meta failure).
 */
export class SendReplyError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "SendReplyError";
    this.status = status;
  }
}
