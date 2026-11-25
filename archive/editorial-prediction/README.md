# CT Strategies Editorial Prediction (archived 2026-11-25)

The page that lived at `/analysis/editorial-prediction`: the Editorial Board's own 2026 calls (generic
ballot, House, 17 Senate and 20 governor races), each on a
"fight card" with candidate portraits, set against the model and the RCP average. Taken off the site
on 2026-11-25; kept because the design is worth reusing.

`screenshots/` shows the page as it last rendered (desktop light, desktop dark, mobile).

## What is here

| File | What it is |
| --- | --- |
| `app/analysis/editorial-prediction/page.tsx` | The route (server component): header, toplines, fight cards, race rows |
| `components/editorial/EditorialReadouts.tsx` | Client pieces: the margin readout and segment bar with hover/tap states |
| `components/editorial/editorialAxis.tsx` | The margin axis and marks shared by the two files above |
| `data/editorialPrediction.ts` | The board's calls and text, verbatim, frozen as of Nov 3, 2026 |
| `snippets/editorial.css` | The `.ed-*` rules that were in `app/globals.css` |
| `snippets/analysis-hub-card.tsx.txt` | The card on `/analysis` and its "VS" graphic from `HubGraphics.tsx` |
| `screenshots/` | Full-page captures taken from the dev server just before removal |

The files are unchanged from the live versions (moved with `git mv`, so `git log --follow` shows their history).

## What it still depends on in the project

Not archived, because other pages use them. If any of these change, the archived page may need small fixes when restored:

- `components/StandfirstHeader.tsx`, `components/LedgerSectionHead.tsx`
- `lib/candidatePhotos.ts` and the portraits in `public/candidates/`
- `lib/candidatePages.ts`, `lib/raceLinks.ts`, `lib/colorScale.ts` (`fmtMargin`, `marginColor`), `lib/pageLayout.ts`
- `data/statesData.ts`, `data/forecastData.ts` (the `RaceType` type)
- Theme variables in `app/globals.css` (`--party-dem`, `--party-rep`, `--party-ind`, `--app-*`, `--font-serif`)

## To put it back

1. Copy the three mirrored folders back into the project root:
   `cp -R archive/editorial-prediction/app archive/editorial-prediction/components archive/editorial-prediction/data .`
2. Paste `snippets/editorial.css` back into `app/globals.css`.
3. Remove the `/analysis/editorial-prediction` redirect from `next.config.ts`.
4. Optional, to list it again: follow `snippets/analysis-hub-card.tsx.txt` and add the path to `STATIC` in `app/sitemap.ts`.
5. Run `npx tsc --noEmit` and fix anything the dependencies above have drifted on.
