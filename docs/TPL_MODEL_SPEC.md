# True Partisan Lean (TPL) Model — Full Specification

## Purpose

TPL is a custom metric that strips four non-structural effects from raw election margins to expose the underlying partisan lean of a state:

1. **Incumbency / Presidential approval** (IF)
2. **Candidate quality** (CQ → CF)
3. **Fundraising advantages** (FF)
4. **National wave** (WA)

The output, **Neutralized Margin (NM)**, is what a race would have looked like with generic candidates, no wave, and no structural advantages. Aggregating NMs across race types and years produces the state's **True Partisan Lean (TPL)**.

---

## Sign Convention

**R-positive throughout.** Positive = Republican advantage, negative = Democratic advantage.

- Raw margin = `repPct − demPct`
- State Legislature = `(repVotes − demVotes) / (repVotes + demVotes) × 100`
- NES values are R-positive
- Display functions map positive → R color/label

---

## Race Types

| Code | Race | Base weight |
|------|------|-------------|
| P | President | 0.25 |
| S | U.S. Senate | 0.25 |
| H | U.S. House | 0.30 |
| L | State Legislature | 0.10 |
| G | Governor | 0.10 |

Weights are redistributed proportionally among race types actually present in a given year.

---

## Year Weights (recency decay)

| Year | Weight |
|------|--------|
| 2024 | 0.40 |
| 2022 | 0.28 |
| 2020 | 0.20 |
| 2018 | 0.12 |

Odd-year governor races (NJ, VA) appear in the race table but are not yet included in Pre-TPL aggregation pending NES derivation for those years.

---

## Full Formula Pipeline

```
1.  Raw = repPct − demPct   (R-positive)

2.  Adjusted:
      if |Raw| ≤ 65  →  Adjusted = Raw
      if |Raw| > 65  →  Adjusted = 0.6 × priorContested + 0.4 × priorPresidential
      (priorContested = most recent result with |margin| ≤ 65 for same seat)

3.  IF  (see below — differs by race type)

4.  CQ = WQ × LQ   (see tier tables)

5.  CF  (differs by race type — see below)

6.  FF pts = Adjusted × (FF − 1)   [default FF = 1.00 → 0 pts; pending calibration]

7.  WA = 0.70 × WA_add + 0.30 × WA_mult
      WA_add  = NES × S × k_add                          (k_add = 0.35)
      WF      = 1 / (1 + NES × S × k_mult × sign(Adj))  (k_mult = 0.05, bounded [0.6, 1.6])
      WA_mult = Adjusted × (1 − WF)
      Positive WA = R wave stripped. WA = 0 if no S.

8.  NM (differs by race type — see below)

9.  WRS = weighted avg of type-NMs for races present that year
      (House districts averaged first; Senate seats averaged if two in same year)

10. Pre-TPL = Σ(year_weight × WRS)

11. TPL = Pre-TPL − median(all 50 states' Pre-TPL)   ← LIVE, computed each render
```

---

## Step 3: Incumbency Factor (IF)

IF is a multiplier. Its meaning differs between presidential and all other races.

### Non-P races (G / S / H / L) — seat incumbency

| Situation | IF |
|---|---|
| Open seat | 1.00 |
| Incumbent won (H) | 0.80 |
| Incumbent won (S / Leg) | 0.875 |
| Incumbent won (G) | 0.835 |
| Challenger won (H) | 1.25 |
| Challenger won (S / Leg) | 1.14 |
| Challenger won (G) | 1.20 |

Source: `forecastData.ts` incumbent flags + race outcome. Computed by `computeIF()` in `TplModelPage.tsx`.

### P races — presidential approval

The incumbent president's net approval (approval − disapproval) on election day drives IF for presidential races, replacing the fixed 1.00 default:

```
IF = 1 + presMargin × k_pif × partySign

  presMargin  = approval − disapproval (from popVoteData.ts)
  partySign   = +1 if D incumbent president, −1 if R incumbent president
  k_pif       = 0.005   (scaling constant, pending calibration)
```

| Year | presMargin | President party | IF |
|------|------------|-----------------|-----|
| 2024 | −15.2 | D (Biden) | 0.924 |
| 2020 | −6.6 | R (Trump) | 1.033 |

Auto-computed from `popVoteData.ts`. No manual entry needed.

**Rationale:** WA already strips the national wave (derived from House popular vote, which embeds presidential approval). IF for P races captures the residual presidential-specific approval effect on the presidential result that WA does not fully account for.

---

## Step 4: Candidate Quality (CQ = WQ × LQ)

CQ is a multiplier reflecting the quality of the winning and losing candidates relative to a generic candidate.

### WQ — Winning Candidate Quality

