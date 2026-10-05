# CT Strategies — 2026 Election Forecast

A forecast of the 2026 U.S. midterms built on an atlas of past results. Every House, Senate and
governor race gets a projected margin, win probability and rating, and each seat links to its
results history, district lines and candidates. The site also covers historical results by
state, county and district (from 2008), state legislative results for every chamber (from 2016),
the True Partisan Lean (TPL) model, turnout, pollster ratings and an address lookup.

How every number is calculated, the backtests and the full source list are on the site's
**Methodology** tab (`/methodology`), which reads its constants from the code. That tab is the
reference for the models; this file covers working on the code.

## Running it

Requires Node 20 or later.

```bash
npm install
npm run dev        # http://localhost:3000
```

`npm run dev` and `npm run build` first run `npm run history` (about 20 seconds), which reruns the
forecast for every day since January to draw the Overview's "Forecast Over Time" chart. The
output, `data/generated/`, is not committed.

Other checks:

```bash
npx tsc --noEmit   # type check
npm run lint
npm run test:e2e   # Playwright browser tests; uses the dev server on :3000 if it is running
```

## How the code is laid out

| Path | What it holds |
|---|---|
| `app/` | Next.js pages. Almost every page is prerendered at build time. |
| `components/` | React components. Client components never import the forecast code or the large datasets; the server passes them what they need. |
| `lib/forecast.ts`, `lib/tplCompute.ts` | The forecast and the TPL model: every race margin, probability and chamber simulation comes from here. |
| `data-entry/` | Source data, mostly CSVs, plus the scripts that turn them into TypeScript. Hand-edited inputs live here. |
| `data/` | Generated TypeScript datasets the site imports. Don't edit these by hand; rerun the script that writes them (named in each file's header). |
| `public/` | Map files (TopoJSON), candidate photos and other static files. |
| `scripts/` | Fetch, build, audit and backtest scripts. Each one documents its purpose and usage at the top. |
| `tests/e2e/` | Playwright tests. |

Margins are R-positive throughout the code: −5 means D+5.

## Updating the data

| Task | Command |
|---|---|
| Refresh race polls from Wikipedia, rebuild, and print what moved | `npm run refresh` |
| Rebuild races, candidates and past results after editing the seat CSVs | `node data-entry/build.js` |
| Rebuild the generic ballot, approval or national environment | `node data-entry/build-generic-ballot.js`, `build-trump-approval.js`, `build-national-environment.js` |
| Regenerate the forecast-over-time series | `npm run history` |
| Save today's forecast as a dated record in `data/forecast-history/` | `npm run snapshot` |
| Export the model to CSV | `npm run export:model`, `npm run export:county-tpl` |

**After a model change**, regenerate the Methodology tab's backtest tables and add an entry to
`data/methodologyChangelog.ts`:

```bash
npx tsx --conditions=react-server scripts/forwardBacktest.ts --env struct --emit
npx tsx --conditions=react-server scripts/tplBacktest.ts --emit
npx tsx --conditions=react-server scripts/turnoutBacktest.ts --emit
```

**After a congressional map change** (a new map, or a court reverting one), the map files, the
district data and the District Finder all need updating. The District Finder takes its districts
from the Census geocoder, so check it against the site's own map with
`node scripts/audit-district-finder-lines.mjs`, and add an override in
`app/api/districts/route.ts` for any state where the Census lines are not the ones on the ballot.

## Deployment

The site deploys to Vercel from `main`. Vercel runs `npm run build`, which regenerates the
forecast-over-time series and prerenders every page. Server-side files read at runtime must use
a literal path (`join(process.cwd(), "data", "file.json")`) so Vercel includes them in the
deployment; a computed path makes it bundle the whole repository and breaks the 250 MB limit.

The sitemap, `robots.txt` and link-preview images use the production domain Vercel reports.
Set `SITE_URL` to override it.

## Credits

Data comes from public sources: state election offices, the U.S. Census Bureau, the Federal
Election Commission, the MIT Election Data and Science Lab, Wikipedia and others, all listed on
the Methodology tab's Sources page. Candidate photos come from official government portraits,
Wikimedia Commons and campaign materials, and belong to their respective owners. Maps use data
© OpenStreetMap contributors.
