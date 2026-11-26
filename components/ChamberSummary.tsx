import { SplitBar } from "@/components/LegislatureChambersTable";

// Header visuals. Numbers stay in text ink; the party color rides on the marks beside them.
function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{children}</span>;
}

function BigNum({ value, label, color, align = "left" }: { value: string; label: string; color: string; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <div className="text-2xl font-bold tabular-nums leading-tight" style={{ color }}>{value}</div>
      <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{label}</div>
    </div>
  );
}

export type ControlRow = { label: string; d: number; r: number; fmt: (n: number) => string };

/** A header summary: a seat split on one bar, the seats changing hands, and a before/after pair of
 *  bars. /legislatures sums it over every chamber with an election; /house, /senate and /governor
 *  show their one chamber (components/ChamberPage.tsx). */
export default function ChamberSummary({ seatsKicker, seatsNote, seats, othNote, flipsKicker, flips, controlKicker, controlRows, controlFoot, controlUnit = "chambers" }: {
  seatsKicker: string; seatsNote: string;
  seats: { dem: number; rep: number; oth: number; total: number }; othNote: string;
  flipsKicker: string; flips: { toD: number; toR: number; titleD: string; titleR: string };
  controlKicker: string; controlRows: ControlRow[]; controlFoot: React.ReactNode;
  /** What the control rows count, for the bars' hover text: "chambers" or "seats". */
  controlUnit?: string;
}) {
  return (
    <>
            {/* Seats on the ballot: one bar, D | independent | R, with the halfway tick. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Kicker>{seatsKicker}</Kicker>
              <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{seatsNote}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <BigNum value={Math.round(seats.dem).toLocaleString()} label="Democratic" color="var(--party-dem)" />
              {Math.round(seats.oth) > 0 && (
                <span className="pb-1 text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  <b style={{ color: "var(--app-text-primary)" }}>{Math.round(seats.oth)}</b> independent{othNote}
                </span>
              )}
              <BigNum value={Math.round(seats.rep).toLocaleString()} label="Republican" color="var(--party-rep)" align="right" />
            </div>
            <div className="relative mt-2">
              <SplitBar height={14} parts={[
                { value: seats.dem, color: "var(--party-dem)", title: `${Math.round(seats.dem).toLocaleString()} Democratic seats` },
                { value: seats.oth, color: "var(--party-ind)", title: `${Math.round(seats.oth)} independent seats` },
                { value: seats.rep, color: "var(--party-rep)", title: `${Math.round(seats.rep).toLocaleString()} Republican seats` },
              ]} />
              <span aria-hidden className="absolute -bottom-1 -top-1 left-1/2 w-px" style={{ background: "var(--app-text-primary)" }} />
            </div>
            <div className="mt-1 text-center text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>half of {seats.total.toLocaleString()}</div>

            <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
              {/* Seat flips, both bars on one scale. */}
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <Kicker>{flipsKicker}</Kicker>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: flips.toD >= flips.toR ? "var(--party-dem)" : "var(--party-rep)" }}>
                    net {flips.toD >= flips.toR ? "D" : "R"} +{Math.abs(flips.toD - flips.toR)}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {[
                    { n: flips.toD, label: "R-held → D", color: "var(--party-dem)", title: flips.titleD },
                    { n: flips.toR, label: "D-held → R", color: "var(--party-rep)", title: flips.titleR },
                  ].map((f) => (
                    <div key={f.label} className="grid items-center gap-3" style={{ gridTemplateColumns: "5.5rem 1fr 2.5rem" }} title={`${f.n} ${f.title}`}>
                      <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>{f.label}</span>
                      <span className="h-3">
                        <span className="block h-full rounded-r" style={{ width: `${Math.max(1, (f.n / Math.max(flips.toD, flips.toR, 1)) * 100)}%`, background: f.color }} />
                      </span>
                      <span className="text-right text-sm font-bold tabular-nums">{f.n}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chamber control, now vs projected. */}
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <Kicker>{controlKicker}</Kicker>
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {controlRows.map((row) => (
                    <div key={row.label} className="grid items-center gap-3" style={{ gridTemplateColumns: "5.5rem 1fr" }}>
                      <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="w-8 text-right text-sm font-bold tabular-nums" style={{ color: "var(--party-dem)" }}>{row.fmt(row.d)}</span>
                        <div className="relative flex-1">
                          <SplitBar height={12} parts={[
                            { value: row.d, color: "var(--party-dem)", title: `${row.fmt(row.d)} Democratic ${controlUnit}` },
                            { value: row.r, color: "var(--party-rep)", title: `${row.fmt(row.r)} Republican ${controlUnit}` },
                          ]} />
                          <span aria-hidden className="absolute -bottom-1 -top-1 left-1/2 w-px" style={{ background: "var(--app-text-primary)" }} />
                        </div>
                        <span className="w-8 text-sm font-bold tabular-nums" style={{ color: "var(--party-rep)" }}>{row.fmt(row.r)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
                  {controlFoot}
                </div>
              </div>
            </div>
    </>
  );
}
