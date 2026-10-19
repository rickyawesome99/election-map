"""Registration totals for Arkansas legacy registrations whose newest report is a scan (line 7 read by eye).
  python3 scripts/fetch-state-leg-finance-ar-scans-combine.py SP2 CACHE [--write MANUAL_JSON]
Total = sum of line-7 period contributions over the registration's reports (one per period, amendments win).
A report's figure stands when its digits were read clearly, or — if the reader flagged an unclear digit — when the
form confirms it (the period balances, or it equals the change in the cumulative column). A date gap between two
reports must be bridged by the cash balance or the cumulative column carrying over, else a report is missing → null."""
import json, sys, glob, re, datetime, hashlib, collections
SP2, CACHE = sys.argv[1], sys.argv[2]
regs = json.load(open(f"{SP2}/ar/regs.json"))
idx = {i["guid"]: i["n"] for i in json.load(open(f"{SP2}/ar/img/index.json"))}
reads = {}
for f in glob.glob(f"{SP2}/ar/read-*.jsonl"):
    for ln in open(f):
        r = json.loads(ln); reads[r["n"]] = r
FOREIGN = {101}  # page belongs to another filer (a circuit judge under Mike Holcomb)
sha = lambda g: hashlib.sha1(open(f"{CACHE}/{g}.pdf", "rb").read()).hexdigest()
owners = collections.defaultdict(set)
for g in regs:
    for r in g["reports"]:
        if r["scan"] and r["guid"] in idx:
            owners[sha(r["guid"])].add(g["rid"])
d = lambda s: datetime.datetime.strptime(s, "%m/%d/%Y").date()
near = lambda a, b: a is not None and b is not None and abs(a - b) < 1.0
res, why, xs = {}, {}, []
for g in regs:
    key = (g["cycle"], g["rid"], g["name"])
    by, seen = {}, set()
    for r in g["reports"]:
        if r["scan"] and r["guid"] in idx:
            h = sha(r["guid"])
            if len(owners[h]) > 1:
                why[key] = f"#{idx[r['guid']]} is another filer's report"; break
            if h in seen:
                continue
            seen.add(h)
            n = idx[r["guid"]]
            if n in FOREIGN:
                why[key] = f"#{n} is another filer's report"; break
            if re.search(r"affidavit|signature card|carryover fund form", reads.get(n, {}).get("note", ""), re.I):
                continue
        by[(r["start"], r["end"])] = r
    if key in why:
        continue
    rs = sorted(by.values(), key=lambda r: (d(r["start"]), d(r["end"])))
    total, prev, ok = 0.0, None, True
    for r in rs:
        if not r["scan"]:
            x = {"L7p": r["period"], "note": ""}
        elif r["guid"] not in idx or idx[r["guid"]] not in reads:
            ok, why[key] = False, f"unread scan {r['start']}"; break
        else:
            x = reads[idx[r["guid"]]]
        n = idx.get(r["guid"], "text")
        if x.get("L7p") is None and None not in (x.get("L4"), x.get("L8p"), x.get("L9")) and near(x["L4"] + (x.get("L5") or 0) + (x.get("L6") or 0) - x["L8p"], x["L9"]):
            x = dict(x, L7p=0.0)  # blank contributions box, and the period balances only with none
        if x.get("L7p") is None:
            ok, why[key] = False, f"#{n} no contributions figure ({x['note'][:50]})"; break
        L4, L5, L6, L8, L9 = (x.get(k) for k in ("L4", "L5", "L6", "L8p", "L9"))
        bal = None not in (L4, L8, L9) and (near(L4 + (L5 or 0) + (L6 or 0) + x["L7p"] - L8, L9) or near(L4 + (L6 or 0) + x["L7p"] - L8, L9)
                                           or near((L5 or 0) + (L6 or 0) + x["L7p"] - L8, L9))  # interest left out; opening balance left out
        cumd = prev is not None and x.get("L7c") is not None and prev.get("L7c") is not None and near(x["L7c"] - prev["L7c"], x["L7p"])
        if r["scan"] and None not in (L4, L8, L9) and not (bal or cumd):
            # a period that does not add up may hold a figure in the wrong column (a cumulative in the period box)
            ok, why[key] = False, f"#{n} does not balance and the cumulative column does not confirm it"; break
        if re.search(r"ambiguous|illegible|unclear", x["note"], re.I) and not (bal or cumd):
            ok, why[key] = False, f"#{n} unclear digits not confirmed by the form"; break
        if prev is not None and (d(r["start"]) - d(prev["end"])).days > 1:
            bridged = near(prev.get("L9"), L4) or (x.get("L7c") and prev.get("L7c") is not None and near(x["L7c"] - x["L7p"], prev["L7c"]))
            if not bridged:
                ok, why[key] = False, f"gap {prev['end']}→{r['start']} not bridged (missing report?)"; break
        total += x["L7p"]
        prev = dict(x, end=r["end"])
    if ok and (prev is None or d(prev["end"]) < datetime.date(g["cycle"], 5, 1)):
        ok, why[key] = False, "reports stop before the election year's primary" if prev else "no contribution report"
    if ok:
        res[key] = round(total, 2)
        cums = [reads[idx[r["guid"]]].get("L7c") for r in rs if r["scan"] and r["guid"] in idx and reads[idx[r["guid"]]].get("L7c")]
        xs.append((key, total, max(cums) if cums else None))
        if cums and not near(total, max(cums)):
            # the filer's own running total disagrees: a report missing (sum low) or overlapping periods (sum high)
            del res[key]; why[key] = f"sum {total:.2f} vs written cumulative {max(cums):.2f}"
for k, v in sorted(res.items()): print("OK  ", k, v)
for k, v in sorted(why.items()): print("NULL", k, v)
print("cross-check vs largest cumulative written:")
for k, t, c in xs:
    if c is not None: print("   ", k[2], k[0], t, c, "MATCH" if near(t, c) else ("sum>cum" if t > c else "SUM<CUM"))
print(len(res), "totals,", len(why), "null")
if "--write" in sys.argv:
    path = sys.argv[sys.argv.index("--write") + 1]
    try: man = json.load(open(path))
    except FileNotFoundError: man = {"reports": {}}
    for g in regs:
        k = (g["cycle"], g["rid"], g["name"])
        if k in res:
            newest = max(enumerate(g["reports"]), key=lambda t: (d(t[1]["end"]), t[1]["ver"] != "Orginal", t[0]))[1]["guid"]
            man["reports"][newest] = {"contributions": res[k], "method": "sum of line-7 period figures, scans read by eye", "name": k[2], "cycle": k[0]}
    json.dump(man, open(path, "w"), indent=1, sort_keys=True)
    print("wrote", path, len(man["reports"]))
