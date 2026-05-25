import { getAdsAnalystEnvironment } from "./ads-analyst-db.ts";

type EnvironmentScopedQuery<T> = {
  eq: (column: string, value: string) => T;
};

export function getActiveMetaInboxEnvironment() {
  return getAdsAnalystEnvironment();
}

export function withActiveMetaInboxEnvironment<T extends object>(row: T): T & {
  environment: string;
} {
  return {
    ...row,
    environment: getActiveMetaInboxEnvironment(),
  };
}

export function withActiveMetaInboxEnvironmentRows<T extends object>(
  rows: T[],
): Array<T & { environment: string }> {
  return rows.map((row) => withActiveMetaInboxEnvironment(row));
}

export function activeMetaInboxOnConflict(onConflict: string) {
  return onConflict
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .includes("environment")
    ? onConflict
    : `environment,${onConflict}`;
}

export function scopeActiveMetaInboxEnvironment<T extends EnvironmentScopedQuery<T>>(
  query: T,
): T {
  return query.eq("environment", getActiveMetaInboxEnvironment());
}
