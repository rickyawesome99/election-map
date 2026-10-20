import Link from "next/link";
import PollsterGradeChip from "@/components/PollsterGradeChip";
import { fmtLean, leanColor } from "@/lib/pollsterDisplay";
import type { RecentRacePoll } from "@/lib/pollsterRecord";

// The Polls tab on /analysis/pollsters: the latest polls of this cycle's races, newest first.

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fieldDates = (a: string, b: string) => (a === b ? fmtDay(b) : a.slice(0, 7) === b.slice(0, 7) ? `${fmtDay(a)}–${Number(b.slice(8))}` : `${fmtDay(a)} – ${fmtDay(b)}`);

const raceLabel = (p: RecentRacePoll) => (p.office === "House" ? p.race : `${p.race} ${p.office}`);

function Partisan({ p }: { p: RecentRacePoll }) {
  if (!p.partisan) return null;
  return <span className="ml-1.5 text-[10px] font-bold" style={{ color: leanColor(p.partisan === "R" ? 1 : -1) }} title={`Sponsored by a ${p.partisan === "R" ? "Republican" : "Democratic"} campaign or group`}>({p.partisan})</span>;
}

/** Phones: each poll as two lines, race and margin, then pollster, dates, sample and the two shares. */
function MobilePollList({ polls }: { polls: RecentRacePoll[] }) {
  const muted = { color: "var(--app-text-muted)" };
  return (
    <div>
      {polls.map((p, i) => (
        <div key={i} className="py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm">
              {p.href ? <Link prefetch={false} href={p.href} className="font-semibold hover:underline">{raceLabel(p)}</Link> : <span className="font-semibold">{raceLabel(p)}</span>}
              {p.stage && <span className="ml-1.5 text-[11px]" style={muted}>{p.stage}</span>}
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: leanColor(p.diff) }}>{fmtLean(p.diff)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <PollsterGradeChip grade={p.grade} />
              <span className="min-w-0 truncate">
                {p.slug ? <Link prefetch={false} href={`/analysis/pollsters/${p.slug}`} className="hover:underline">{p.pollster}</Link> : p.pollster}
              </span>
              <Partisan p={p} />
            </span>
            <span className="shrink-0 tabular-nums">
              <span style={{ color: "var(--party-dem)" }}>{p.dem}</span>
              <span style={{ color: "var(--app-text-very-muted)" }}>–</span>
              <span style={{ color: "var(--party-rep)" }}>{p.rep}</span>
            </span>
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
            {fieldDates(p.startDate, p.endDate)}{p.sample != null && <> · {p.sample.toLocaleString()}{p.population ? ` ${p.population}` : ""}</>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RecentRacePollsTable({ polls }: { polls: RecentRacePoll[] }) {
  const head = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
  const cell = "whitespace-nowrap px-2 py-2 tabular-nums";
  return (
    <>
    <div className="md:hidden"><MobilePollList polls={polls} /></div>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>
            <th scope="col" className={`${head} text-left`}>Race</th>
            <th scope="col" className={`${head} text-left`} title="Grade chip = historical accuracy grade">Pollster</th>
            <th scope="col" className={`${head} text-left`} title="Field period">Dates</th>
            <th scope="col" className={`${head} text-right`}>Sample</th>
            <th scope="col" className={`${head} text-right`} title="Democrat's share, two-party where the source reported it that way">Dem</th>
            <th scope="col" className={`${head} text-right`}>Rep</th>
            <th scope="col" className={`${head} text-right`}>Margin</th>
          </tr>
        </thead>
        <tbody>
          {polls.map((p, i) => {
            const label = raceLabel(p);
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="whitespace-nowrap px-2 py-2">
                  {p.href ? <Link href={p.href} className="font-semibold hover:underline">{label}</Link> : <span className="font-semibold">{label}</span>}
                  {p.stage && <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{p.stage}</span>}
                </td>
                <td className="px-2 py-2">
                  <span className="mr-2 align-middle"><PollsterGradeChip grade={p.grade} /></span>
                  {p.slug ? <Link href={`/analysis/pollsters/${p.slug}`} className="hover:underline">{p.pollster}</Link> : p.pollster}
                  <Partisan p={p} />
                </td>
                <td className={cell} style={{ color: "var(--app-text-muted)" }}>{fieldDates(p.startDate, p.endDate)}</td>
                <td className={`${cell} text-right`}>
                  {p.sample?.toLocaleString() ?? "—"}
                  {p.population && <span className="ml-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{p.population}</span>}
                </td>
                <td className={`${cell} text-right`} style={{ color: "var(--party-dem)" }}>{p.dem}</td>
                <td className={`${cell} text-right`} style={{ color: "var(--party-rep)" }}>{p.rep}</td>
                <td className={`${cell} text-right font-semibold`} style={{ color: leanColor(p.diff) }}>{fmtLean(p.diff)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
