#!/usr/bin/env python3
"""Download the raw 2026 results for scripts/results_2026/build.py.

    python3 scripts/results_2026/fetch.py            # civicAPI (all states) + every direct source
    python3 scripts/results_2026/fetch.py civicapi   # civicAPI only
    python3 scripts/results_2026/fetch.py direct     # direct sources only
    python3 scripts/results_2026/fetch.py NC MN      # just these states' direct sources

Raw files land in data-entry/results-2026/raw/ (gitignored), each one stamped in raw/manifest.json
with when it was read. civicAPI is read for every state, direct states included: build.py checks a
direct source's toplines against it, and falls back to it for any race the direct file lacks.
"""
import gzip, json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from common import RAW, STATES, UA, sources

CIVIC = "https://civicapi.org/api/v2"
CIVIC_TYPES = {"US Senate", "Governor", "House of Representatives", "State House", "State Senate"}
EXT = {"enhanced_voting": "json", "ncsbe": "zip", "mn_sos": "txt", "hi_oe": "txt"}
# ResultsExport.aspx (MT; SD and OR run the same platform but their exports differ, see sources.csv): ASP.NET page whose export links are postbacks returning xlsx.
EXPORT_TARGETS = {"MT": ["Statewide", "Legislative"]}


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print(f"  retry {url}: {e}", file=sys.stderr)
            time.sleep(3 * (i + 1))


def stamp(manifest, key, url, size):
    manifest[key] = {"url": url, "fetched_at": now(), "bytes": size}


def fetch_civicapi(manifest):
    (RAW / "civicapi" / "race").mkdir(parents=True, exist_ok=True)
    ids = []
    for st in STATES:
        url = f"{CIVIC}/race/search?province={st}&startDate=2026-11-03&endDate=2026-11-03&limit=5000"
        body = get(url)
        (RAW / "civicapi" / f"search-{st}.json").write_bytes(body)
        races = json.loads(body)["races"]
        # Chamber summary rows (State House with no district) are the feed's own seat tally.
        mine = [r for r in races if r["type"] in CIVIC_TYPES and (r.get("district") or r["type"] in ("US Senate", "Governor"))]
        ids += [r["id"] for r in mine]
        print(f"  civicAPI {st}: {len(mine)} races")
    print(f"civicAPI: fetching {len(ids)} full race payloads")

    def one(rid):
        body = get(f"{CIVIC}/race/{rid}")
        with gzip.open(RAW / "civicapi" / "race" / f"{rid}.json.gz", "wb") as f:
            f.write(body)
        return rid, len(body)

    done = 0
    with ThreadPoolExecutor(6) as pool:
        for rid, size in pool.map(one, ids):
            stamp(manifest, f"civicapi/race/{rid}", f"{CIVIC}/race/{rid}", size)
            done += 1
            if done % 500 == 0:
                print(f"  {done}/{len(ids)}")


def fetch_results_export(s, manifest):
    import html, http.cookiejar, re, urllib.parse
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    page = opener.open(urllib.request.Request(s["url"], headers=UA), timeout=120).read().decode("utf-8", "replace")
    form = {k: html.unescape(v) for k, v in re.findall(r'<input[^>]+name="([^"]+)"[^>]*value="([^"]*)"', page)}
    for target in EXPORT_TARGETS[s["state"]]:
        data = urllib.parse.urlencode({**form, "__EVENTTARGET": f"ctl00$MainContent${target}", "__EVENTARGUMENT": ""}).encode()
        body = opener.open(urllib.request.Request(s["url"], data=data, headers=UA), timeout=120).read()
        if not body.startswith(b"PK"):
            raise RuntimeError(f"{s['state']} {target} export did not return a workbook")
        path = RAW / "direct" / f"{s['state']}-{target}.xlsx"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        stamp(manifest, f"direct/{s['state']}", s["url"], len(body))
        print(f"  {s['state']} {s['source']} {target}: {len(body):,} bytes")


def fetch_direct(manifest, only=None):
    for s in sources():
        if s["kind"] != "direct" or (only and s["state"] not in only):
            continue
        if s["adapter"] == "results_export":
            fetch_results_export(s, manifest)
            continue
        body = get(s["url"])
        path = RAW / "direct" / f"{s['state']}.{EXT[s['adapter']]}"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        stamp(manifest, f"direct/{s['state']}", s["url"], len(body))
        print(f"  {s['state']} {s['source']}: {len(body):,} bytes")


def main(args):
    RAW.mkdir(parents=True, exist_ok=True)
    mpath = RAW / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {}
    states = [a for a in args if a.upper() in STATES and len(a) == 2]
    try:
        if not args or "civicapi" in args:
            fetch_civicapi(manifest)
        if not args or "direct" in args or states:
            fetch_direct(manifest, {s.upper() for s in states} or None)
    finally:
        mpath.write_text(json.dumps(manifest, indent=1, sort_keys=True))


if __name__ == "__main__":
    main(sys.argv[1:])
