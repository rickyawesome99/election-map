// Per-state, per-chamber rule for "most recent regular election year" of a state legislative
// seat, as of the current build. A value is either:
//   - a plain number: every seat in that chamber was last regularly elected in that year.
//   - a function (districtNumber: number) => number: for staggered chambers, where different
//     seats were last elected in different years (e.g. odd/even Senate districts alternating).
//
// This intentionally reflects the seat's last REGULAR general election — a seat currently held
// via a special election (a mid-term vacancy fill) still reports the last regular election year,
// per the original task framing ("most recent regular election of this seat").
//
// Populated state-by-state alongside data-entry/state-leg-incumbents/*.json. See
// project_state_leg_incumbents.md (memory) for the research/verification behind each entry.

export const electionYears = {
  // OH Senate: 4-year staggered terms fixed by the OH Constitution, independent of the 2024 map
  // change — even districts up 2024 (next 2028), odd up 2022 (next 2026). SD33 (Cutrona) had a
  // Nov 2024 special election to fill the remainder of a term after Rulli's resignation, but the
  // seat's last REGULAR election is still 2022. Confirmed via research, 2026-08-25.
  OH: { house: 2024, senate: (n) => (n % 2 === 0 ? 2024 : 2022) },
  // WI Senate: same staggered pattern as OH — even districts up 2024 (next 2028), odd up 2022
  // (next 2026); the 2024 map took effect for all 33 but only even seats were actually contested
  // that cycle. Confirmed via research, 2026-08-25.
  WI: { house: 2024, senate: (n) => (n % 2 === 0 ? 2024 : 2022) },
  // GA: flat 2-year terms, no staggering, both chambers. Several 2025/2026 special elections
  // (SD35, SD21, SD18, HD106, HD23) filled vacancies but don't change the seat's last regular
  // election year. Confirmed via research, 2026-08-25.
  GA: { house: 2024, senate: 2024 },
  // MI Senate: all 38 elected together every 4 years (not staggered), concurrent with the
  // Governor — current map used since 2022, next used 2026 (not yet occurred as of 2026-08-25).
  // SD35's 2026 special election (McDonald Rivet vacancy) only fills the remainder of the
  // 2022-2026 term. Confirmed via research, 2026-08-25.
  MI: { house: 2024, senate: 2022 },
  // NE: unicameral, 4-year staggered terms — odd districts up 2024 (next 2028), even districts
  // up 2022 (next 2026). Vacancies (e.g. District 41) are filled by gubernatorial appointment
  // under §32-566, not a special election, so they never affect this rule. Confirmed via
  // research, 2026-08-25.
  NE: { senate: (n) => (n % 2 === 0 ? 2022 : 2024) },
  // CA Senate: 4-year staggered terms by clean district-number parity — odd up 2024 (next 2028),
  // even up 2022 (next 2026). Assembly flat 2yr. Confirmed via research, 2026-08-25.
  CA: { house: 2024, senate: (n) => (n % 2 === 0 ? 2022 : 2024) },
  // TX Senate: NOT a numeric-parity rule — the 2022 redistricting reset all 31 seats, then a
  // Jan 2023 lottery arbitrarily drew which seats got 2-year vs 4-year terms to restore the
  // stagger. Explicit list from research, 2026-08-25 (TX Senate official release 20230111a):
  // last regular 2024 (2yr draw): 6,7,8,10,12,14,15,16,17,20,23,25,27,29,30 (15 districts).
  // last regular 2022 (4yr draw, next 2026): the remaining 16 districts. House flat 2yr.
  TX: {
    house: 2024,
    senate: (n) => ([6, 7, 8, 10, 12, 14, 15, 16, 17, 20, 23, 25, 27, 29, 30].includes(n) ? 2024 : 2022),
  },
  // NY: both chambers flat 2yr, no staggering (unlike the federal Senate). Confirmed via
  // research, 2026-08-25.
  NY: { house: 2024, senate: 2024 },
  // PA Senate: 4-year staggered terms by clean district-number parity — odd up 2024 (next 2028),
  // even up 2022 (next 2026). House flat 2yr. Confirmed via research, 2026-08-25.
  PA: { house: 2024, senate: (n) => (n % 2 === 0 ? 2022 : 2024) },
  // NC: both chambers flat 2yr, no staggering. Confirmed via research, 2026-08-25.
  NC: { house: 2024, senate: 2024 },
  // LA: both chambers elected together on LA's odd-year cycle (2023, next 2027) — not on the
  // even-year federal cycle, and not staggered within a chamber. Confirmed via research,
  // 2026-08-25.
  LA: { house: 2023, senate: 2023 },
  // IL Senate: NOT a parity rule — a fixed 20-district "2-4-4" group (reset 2022, up again 2024,
  // next 2028) vs. the 39-district complement (reset 2022, next up 2026). Explicit list from
  // research, 2026-08-25 (cross-checked against raw Wikipedia election-article wikitext, since
  // Ballotpedia's rendered pages didn't fetch; several 2024-ballot appearances in the complement
  // group turned out to be specials, not regulars — excluded). House flat 2yr.
  IL: {
    house: 2024,
    senate: (n) =>
      [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58].includes(n) ? 2024 : 2022,
  },
  // AZ: both chambers flat 2yr, no staggering (House's 2-per-district multi-member structure
  // doesn't change the election-year cycle). Confirmed via research, 2026-08-25.
  AZ: { house: 2024, senate: 2024 },
  // WA Senate: NOT a parity rule — a fixed 25-district group (up 2024, next 2028) vs. the
  // 24-district complement (up 2022, next 2026), verified via raw wikitext. District 27 is
  // genuinely in the 2024-class despite a 2022 special filling a resignation-vacancy; that
  // special doesn't change its regular-cycle year. House (2-per-district) flat 2yr. Confirmed
  // via research, 2026-08-25.
  WA: {
    house: 2024,
    senate: (n) =>
      [1, 2, 3, 4, 5, 9, 10, 11, 12, 14, 16, 17, 18, 19, 20, 22, 23, 24, 25, 27, 28, 39, 40, 41, 49].includes(n)
        ? 2024
        : 2022,
  },
  // VA: odd-year state, chambers on DIFFERENT cycles. House of Delegates flat 2yr, elected 2025
  // (confirmed a real 2025 election occurred) — last regular 2025 for all 100 seats. Senate flat
  // 4yr, elected with the governor (2023, next 2027) — NOT on the 2025 ballot, last regular 2023
  // for all 40 seats. Confirmed via research, 2026-08-25.
  VA: { house: 2025, senate: 2023 },
  // FL Senate: NOT the usual clean parity in BOTH directions — verified via exact district list.
  // The 2022 redistricting reset all 40 seats with unequal term lengths: odd districts got a
  // 2-year term (elected 2022, then 2024, next 2028), even districts got a 4-year term (elected
  // 2022, next 2026). House flat 2yr. Confirmed via research, 2026-08-25.
  FL: { house: 2024, senate: (n) => (n % 2 === 1 ? 2024 : 2022) },
  // NJ: odd-year state, chambers on DIFFERENT cycles (like VA). Assembly (2/district) flat 2yr,
  // elected 2023 then 2025 — last regular 2025 for all 80 seats. Senate flat 4yr, elected with
  // the governor (2023, next 2027, NOT on 2025 ballot) — last regular 2023 for all 40 seats.
  // Confirmed via research, 2026-08-25.
  NJ: { house: 2025, senate: 2023 },
  // MN: House flat 2yr. Senate NOT staggered by district — all 67 elected together, but term
  // LENGTH varies across the decade (4-4-2 pattern: 4yr term elected 2022, next all-together
  // 2026) — so as of today last regular election is 2022 for every Senate seat, not a per-district
  // split. Confirmed via research, 2026-08-25.
  MN: { house: 2024, senate: 2022 },
  // MO Senate: clean parity split, verified by exact district list — odd up 2024 (next 2028),
  // even up 2022 (next 2026). House flat 2yr. Confirmed via research, 2026-08-25.
  MO: { house: 2024, senate: (n) => (n % 2 === 1 ? 2024 : 2022) },
  // IN Senate: NOT a parity rule — explicit complementary district lists verified against
  // Wikipedia's 2022/2024 election articles. House flat 2yr. Confirmed via research, 2026-08-25.
  IN: {
    house: 2024,
    senate: (n) =>
      [2, 3, 5, 7, 8, 9, 10, 12, 13, 16, 18, 20, 24, 28, 30, 32, 33, 34, 35, 36, 37, 40, 42, 44, 50].includes(n)
        ? 2024
        : 2022,
  },
  // TN Senate: clean parity split, verified against raw Wikipedia election-article section
  // headings for 2022/2024 — odd up 2022 (next 2026), even up 2024 (next 2028). House flat 2yr.
  // Confirmed via research, 2026-08-25.
  TN: { house: 2024, senate: (n) => (n % 2 === 1 ? 2022 : 2024) },
  // MD: both chambers flat 4yr, all elected together (last regular 2022, next 2026) — no internal
  // staggering (House's multi-member districts don't change the cycle). Confirmed via research,
  // 2026-08-25.
  MD: { house: 2022, senate: 2022 },
  // MA: both chambers flat 2yr, no staggering. Confirmed via research, 2026-08-25.
  MA: { house: 2024, senate: 2024 },
  // CO Senate: NOT a parity rule — verified via raw Ballotpedia HTML per-district listings for
  // 2022/2024 (a mixed odd/even list, not clean parity). House flat 2yr. Confirmed via research,
  // 2026-08-25.
  CO: {
    house: 2024,
    senate: (n) => ([2, 5, 6, 10, 12, 13, 14, 16, 17, 18, 19, 21, 23, 26, 28, 29, 31, 33].includes(n) ? 2024 : 2022),
  },
  // OK Senate: clean parity split, verified via raw Ballotpedia per-district text — even up 2022
  // (next 2026), odd up 2024 (next 2028). House flat 2yr. Confirmed via research, 2026-08-25.
  OK: { house: 2024, senate: (n) => (n % 2 === 0 ? 2022 : 2024) },
  // AL: BOTH chambers flat 4yr, all together, elected with the governor (2022, next 2026) — not
  // staggered. The 2025 federal remedial map for SD25/26 (stayed by the 11th Circuit in 2026) is
  // a boundary dispute only and doesn't change this. Confirmed via research, 2026-08-25.
  AL: { house: 2022, senate: 2022 },
  // AK House flat 2yr. Senate is lettered A-T (not numbered) with staggered 4yr terms — a 2022
  // redistricting quirk left District T's election delayed to 2024 (it sat out 2022), which
  // happens to make the final pattern a clean alphabetical-position parity: districts at an ODD
  // alphabet position (A=1st, C=3rd, ...) last regular 2022/next 2026; EVEN position (B=2nd,
  // D=4th, ..., including T=20th) last regular 2024/next 2028. Rule keys off the raw letter
  // (second function arg) since these districts have no numeric district value. Confirmed via
  // research, 2026-08-25.
  AK: {
    house: 2024,
    senate: (_n, raw) => {
      const pos = raw.toUpperCase().charCodeAt(0) - "A".charCodeAt(0) + 1; // A=1, B=2, ...
      return pos % 2 === 1 ? 2022 : 2024;
    },
  },
  // AR Senate: NOT a parity rule — explicit complementary district lists verified against
  // Wikipedia's 2024/2026 election articles. House flat 2yr. Confirmed via research, 2026-08-25.
  AR: {
    house: 2024,
    senate: (n) =>
      [1, 3, 4, 5, 6, 8, 12, 17, 18, 19, 20, 22, 23, 25, 26, 29, 33, 34].includes(n) ? 2024 : 2022,
  },
  // CT: both chambers flat 2yr, no staggering. Confirmed via research, 2026-08-25.
  CT: { house: 2024, senate: 2024 },
  // DE Senate: NOT a parity rule — explicit complementary district lists verified against
  // Wikipedia's 2024/2026 election articles (10 districts got a truncated 2yr term in 2022 then
  // re-elected 2024; 11 districts went straight to a 4yr term in 2022). House flat 2yr. Confirmed
  // via research, 2026-08-25.
  DE: {
    house: 2024,
    senate: (n) => ([2, 3, 4, 6, 10, 11, 16, 17, 18, 21].includes(n) ? 2024 : 2022),
  },
  // HI Senate: NOT a parity rule — a fixed 12-district group (last regular 2024, next 2028) vs.
  // the 13-district complement (last regular 2022, next 2026), confirmed against the actual 2026
  // candidate-filing proclamation. House flat 2yr. Confirmed via research, 2026-08-25.
  HI: {
    house: 2024,
    senate: (n) => ([1, 3, 4, 6, 7, 12, 16, 18, 19, 22, 23, 24].includes(n) ? 2024 : 2022),
  },
  // ID: BOTH chambers flat 2yr, no staggering (House's 2-per-district multi-member structure
  // doesn't change the cycle). Confirmed via research, 2026-08-25.
  ID: { house: 2024, senate: 2024 },
  // IA Senate: clean parity split as of today — odd last regular 2022/next 2026, even last
  // regular 2024/next 2028 (a handful of even districts also voted in 2022 due to incumbent
  // pairing from redistricting, but resynced to the even cycle by 2024, so current parity holds).
  // House flat 2yr. Confirmed via research, 2026-08-25.
  IA: { house: 2024, senate: (n) => (n % 2 === 1 ? 2022 : 2024) },
  // KS: House flat 2yr. Senate NOT staggered — all 40 elected together every 4yr, offset from the
  // governor's cycle; was NOT on the 2022 ballot, only 2024/2028/... — last regular 2024 for
  // every seat. Confirmed via research, 2026-08-25.
  KS: { house: 2024, senate: 2024 },
  // KY Senate: clean parity split (KY Const. §30 mandates the half-every-2-years structure) —
  // even last regular 2022/next 2026, odd last regular 2024/next 2028. House flat 2yr. Confirmed
  // via research, 2026-08-25.
  KY: { house: 2024, senate: (n) => (n % 2 === 0 ? 2022 : 2024) },
  // ME: both chambers flat 2yr, no staggering. Confirmed via research, 2026-08-26.
  ME: { house: 2024, senate: 2024 },
  // MS: odd-year state, 4yr terms both chambers — last regular 2023, next 2027. 2025 court-ordered
  // VRA remedial maps (House enacted 2025-03-07, Senate 2025-05-07) triggered special elections on
  // 2025-11-04 in ~14 newly-drawn districts (Senate: 1,2,11,19,34,41,42,44,45; House: 16,22,36,39,41)
  // to fill the remainder of the 2023-2027 term under the new lines — these are legally SPECIAL
  // elections, not regular, so the chamber's regular-cycle year (2023) applies uniformly with no
  // per-district exceptions, per the same rule as any other resignation/redistricting special.
  // Confirmed via research, 2026-08-26.
  MS: { house: 2023, senate: 2023 },
  // MT Senate: NOT a parity rule — the 2023 commission map reset the stagger; explicit
  // complementary district lists verified via research (each pair sums to 50). House flat 2yr.
  // Confirmed via research, 2026-08-26.
  MT: {
    house: 2024,
    senate: (n) =>
      [2, 3, 5, 7, 13, 15, 16, 17, 20, 21, 24, 26, 27, 30, 33, 35, 36, 37, 38, 39, 40, 44, 45, 46, 47].includes(n)
        ? 2024
        : 2022,
  },
  // NV Senate: NOT a parity rule — explicit complementary district lists verified via research
  // (each pair sums to 21). Assembly flat 2yr. Confirmed via research, 2026-08-26.
  NV: { house: 2024, senate: (n) => ([1, 3, 4, 5, 6, 7, 11, 15, 18, 19].includes(n) ? 2024 : 2022) },
  // NH: both chambers flat 2yr, even-year elections (NOT an odd-year state). House uses
  // non-numeric county-prefixed district codes (e.g. "Belknap 5") — see PEOPLE_CODE_OVERRIDES in
  // the build script for the join fix; doesn't affect the cycle rule itself. Confirmed via
  // research, 2026-08-26.
  NH: { house: 2024, senate: 2024 },
  // NM: House flat 2yr. Senate flat 4yr, all 42 seats elected together in presidential years (not
  // staggered at all) — last regular 2024, next 2028. Confirmed via research, 2026-08-26.
  NM: { house: 2024, senate: 2024 },
  // ND: both chambers 4yr, staggered by clean district-number parity, one senator + two
  // representatives elected together per district — even districts last regular 2024/next 2028,
  // odd last regular 2022/next 2026. EXCEPTION: House districts 9 and 15 held court-ordered
  // elections in Nov 2024 (Jan 2024 VRA remedial map, which also merged 9A/9B back into a unified
  // District 9) for 2-year unexpired terms, resyncing them onto the even-year ballot for this
  // cycle — so House D9/D15 last regular is 2024, not 2022 (they return to the normal odd cycle in
  // 2026). District 4's permanent 4A/4B House split doesn't affect timing (District 4 is even).
  // Confirmed via research, 2026-08-26.
  ND: {
    house: (n) => (n === 9 || n === 15 ? 2024 : n % 2 === 0 ? 2024 : 2022),
    senate: (n) => (n % 2 === 0 ? 2024 : 2022),
  },
  // OR Senate: NOT a parity rule — explicit complementary district lists verified via research
  // (each pair sums to 30). House flat 2yr. Confirmed via research, 2026-08-26.
  OR: {
    house: 2024,
    senate: (n) =>
      [1, 2, 5, 9, 12, 14, 18, 21, 22, 23, 25, 27, 28, 29, 30].includes(n) ? 2024 : 2022,
  },
  // RI: both chambers flat 2yr, no staggering (one of 14 states with a 2yr upper chamber).
  // Confirmed via research, 2026-08-26.
  RI: { house: 2024, senate: 2024 },
  // SC: House flat 2yr. Senate flat 4yr, all 46 seats elected together in presidential years (not
  // the gubernatorial cycle) — last regular 2024, next 2028. Confirmed via research, 2026-08-26.
  SC: { house: 2024, senate: 2024 },
  // SD: BOTH chambers flat 2yr, no staggering — SD Senate is unusually not staggered for a
  // 35-member senate. Districts 26/28 are permanently split into 26A/26B/28A/28B (House only,
  // numbering quirk, doesn't affect timing). Confirmed via research, 2026-08-26.
  SD: { house: 2024, senate: 2024 },
  // UT Senate: NOT a parity rule — explicit complementary 14/15 district lists verified against
  // 2022/2024/2026 Wikipedia election articles. District 12's Nov 2024 election was a SPECIAL
  // (filling Karen Mayne's Jan-2023 resignation seat) — its last REGULAR election is still 2022,
  // so it's in the 2022 group despite the 2024 special. House flat 2yr. Confirmed via research,
  // 2026-08-26.
  UT: {
    house: 2024,
    senate: (n) => ([2, 3, 4, 8, 10, 15, 16, 17, 22, 24, 25, 26, 27, 29].includes(n) ? 2024 : 2022),
  },
  // VT: BOTH chambers flat 2yr, no staggering (House's 41 two-member districts and Senate's
  // multi-member districts, e.g. Chittenden, don't affect the cycle). Confirmed via research,
  // 2026-08-26.
  VT: { house: 2024, senate: 2024 },
  // WV House: flat 2yr, single-member since the 2022 redistricting eliminated all multi-member
  // delegate districts. WV Senate rule intentionally omitted here — see the per-senator override
  // note in scripts/build-state-leg-incumbents.mjs (WV Senate staggers WITHIN each shared
  // district: one of the 2 senators per boundary is up each even year, not the whole boundary
  // together, so a single per-district year would misreport half of the 34 senators).
  WV: { house: 2024 },
  // WY Senate: clean parity split — even last regular 2024/next 2028, odd last regular
  // 2022/next 2026 (District 6's 2026 special doesn't affect this). House flat 2yr. Confirmed
  // via research, 2026-08-26.
  WY: { house: 2024, senate: (n) => (n % 2 === 0 ? 2024 : 2022) },
};
