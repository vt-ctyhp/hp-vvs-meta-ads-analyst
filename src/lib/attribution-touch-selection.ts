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

export function selectOriginalPaidTouch<T extends SelectableAttributionTouch>(
  touches: Array<T | null | undefined>,
  options: { maxCapturedAt?: string | null } = {},
): T | null {
  const best = selectBestPaidTouch(touches, options);
  if (!best) return null;

  const maxCapturedAt = timestampMs(options.maxCapturedAt);
  const candidates = touches.filter((touch): touch is T => {
    if (!touch || !isPaidAttributionTouch(touch)) return false;
    const capturedAt = timestampMs(touch.capturedAt);
    return maxCapturedAt === null || capturedAt === null || capturedAt <= maxCapturedAt;
  });
  const matchingCandidates = candidates.filter((touch) => paidTouchesMatchLineage(touch, best));
  const timedCandidates = matchingCandidates.filter((touch) => timestampMs(touch.capturedAt) !== null);
  const originalCandidates =
    maxCapturedAt === null
      ? timedCandidates
      : timedCandidates.filter((touch) => {
          const capturedAt = timestampMs(touch.capturedAt);
          return capturedAt !== null && capturedAt < maxCapturedAt;
        });

  return earliestPaidTouch(originalCandidates.length ? originalCandidates : timedCandidates) || best;
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

function earliestPaidTouch<T extends SelectableAttributionTouch>(touches: T[]) {
  let earliest: T | null = null;
  for (const touch of touches) {
    const capturedAt = timestampMs(touch.capturedAt);
    const earliestCapturedAt = timestampMs(earliest?.capturedAt);
    if (capturedAt === null) continue;
    if (!earliest || earliestCapturedAt === null || capturedAt < earliestCapturedAt) {
      earliest = touch;
    }
  }
  return earliest;
}

function paidTouchesMatchLineage(
  touch: SelectableAttributionTouch,
  selected: SelectableAttributionTouch,
) {
  const touchUtm = touch.utm || {};
  const selectedUtm = selected.utm || {};
  const identifierKeys = ["adId", "adsetId", "campaignId"] as const;
  const selectedIdentifiers = identifierKeys.filter((key) => selectedUtm[key]);

  if (selectedIdentifiers.length) {
    return (
      selectedIdentifiers.some((key) => touchUtm[key] === selectedUtm[key]) ||
      paidTouchesShareClick(touch, selected)
    );
  }

  if (selectedUtm.fbclid || selected.fbc) return paidTouchesShareClick(touch, selected);
  return true;
}

function paidTouchesShareClick(
  touch: SelectableAttributionTouch,
  selected: SelectableAttributionTouch,
) {
  const touchUtm = touch.utm || {};
  const selectedUtm = selected.utm || {};
  if (selectedUtm.fbclid && touchUtm.fbclid === selectedUtm.fbclid) return true;
  if (selected.fbc && touch.fbc === selected.fbc) return true;
  if (selectedUtm.fbclid && touch.fbc?.endsWith(selectedUtm.fbclid)) return true;
  if (touchUtm.fbclid && selected.fbc?.endsWith(touchUtm.fbclid)) return true;
  return false;
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
