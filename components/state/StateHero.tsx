import Link from "next/link";
import type { HeroBody } from "@/lib/statePage";
import { PAGE_CONTAINER } from "@/lib/pageLayout";

/**
 * One body as a short seat bar: Democrats fill from the left, Republicans from the right, anyone
 * else is the gap between. The notch is the midpoint, so whichever side crosses it holds a
 * majority — true for odd and even chamber sizes alike.
 */
function SeatBar({ body }: { body: HeroBody }) {
  const total = body.total ?? body.dem + body.rep + body.oth;
  const pct = (n: number) => (total > 0 ? `${Math.max(0, Math.min(100, (n / total) * 100)).toFixed(2)}%` : "0%");
  return (
    // On a phone the band is a two-column grid headed by the TPL, with the governor beside it and
    // the four chambers paired below; at desktop the row keeps its level-of-government order.
    <div className={`min-w-0 sm:flex-1 sm:min-w-[8rem] sm:max-w-[10.5rem]${body.key === "governor" ? " order-first sm:order-none" : ""}`}>
      <div className="flex items-baseline justify-between text-[10px] sm:text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
        <span className="truncate">{body.label}</span>
        {body.total != null && body.total > 2 && <span className="tabular-nums">{body.total}</span>}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[1.35rem] sm:text-[1.65rem] font-extrabold tabular-nums leading-none">
        {body.word ? (
          <>
            <span style={{ color: body.dem ? "var(--party-dem)" : body.rep ? "var(--party-rep)" : body.oth ? "var(--party-ind)" : "var(--app-text-very-muted)" }}>{body.word}</span>
            {body.holder && <span className="truncate text-xs sm:text-sm font-medium" style={{ color: "var(--app-text-muted)" }}>{body.holder}</span>}
          </>
        ) : (
          <>
            <span style={{ color: "var(--party-dem)" }}>{body.dem}D</span>
            {body.oth > 0 && <span style={{ color: "var(--party-ind)" }}>{body.oth}I</span>}
            <span style={{ color: "var(--party-rep)" }}>{body.rep}R</span>
          </>
        )}
      </div>
      <div className="relative mt-1.5 h-[7px] sm:mt-2 sm:h-2 overflow-hidden rounded-[2px]" style={{ background: "var(--party-ind-subtle)" }}>
        <div className="absolute inset-y-0 left-0" style={{ width: pct(body.dem), background: "var(--party-dem)" }} />
        <div className="absolute inset-y-0 right-0" style={{ width: pct(body.rep), background: "var(--party-rep)" }} />
        {body.notch && <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ background: "var(--app-text-primary)", opacity: 0.75 }} />}
      </div>
    </div>
  );
}

/** The state page's hero: name, TPL, the one ballot sentence and today's control as seat bars. */
export default function StateHero({
  name,
  abbr,
  tpl,
  ballotSentence,
  bodies,
}: {
  name: string;
  abbr: string;
  tpl: number | null;
  ballotSentence: string;
  bodies: HeroBody[];
}) {
  const isD = tpl != null && tpl <= 0;
  return (
    <div
      style={{
        background: tpl != null
          ? `linear-gradient(135deg, color-mix(in srgb, ${isD ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`
          : "var(--app-bg)",
      }}
    >
      <div className={`${PAGE_CONTAINER} pt-6 pb-6 sm:pb-8`}>
        <div className="flex flex-row items-start justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1
                className="sm:whitespace-nowrap"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 6.5vw, 4.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
              >
                {name}
              </h1>
            </div>
            <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>{ballotSentence}</div>
          </div>

          {tpl != null && (
            <div className="hidden shrink-0 text-right sm:block">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>State TPL</div>
              <div
                className="tabular-nums"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.25rem, 5.5vw, 3.75rem)", fontWeight: 700, lineHeight: 1, marginTop: "0.35rem", color: isD ? "var(--party-dem)" : "var(--party-rep)" }}
              >
                {isD ? "D" : "R"}+{Math.abs(tpl).toFixed(1)}
              </div>
              <Link href={`/model/${abbr.toLowerCase()}`} className="mt-1.5 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
                How it&apos;s computed →
              </Link>
            </div>
          )}
        </div>

        {/* Today's control, one short bar per body. Current composition only — the 2026 projections
            live in the ballot section, where they sit next to the races that produce them. */}
        <div className="mt-5 sm:mt-7 grid grid-cols-2 gap-x-5 gap-y-3 pt-4 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-4 sm:pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
          {/* On a phone the TPL leaves the masthead and heads the band, beside the governor. */}
          {tpl != null && (
            <div className="order-first min-w-0 sm:hidden">
              <div className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
                <span>State TPL</span>
              </div>
              <div className="mt-1 tabular-nums leading-none" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, color: isD ? "var(--party-dem)" : "var(--party-rep)" }}>
                {isD ? "D" : "R"}+{Math.abs(tpl).toFixed(1)}
              </div>
              <Link href={`/model/${abbr.toLowerCase()}`} className="mt-1 inline-block text-[10px] font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
                How it&apos;s computed →
              </Link>
            </div>
          )}
          {bodies.map((b) => <SeatBar key={b.key} body={b} />)}
        </div>
      </div>
    </div>
  );
}
