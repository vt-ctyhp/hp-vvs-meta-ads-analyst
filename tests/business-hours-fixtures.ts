// Shared JS↔SQL parity fixtures for business-time arithmetic.
//
// Each row pins a known (from, to, tz, window) → expected business seconds.
// The JS side asserts `businessSecondsBetween` matches every row
// (tests/business-hours.test.ts). The SQL function `public.business_seconds_between`
// embeds these same labels + expected values as a comment block
// (supabase/migrations/*_business_seconds_between_fn.sql) so a staging run can
// paste them into `select business_seconds_between(...)` and diff. The migration
// shape test asserts the comment block is present, keeping JS and SQL from
// drifting silently.
//
// All timestamps are whole-second. The JS impl rounds and the SQL impl floors
// per-day overlap; for whole-second inputs they agree exactly. Keep fixtures
// whole-second so the JS, SQL, and `expected` columns stay bit-identical.

export type BusinessSecondsFixture = {
  label: string;
  fromISO: string;
  toISO: string;
  tz: string;
  startHour: number;
  endHour: number;
  expected: number;
};

export const BUSINESS_SECONDS_FIXTURES: BusinessSecondsFixture[] = [
  {
    label: "PT same-day 11:00→13:30",
    fromISO: "2026-05-27T18:00:00Z",
    toISO: "2026-05-27T20:30:00Z",
    tz: "America/Los_Angeles",
    startHour: 10,
    endHour: 19,
    expected: 9000,
  },
  {
    label: "PT clamp before open 08:00→11:00",
    fromISO: "2026-05-27T15:00:00Z",
    toISO: "2026-05-27T18:00:00Z",
    tz: "America/Los_Angeles",
    startHour: 10,
    endHour: 19,
    expected: 3600,
  },
  {
    label: "PT overnight gap 18:00 d1 → 11:00 d2",
    fromISO: "2026-05-28T01:00:00Z",
    toISO: "2026-05-28T18:00:00Z",
    tz: "America/Los_Angeles",
    startHour: 10,
    endHour: 19,
    expected: 7200,
  },
  {
    label: "ICT 11:00→12:00",
    fromISO: "2026-05-27T04:00:00Z",
    toISO: "2026-05-27T05:00:00Z",
    tz: "Asia/Ho_Chi_Minh",
    startHour: 10,
    endHour: 19,
    expected: 3600,
  },
  {
    // Full business day on the DST spring-forward date (2026-03-08, PT clocks
    // jump 02:00 PST → 03:00 PDT, outside the 10–19 window). 10:00 PDT = 17:00Z,
    // 19:00 PDT = 02:00Z next day → a clean 9h = 32400s, proving the per-day
    // offset is resolved as PDT (UTC-7), not PST.
    //
    // NOTE: the plan's draft fixture used fromISO 18:00Z / toISO 03:00Z, which
    // actually decode to 11:00 PDT → 20:00 PDT (clamped 11:00–19:00 = 28800s),
    // NOT a full day. That mislabeled-literal bug — same class as the Task 7/8
    // UTC↔PDT slips — would have made `expected: 32400` unreachable by either
    // the JS or SQL impl. Corrected to the true full-day literals (which match
    // the existing DST test at tests/business-hours.test.ts:169-171).
    label: "PT full DST spring-forward day",
    fromISO: "2026-03-08T17:00:00Z",
    toISO: "2026-03-09T02:00:00Z",
    tz: "America/Los_Angeles",
    startHour: 10,
    endHour: 19,
    expected: 32400,
  },
];