| Tier | Multiplier | Meaning |
|------|-----------|---------|
| Elite | 0.75 | Winner far outperformed a generic candidate |
| Strong | 0.88 | Winner modestly outperformed |
| Generic | 1.00 | No adjustment |
| Weak | 1.12 | Winner underperformed |
| Sacrificial | 1.25 | Winner significantly underperformed |

### LQ — Losing Candidate Quality (inverse)

| Tier | Multiplier | Meaning |
|------|-----------|---------|
| Elite | 1.25 | Opponent was unusually strong — inflates the signal |
| Strong | 1.12 | Opponent was above average |
| Generic | 1.00 | No adjustment |
| Weak | 0.88 | Opponent was below average |
| Sacrificial | 0.75 | Opponent was very weak |

Default: Generic / Generic → CQ = 1.00 → CF contribution = 0.

### Data entry

CQ tiers are the only manually-entered model inputs. Stored in `data/tplModelData.ts`:

- **Per-state**: `STATE_RACE_INPUTS[stateAbbr]` — array of `{ race, raceType, year, wqTier?, lqTier? }`
- **Global presidential**: `PRESIDENTIAL_INPUTS_BY_YEAR[year]` — applied to P races for all 50 states unless overridden by a state-specific entry

Currently populated:
- 2024 President (all states): `wqTier: "Strong"` (Trump), `lqTier: "Weak"` (Harris)
- Iowa: all races 2018–2024

---

## Step 5: Candidate Factor (CF)

CF encodes the combined point contribution of IF and CQ. **The formula differs by race type** because the relationship between IF and CQ differs:

### Non-P races (G / S / H / L) — multiplicative

The incumbent IS the candidate, so incumbency and candidate quality are intertwined:

```
CF = Adjusted × (IF × CQ − 1)
```

### P races — additive

The incumbent president may not be on the ballot (e.g., Biden/Harris 2024). Presidential approval and candidate quality are independent effects:

```
cappedAdj = sign(Adjusted) × min(|Adjusted|, CQ_MARGIN_CAP)   [CQ_MARGIN_CAP = 15]

CF = Adjusted × (IF − 1) + cappedAdj × (CQ − 1)
   = IF_pts + CQ_pts
```

**CQ margin cap:** In structural blowout states, most of the margin is locked-in base voters who don't respond to candidate quality. CQ scales against at most ±15 pts of the margin. IF (presidential approval) is not capped — the approval effect scales with the partisan composition of the state.

---

## Step 6: Fundraising Factor (FF)

```
FF pts = Adjusted × (FF − 1)
```

Default: `FF = 1.00` → 0 pts. Pending calibration from campaign finance data. Stored per-race in `RaceModelInputs.FF`.

---

## Step 7: Wave Adjustment (WA)

```
WA_add  = NES × S × k_add                                  (k_add = 0.35)
WF      = 1 / (1 + NES × S × k_mult × sign(Adjusted))     (k_mult = 0.05, bounded [0.6, 1.6])
WA_mult = Adjusted × (1 − WF)
WA      = 0.70 × WA_add + 0.30 × WA_mult
```

Positive WA = R wave being stripped. WA = 0 for states without S.

### NES — National Environment Score (R-positive)

| Year | NES | Description |
|------|-----|-------------|
| 2018 | −7.1 | D wave (anti-Trump midterm) |
| 2020 | −2.3 | Slight D lean |
| 2022 | +4.2 | R wave (anti-Biden midterm) |
| 2024 | +3.5 | R lean |

### S — State Wave Sensitivity Coefficient

Auto-computed from `houseDelegationHistory` × `popVoteData` for all 50 states.

```
S = avg(state House swing ÷ national House swing)
    over stable cycles where |national swing| ≥ 1 pt
```

S > 1.0 = state amplifies national swings. S < 1.0 = state dampens them.
Computed by `calculateStateS()` in `tplModelData.ts`. Stored in `STATE_MODEL_CONSTANTS[stateAbbr].S`.

---

## Step 8: Neutralized Margin (NM)

### Non-P races

```
NM = Adjusted × (IF × CQ) + FF_pts − WA
   = Adjusted + CF + FF_pts − WA
```

### P races

```
NM = Adjusted + CF + FF_pts − WA
   where CF = Adjusted × (IF − 1) + cappedAdj × (CQ − 1)
```

NM is the stripped partisan signal: what the race result would look like with no incumbency advantage, no candidate quality differential, no fundraising imbalance, and no national wave.

---

## Step 9: WRS — Weighted Race Score

One year's TPL signal. For a given state and year:

1. Compute NM for each race
2. Average NMs across districts for House (one House NM per year per state)
3. Average NMs if two Senate seats in same year
4. Compute weighted average across race types present, redistributing weights proportionally:

```
WRS = Σ(redistributed_weight[type] × typeNM[type])
```

---

