export type SelectableAttributionTouch = {
  browserName?: string;
  capturedAt?: string;
  deviceCategory?: string;
  fbc?: string;
  fbp?: string;
  osName?: string;
  source?: string;
  sourceType?: string;
  utm?: Record<string, string | undefined> | null;
};

export function isPaidAttributionTouch(touch: SelectableAttributionTouch | null | undefined) {
  if (!touch) return false;
  const utm = touch.utm || {};
  if (touch.fbc || utm.fbclid || utm.adId || utm.adsetId || utm.campaignId) return true;
  if (touch.sourceType?.startsWith("paid_")) return true;
  return isPaidMedium(utm.medium || "");
}

export function selectBestPaidTouch<T extends SelectableAttributionTouch>(
  touches: Array<T | null | undefined>,
  options: { maxCapturedAt?: string | null } = {},
): T | null {
  const maxCapturedAt = timestampMs(options.maxCapturedAt);
  let best: T | null = null;

  for (const touch of touches) {
    if (!touch || !isPaidAttributionTouch(touch)) continue;
    const capturedAt = timestampMs(touch.capturedAt);
    if (maxCapturedAt !== null && capturedAt !== null && capturedAt > maxCapturedAt) continue;
    if (!best || comparePaidTouches(touch, best) > 0) best = touch;
  }

  return best;
}

export function selectLastPaidTouch<T extends SelectableAttributionTouch>(
  existing: T | null | undefined,
  touch: T,
  options: { maxCapturedAt?: string | null } = {},
) {
  return selectBestPaidTouch([existing, touch], options);
}

function comparePaidTouches(
  left: SelectableAttributionTouch,
  right: SelectableAttributionTouch,
) {
  const scoreDelta = paidTouchScore(left) - paidTouchScore(right);
  if (scoreDelta !== 0) return scoreDelta;

  const leftTime = timestampMs(left.capturedAt);
  const rightTime = timestampMs(right.capturedAt);
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (leftTime !== null && rightTime === null) return 1;
  if (leftTime === null && rightTime !== null) return -1;
  return 0;
}

function paidTouchScore(touch: SelectableAttributionTouch) {
  const utm = touch.utm || {};
  const idCount = [utm.adId, utm.adsetId, utm.campaignId].filter(Boolean).length;
  if (idCount) return 400 + idCount;

  const medium = utm.medium || "";
  if (isPaidMedium(medium) && (utm.source || utm.campaign || utm.content || utm.id)) {
    return 300;
  }

  if (touch.fbc || utm.fbclid) return 200;
  if (touch.sourceType?.startsWith("paid_") || isPaidMedium(medium)) return 100;
  return 0;
}

function isPaidMedium(value: string) {
  const medium = value.toLowerCase();
  return ["paid", "paid_social", "cpc", "ppc", "paid-search", "paidsearch", "social_paid"].some(
    (needle) => medium.includes(needle),
  );
}

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
