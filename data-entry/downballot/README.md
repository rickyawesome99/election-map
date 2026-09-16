# The Downballot — presidential results by congressional district

Raw sheets, saved verbatim so the build is reproducible if the Google Sheets move or
change. Index of every vintage they publish: https://www.the-downballot.com/p/data

Only the TWO cells the repo cannot already supply are saved here. The other three
(2016 pres on 2016 lines, 2020 pres on 2020 lines, 2024 pres on 2024 lines) already
exist in `data-entry/house_statewide_results.csv`, at better precision — that file
carries vote counts, while these sheets carry percentages only (and the Downballot's
2024-lines sheet rounds to whole percent). Verified 2026-09-16: the President rows of
`house_statewide_results.csv` really are on contemporaneous lines for all three years
(the discriminating test is Pennsylvania in 2016 — mean |diff| 0.14 against the
2016-lines sheet vs 34.63 against the 2018-lines sheet).

| file | sheet | what it is |
|---|---|---|
| `pres_2008_2016_by_2018_lines.csv` | `1zLNAuRqPauss00HDz4XbTH2HqsCzMe0pR8QmD1K8jk8` gid 0 | 2008/2012/2016 pres by the districts used in 2018 (116th). Only the **Pennsylvania** rows are used — the 2018 map is identical to the 2016 map in the other 49 states, so everything else comes from `house_statewide_results.csv`. Percentages only, 1 decimal, share of the FULL total. |
| `pres_2020_by_2022_lines.csv` | `1IfZ8OVWXVpdAvxZtTaDIA2HEN6DtN-H0I0J2KcdxRi4` gid 1913458313 | 2020 pres by the districts used in 2022 (118th), all 435. The 2022 redraw was universal, so no in-repo source covers this. Carries vote counts as well as percentages. |

Re-download (the `gid` matters — gid 0 of the 2022 sheet is a percentages-only tab):

    curl -sL "https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>" -o <file>

Both were cross-validated against the known redraw record on download: the 2018-lines
sheet differs from the 2016-lines sheet in Pennsylvania and nowhere else; the
2022-lines sheet differs from the 2024-lines sheet in exactly AL/GA/LA/NC/NY. Percentages
are share of the full total (third parties included), which is the model's convention —
do not convert to two-party.
