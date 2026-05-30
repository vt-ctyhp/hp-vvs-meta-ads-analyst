export type SocialSyncBounds = {
  /** Max pages of the conversations list to walk. */
  conversationPages: number;
  /** Max threads to deep-fetch messages for. */
  messageThreadLimit: number;
};

/**
 * Per-trigger fetch caps for the social inbox sync.
 *
 * The cron backstop runs every 2 minutes purely to catch dropped webhooks, so it only needs
 * the most-recently-updated conversations — NOT a deep historical sweep. Manual- and
 * webhook-triggered syncs keep the existing (env-configured) wide bounds by returning null.
 */
export function socialSyncBoundsForTrigger(
  trigger: "manual" | "cron" | "webhook",
): SocialSyncBounds | null {
  if (trigger === "cron") {
    return { conversationPages: 1, messageThreadLimit: 25 };
  }
  return null;
}
