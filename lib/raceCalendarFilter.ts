// Client-safe half of lib/raceCalendarQuery.ts: the filter shape, its URL encoding and the
// office labels. The race list itself (data/raceCalendar.ts, 3,000 rows) and forecastData stay
// behind the server-only query module.
import type { RaceKind } from "@/data/raceCalendar";

export const RACE_KIND_LABEL: Record<RaceKind, string> = {
  P: "President",
  S: "U.S. Senate",
  G: "Governor",
  H: "U.S. House",
};

export const RACE_KIND_COLOR: Record<RaceKind, string> = {
  P: "var(--app-text-primary)",
  S: "var(--party-dem)",
  G: "var(--party-rep)",
  H: "var(--party-ind)",
};

export const RACE_KINDS: RaceKind[] = ["P", "S", "G", "H"];

export type RaceCalendarFilter = {
  state: string;  // two-letter abbr, or "all"
  kind: string;   // RaceKind, or "all"
  year: string;   // four-digit year, or "all"
  cls: string;    // "Regular" | "Special" | "Runoff", or "all"
  page: number;   // 1-based
};

export const ALL = "all";

/** Rows per page. Selecting every state, office, year and type matches all ~2,700 races, and
 *  rendering those at once is both slow and unreadable, so the table is paged instead. */
export const PAGE_SIZE = 500;

/** Reads the filter out of the URL, ignoring anything that isn't a value we offer. */
export function parseFilter(params: Record<string, string | string[] | undefined>): RaceCalendarFilter {
  const one = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v) ?? ALL;
  };
  const page = Math.floor(Number(one("page")));
  return {
    state: one("state"),
    kind: one("kind"),
    year: one("year"),
    cls: one("cls"),
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function pageCount(matching: number): number {
  return Math.max(1, Math.ceil(matching / PAGE_SIZE));
}

/** The slice of matching races shown on the filter's page, clamped so a stale or hand-edited
 *  ?page= lands on the last real page instead of an empty table. */
export function pageOf<T>(matching: T[], page: number): { rows: T[]; page: number; from: number; to: number } {
  const last = pageCount(matching.length);
  const current = Math.min(Math.max(page, 1), last);
  const from = (current - 1) * PAGE_SIZE;
  const rows = matching.slice(from, from + PAGE_SIZE);
  return { rows, page: current, from: from + 1, to: from + rows.length };
}

export const CALENDAR_PATH = "/analysis/calendar";
/** The id of the Race Calendar section, which calendar links scroll to. */
export const RACE_TABLE_ID = "race-calendar";

/** A link that changes part of the filter and keeps the rest. Absolute rather than a bare
 *  query string so it can be handed straight to router.push(). Narrowing the filter returns
 *  to page 1, since the page the reader was on may no longer exist. */
export function filterHref(filter: RaceCalendarFilter, changes: Partial<RaceCalendarFilter>): string {
  const next = { ...filter, ...changes, page: changes.page ?? 1 };
  const search = new URLSearchParams();
  for (const key of ["state", "kind", "year", "cls"] as const) {
    if (next[key] !== ALL) search.set(key, next[key]);
  }
  if (next.page > 1) search.set("page", String(next.page));
  const q = search.toString();
  return `${CALENDAR_PATH}${q ? `?${q}` : ""}#${RACE_TABLE_ID}`;
}
