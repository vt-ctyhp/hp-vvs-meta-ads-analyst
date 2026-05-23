/**
 * Maps a campaign umbrella to its primary / secondary KPI definition.
 *
 * Shared between server-side aggregation (`src/lib/analytics.ts`,
 * which decides which Meta action counts roll up into `primaryResults`)
 * and client-side UI labels (`src/components/dashboard-client.tsx`,
 * which renders the Metric dropdown + sticky-bar standfirst with the
 * actual KPI name).
 *
 * Pure mapping — no imports, safe to use in any runtime.
 *
 * The signature accepts `string | null | undefined` because client-side
 * filter state is loosely typed (a `string` from URL params). Unknown
 * umbrellas fall through to the default profile.
 */

export type UmbrellaKpiProfile = {
  primaryMetric: "websiteBookings" | "messagingContacts";
  primaryResultLabel: string;
  secondaryMetric: "newMessagingContacts" | null;
  secondaryResultLabel: string | null;
};

const BOOK_APPTS_PROFILE: UmbrellaKpiProfile = {
  primaryMetric: "websiteBookings",
  primaryResultLabel: "Website Bookings",
  secondaryMetric: null,
  secondaryResultLabel: null,
};

const FACEBOOK_PRODUCT_PROFILE: UmbrellaKpiProfile = {
  primaryMetric: "messagingContacts",
  primaryResultLabel: "Messaging Contacts",
  secondaryMetric: "newMessagingContacts",
  secondaryResultLabel: "New Msg Contacts",
};

const DEFAULT_PROFILE: UmbrellaKpiProfile = {
  primaryMetric: "messagingContacts",
  primaryResultLabel: "Messaging Contacts",
  secondaryMetric: null,
  secondaryResultLabel: null,
};

export function getKpiProfile(
  umbrella: string | null | undefined,
): UmbrellaKpiProfile {
  if (umbrella === "Book Appts US") return BOOK_APPTS_PROFILE;
  if (umbrella === "Facebook US Product" || umbrella === "Facebook VN Product") {
    return FACEBOOK_PRODUCT_PROFILE;
  }
  return DEFAULT_PROFILE;
}
