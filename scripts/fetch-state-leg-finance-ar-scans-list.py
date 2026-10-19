"""Every report of each Arkansas legacy registration whose newest report is an unread scan (from
fetch-state-leg-finance-ar-legacy.py --sheets index) → SP2/ar/regs.json, with the text reports' line-7 period figure.
  python3 scripts/fetch-state-leg-finance-ar-scans-list.py SP2/ar/regs.json
Scans are then rendered to SP2/ar/img/s{n}.png (+ index.json), read by eye into SP2/ar/read-*.jsonl, and folded by
fetch-state-leg-finance-ar-scans-combine.py into data-entry/state-leg-finance/manual/AR.json."""
import json, os, re, subprocess, sys, datetime
sys.path.insert(0, "/Users/rickyjia/election-map/scripts")
import importlib.util
spec = importlib.util.spec_from_file_location("ar", "/Users/rickyjia/election-map/scripts/fetch-state-leg-finance-ar-legacy.py")
ar = importlib.util.module_from_spec(spec); spec.loader.exec_module(ar)
idx = json.load(open("/private/tmp/claude-501/-Users-rickyjia-election-map/7b2956ab-e26b-44c1-94ba-2b5ad2215584/scratchpad/ar-sheets/index.json"))
want = {i["guid"]: i for i in idx}
tot_scan = tot = 0; out = []
for cycle in (2018, 2020, 2022):
    regs = {}
    for r in ar.reports(cycle - 1) + ar.reports(cycle):
        if r.get("officeType") not in ar.CHAMBER or re.search(r"carryover|debt retirement", r.get("fileName") or "", re.I): continue
        if ar.date(r.get("reportEndDate")).year not in (cycle - 1, cycle): continue
        regs.setdefault(r["legacyFilerRegistrationID"], []).append(r)
    for rid, rs in regs.items():
        if not any(r["filerReportGuid"] in want for r in rs): continue
        rs.sort(key=lambda r: (ar.date(r.get("reportStartDate")), ar.date(r.get("filedDate"))))
        rows = []
        for r in rs:
            t = ar.pdf_text(r["filerReportGuid"])
            m = re.search(r"7\. Total Monetary Contributions[^\n]*?\$([\d,]+\.\d\d)", t)
            rows.append({"guid": r["filerReportGuid"], "start": r.get("reportStartDate"), "end": r.get("reportEndDate"), "ver": r.get("reportVersion"), "file": r.get("fileName"), "scan": not t.strip(), "period": float(m.group(1).replace(",", "")) if m else None})
        tot += len(rows); tot_scan += sum(x["scan"] for x in rows)
        out.append({"cycle": cycle, "rid": rid, "name": rs[0]["filerName"], "reports": rows})
json.dump(out, open(sys.argv[1], "w"), indent=1)
print(len(out), "registrations;", tot, "reports;", tot_scan, "scans")
