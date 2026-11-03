# FEC "all candidates" summaries, 2012 and 2014 cycles (House rows only)

Downloaded 2026-11-03 from https://www.fec.gov/files/bulk-downloads/2012/weball12.zip and
.../2014/weball14.zip (official, full-cycle). Columns kept: cand_id, name, status (I incumbent /
C challenger / O open), party, state, district, receipts, disbursements, cash_end, individual_contrib,
coverage_end. Every filer is listed, primary losers included; the general-election nominee per district
must be matched to the results file by name, as scripts/fetch-fec-race-finance.py does for 2026.

Intended use: the fundraising strip for 2012 and 2014 House rows of the 2018/2020 backtest leans, once
2012/2014 House results by district are on file (MIT Election Lab 1976–2024 House returns, guestbook download).
