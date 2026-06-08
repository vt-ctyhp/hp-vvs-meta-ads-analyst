export type ChangeType =
  | "budget" | "status" | "audience" | "creative"
  | "promotion" | "price" | "website" | "other";

export const CHANGE_TYPES: ChangeType[] = [
  "budget", "status", "audience", "creative", "promotion", "price", "website", "other",
];

export type BrandCode = "HP" | "VVS";
export type EntityKind = "ad_set" | "campaign" | "creative" | "account" | "website";
export type MatchStatus = "matched" | "ambiguous" | "unmatched";
export type VerifyEntity = "matched" | "ambiguous" | "none";
export type VerifyValue = "confirmed" | "mismatch" | "na";

export type ChangeLogEntityRef = {
  entityKind: EntityKind;
  entityMetaId: string | null;
  entityName: string;
  matchStatus: MatchStatus;
};

export type ChangeLogEntry = {
  id: string;
  brandCode: BrandCode;
  metaAccountId: string | null;
  eventDate: string;          // YYYY-MM-DD
  effectiveStart: string | null;
  effectiveEnd: string | null; // null + effectiveStart set => ongoing
  changeType: ChangeType;
  title: string;
  reason: string;
  beforeValue: string | null;
  afterValue: string | null;
  verifyEntity: VerifyEntity;
  verifyValue: VerifyValue;
  entities: ChangeLogEntityRef[];
  citationCount: number;
  createdByEmail: string | null;
  createdAt: string;
};

// Draft = a not-yet-persisted entry produced by the capture service.
export type ChangeLogDraft = {
  brandCode: BrandCode;
  eventDate: string;
  eventDateNote: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  changeType: ChangeType;
  title: string;
  reason: string;
  beforeValue: string | null;
  afterValue: string | null;
  rawInput: string;
  verifyEntity: VerifyEntity;
  verifyValue: VerifyValue;
  entities: ChangeLogEntityRef[];
  warnings: string[];
};

export type ChangeLogFilters = {
  rangeDays: number | null; // null = all time; UI offers 7 | 30 | 90
  brandCode: BrandCode | null;
  changeType: ChangeType | null;
  query: string;                 // matches title / entity names
};

export type ChangeLogWindow = {
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
};
