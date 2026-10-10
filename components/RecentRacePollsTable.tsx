import Link from "next/link";
import PollsterGradeChip from "@/components/PollsterGradeChip";
import { fmtLean, leanColor } from "@/lib/pollsterDisplay";
import type { RecentRacePoll } from "@/lib/pollsterRecord";

// The Polls tab on /analysis/pollsters: the latest polls of this cycle's races, newest first.

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fieldDates = (a: string, b: string) => (a === b ? fmtDay(b) : a.slice(0, 7) === b.slice(0, 7) ? `${fmtDay(a)}–${Number(b.slice(8))}` : `${fmtDay(a)} – ${fmtDay(b)}`);

export default function RecentRacePollsTable({ polls }: { polls: RecentRacePoll[] }) {
  const head = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
  const cell = "whitespace-nowrap px-2 py-2 tabular-nums";
  return (
    <div className="overflow-x-auto">
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
            const label = p.office === "House" ? p.race : `${p.race} ${p.office}`;
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <td className="whitespace-nowrap px-2 py-2">
                  {p.href ? <Link href={p.href} className="font-semibold hover:underline">{label}</Link> : <span className="font-semibold">{label}</span>}
                  {p.stage && <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{p.stage}</span>}
                </td>
                <td className="px-2 py-2">
                  <span className="mr-2 align-middle"><PollsterGradeChip grade={p.grade} /></span>
                  {p.slug ? <Link href={`/analysis/pollsters/${p.slug}`} className="hover:underline">{p.pollster}</Link> : p.pollster}
                  {p.partisan && <span className="ml-1.5 text-[10px] font-bold" style={{ color: leanColor(p.partisan === "R" ? 1 : -1) }} title={`Sponsored by a ${p.partisan === "R" ? "Republican" : "Democratic"} campaign or group`}>({p.partisan})</span>}
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
  );
}