## Step 10: Pre-TPL

```
Pre-TPL = Σ(YEAR_WEIGHTS[year] × WRS[year])
```

Only years in `YEAR_WEIGHTS` are included (currently 2018–2024, even years only).

---

## Step 11: TPL

```
TPL = Pre-TPL − median(all 50 states' Pre-TPL)
```

The 50-state median is recomputed live on every render using all states' Pre-TPL values. This centers the median state at EVEN. All 50 states are computed every render regardless of which state is selected.

---

## Key Files

| File | Role |
|---|---|
| `data/tplModelData.ts` | Global constants, S computation, CQ tier values, per-state and global presidential race inputs |
| `data/popVoteData.ts` | Presidential approval data (`presMargin`, `presInc`) used to auto-compute IF for P races |
| `data/forecastData.ts` | Raw margins, incumbent flags — read at render time |
| `components/TplModelPage.tsx` | All computation logic + UI. `calculateStateModel()` runs for all 50 states each render. |
| `components/ForecastMap.tsx` | Mounts `<TplModelPage />` at `activeTab === "model"` |

---

## Data Sources by Column

| Column | Source |
|---|---|
| Raw | `forecastData.ts` — live election results |
| Adjusted | Computed from Raw + prior results in `forecastData.ts` |
| Incumbent | `forecastData.ts` incumbent flags |
| IF (non-P) | `forecastData.ts` incumbent flags → `computeIF()` |
| IF (P) | `popVoteData.ts` presMargin + presInc → auto-computed |
| WQ / LQ | `tplModelData.ts` — manually entered |
| CQ | Computed: `WQ_VALUES[wqTier] × LQ_VALUES[lqTier]` |
| CF | Computed: additive (P) or multiplicative (non-P) |
| FF | `tplModelData.ts` — manually entered (all default 0) |
| WA | `popVoteData.ts` (NES) + `tplModelData.ts` (S, k values) |
| NM | Computed |
| S | Auto-computed from `forecastData.ts` + `popVoteData.ts` |

---

## Global Constants (`TPL_GLOBAL_CONSTANTS`)

| Constant | Value | Notes |
|---|---|---|
| `k_add` | 0.35 | Additive WA scaling — placeholder |
| `k_mult` | 0.05 | Multiplicative WA scaling — placeholder |
| `k_pif` | 0.005 | Presidential approval IF scaling — placeholder |
| `CQ_MARGIN_CAP` | 15 | Max margin CQ scales against in P races |
| `RACE_TYPE_WEIGHTS` | P=0.25, S=0.25, H=0.30, L=0.10, G=0.10 | Base weights before redistribution |
| `YEAR_WEIGHTS` | 2024=0.40, 2022=0.28, 2020=0.20, 2018=0.12 | Recency decay |
| `NES_BY_YEAR` | 2018=−7.1, 2020=−2.3, 2022=+4.2, 2024=+3.5 | National environment |

---

## `RaceModelInputs` Interface

```ts
interface RaceModelInputs {
  race: string;        // display label + lookup key
  district?: string;   // for House races
  raceType: "P" | "S" | "G" | "H" | "L";
  year: number;
  wqTier?: CQTier;   // default: "Generic"
  lqTier?: CQTier;   // default: "Generic"
  FF?: number;        // default: 1.00 → 0 pts
}
```

Not stored here: incumbent (from forecastData), IF (auto-computed), S (auto-computed).

---

## Adding a New State

```ts
// In data/tplModelData.ts:
STATE_RACE_INPUTS["TX"] = [
  { race: "President",  raceType: "P", year: 2024 },  // CQ from PRESIDENTIAL_INPUTS_BY_YEAR
  { race: "Senate",     raceType: "S", year: 2022, lqTier: "Strong" },
  // ... WQ/LQ omitted = Generic
];
// S is auto-computed. IF is auto-computed. No other files need to change.
```

User provides CQ tiers as `"WQTier/LQTier"` strings (left = winner, right = loser).

---

## What's Left to Build

| # | Item | Status |
|---|---|---|
| 1 | S for all 50 states | Done (auto-computed) |
| 2 | Final 50-state centering | Done (live) |
| 3 | IF for all P races | Done (auto-computed from approval) |
| 4 | 2024 P CQ (all states) | Done (Strong/Weak global) |
| 5 | WQ/LQ tiers — Iowa | Done |
| 6 | WQ/LQ tiers — other 49 states | Pending — enter per race |
| 7 | FF inputs | Pending — all default 0 |
| 8 | NES for odd years (2017, 2021, 2025) | Pending — needed for NJ/VA governor races |
| 9 | Extend YEAR_WEIGHTS to odd years | Pending — after NES values derived |
| 10 | k calibration (k_add, k_mult, k_pif) | Pending |
