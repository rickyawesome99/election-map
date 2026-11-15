# Precinct project data

Workplan: https://claude.ai/artifact/5U1Npb4bXgpRoELf8U1UNC (decisions D1–D8 and the phase table).

Anchor rule (D1, 2026-11-14): every state uses its **2024 general-election precinct layer** as the one
geometry. Results from other years are re-aggregated onto it through 2020 Census blocks, weighted by
population, never by area. 2026 results join by precinct name where the state did not re-precinct.

```
data-entry/precincts/
  raw/            gitignored  downloads as fetched (RDH zips, state GIS, VEST, MEDSL, block files)
  anchor/         gitignored  {ST}.geojsonl  repaired anchor layer, one feature per precinct
  anchors/        committed   {ST}.json      provenance + per-precinct metadata (pid, geoid, name,
                                             county, cd/sldu/sldl per era, pop, area_km2)
  sources.csv     committed   one row per state: anchor source, URL, license, download date, notes
public/precincts/
  tiles/{ST}.pmtiles          per-state geometry archive (scripts/precincts/build_tiles.py), ~150 MB total
  results/{ST}/{year}.json    positional vote arrays aligned to pid order (later phase)
```

Anchor feature properties (GeoJSONSeq, one line per precinct):

| field | type | meaning |
|---|---|---|
| `pid` | int | unique nationally; `state_fips * 1_000_000 + running index`; the tile feature id |
| `st` | str | postal code |
| `geoid` | str | source precinct id (official code or RDH `UNIQUE_ID`) |
| `name` | str | display name |
| `county` | str | 5-digit county FIPS |

Everything else about a precinct (district assignments per era, population, flags) lives in
`anchors/{ST}.json`, keyed by `pid`, so the tiles never need rebuilding for an attribute change.

Credit lines required by sources (keep /sources in step): Redistricting Data Hub boundaries →
"This map was created using data from the Redistricting Data Hub."
