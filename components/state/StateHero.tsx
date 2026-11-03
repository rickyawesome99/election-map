import Link from "next/link";
import type { HeroBody } from "@/lib/statePage";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import StateSwitcher from "@/components/StateSwitcher";

const PARTY_COLOR = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)" } as const;
const PARTY_NAME = { D: "Democrat", R: "Republican", I: "Independent" } as const;
const LABEL = "text-[11px] font-bold uppercase tracking-wider";

function partyOf(b: HeroBody): "D" | "R" | "I" | null {
  return b.dem ? "D" : b.rep ? "R" : b.oth ? "I" : null;
}

/** Who holds a strict majority of the body, if anyone. */
function majorityOf(b: HeroBody): "D" | "R" | "I" | null {
  const total = b.total ?? b.dem + b.rep + b.oth;
  return b.dem * 2 > total ? "D" : b.rep * 2 > total ? "R" : b.oth * 2 > total ? "I" : null;
}

/** "D 43 · R 9" as colored counts, zeros left out. */
function Counts({ body, sep }: { body: HeroBody; sep?: boolean }) {
  const parts = [
    body.dem > 0 && <span key="d" style={{ color: PARTY_COLOR.D }}>{body.dem}D</span>,
    body.oth > 0 && <span key="i" style={{ color: PARTY_COLOR.I }}>{body.oth}I</span>,
    body.rep > 0 && <span key="r" style={{ color: PARTY_COLOR.R }}>{body.rep}R</span>,
  ].filter(Boolean);
  if (parts.length === 0) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  return <>{parts.map((p, i) => <span key={i}>{i > 0 && (sep ? <span style={{ color: "var(--app-text-very-muted)" }}>&thinsp;·&thinsp;</span> : " ")}{p}</span>)}</>;
}

/**
 * One square per seat, Democrats first, independents and vacancies (hollow) in the middle,
 * Republicans last. Delegations over 18 seats use small squares so California stays at two lines.
 */
function SeatSquares({ body }: { body: HeroBody }) {
  const total = body.total ?? body.dem + body.rep + body.oth;
  const vacant = Math.max(0, total - body.dem - body.rep - body.oth);
  const small = total > 18;
  const sq = small ? "h-[6px] w-[6px] rounded-[1px]" : "h-[10px] w-[10px] rounded-[2px]";
  const seats: ("D" | "I" | "V" | "R")[] = [
    ...Array<"D">(body.dem).fill("D"),
    ...Array<"I">(body.oth).fill("I"),
    ...Array<"V">(vacant).fill("V"),
    ...Array<"R">(body.rep).fill("R"),
  ];
  return (
    <span className={`flex flex-wrap ${small ? "gap-[2px]" : "gap-[3px]"}`} aria-hidden>
      {seats.map((p, i) => (
        <i
          key={i}
          className={sq}
          style={p === "V" ? { boxShadow: "inset 0 0 0 1.5px var(--app-text-very-muted)" } : { background: PARTY_COLOR[p] }}
        />
      ))}
    </span>
  );
}

/**
 * A chamber as a seat bar: Democrats fill from the left, Republicans from the right, anyone else
 * is the gap between. The notch is the midpoint, so whichever side crosses it holds a majority.
 */
function SeatBar({ body }: { body: HeroBody }) {
  const total = body.total ?? body.dem + body.rep + body.oth;
  const pct = (n: number) => (total > 0 ? `${Math.max(0, Math.min(100, (n / total) * 100)).toFixed(2)}%` : "0%");
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-[2px]" style={{ background: "var(--party-ind-subtle)" }}>
      <div className="absolute inset-y-0 left-0" style={{ width: pct(body.dem), background: PARTY_COLOR.D }} />
      <div className="absolute inset-y-0 right-0" style={{ width: pct(body.rep), background: PARTY_COLOR.R }} />
      {body.notch && <div className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2" style={{ background: "var(--app-text-primary)", opacity: 0.8 }} />}
    </div>
  );
}

/** Trifecta when the governor's party holds a majority of every chamber, otherwise divided. */
function controlChip(gov: HeroBody | undefined, chambers: HeroBody[]): { text: string; party: "D" | "R" | "I" | null } | null {
  const g = gov ? partyOf(gov) : null;
  if (!g || chambers.length === 0) return null;
  return chambers.every((c) => majorityOf(c) === g) ? { text: `${g} trifecta`, party: g } : { text: "Divided", party: null };
}

const VALUE = "mt-1.5 truncate text-[1.35rem] sm:text-[1.6rem] font-bold tabular-nums leading-none";

/**
 * One body as a stat: label (and seat total) on top, the holder in the site's serif figure style,
 * then the seats drawn small underneath — squares for a delegation, the bar for a chamber.
 */
function BodyCell({ body, className }: { body: HeroBody; className?: string }) {
  const total = body.total ?? body.dem + body.rep + body.oth;
  const gov = body.word ? partyOf(body) : null;
  const chamber = !body.word && !body.key.startsWith("us-");
  if (body.word) {
    // The governor: a stat cell at desktop; on a phone one line, label left and name right.
    return (
      <div className={`flex min-w-0 items-baseline gap-3 sm:block ${className ?? ""}`}>
        <div className={`${LABEL} shrink-0`} style={{ color: "var(--app-text-very-muted)" }}>{body.label}</div>
        <div className={`mt-0 truncate text-[1.2rem] font-bold leading-none sm:whitespace-normal sm:leading-[1.1] sm:[text-wrap:balance] sm:mt-1.5 ${(body.holder?.length ?? 0) > 17 ? "sm:text-[1.1rem]" : (body.holder?.length ?? 0) > 11 ? "sm:text-[1.3rem]" : "sm:text-[1.6rem]"}`} style={{ fontFamily: "var(--font-serif)", color: gov ? PARTY_COLOR[gov] : undefined }} title={body.holder}>
          {body.holder ?? "—"}
        </div>
        <div className="mt-2 hidden text-xs font-semibold leading-none sm:block" style={{ color: "var(--app-text-muted)" }}>
          {gov ? PARTY_NAME[gov] : "Vacant"}
        </div>
      </div>
    );
  }
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <div className={`flex items-baseline justify-between gap-2 ${LABEL}`} style={{ color: "var(--app-text-very-muted)" }}>
        <span className="truncate">{body.label}</span>
        {chamber && (
          <span className="tabular-nums whitespace-nowrap">
            {body.oth > 0 && <span style={{ color: PARTY_COLOR.I }}>{body.oth}I · </span>}
            {total}
          </span>
        )}
      </div>
      <div className={VALUE} style={{ fontFamily: "var(--font-serif)" }}>
        <Counts body={chamber ? { ...body, oth: 0 } : body} sep={chamber} />
      </div>
      <div className="mt-2">
        {chamber ? (
          <SeatBar body={body} />
        ) : (
          <SeatSquares body={body} />
        )}
      </div>
    </div>
  );
}

function BodyGroup({ title, chip, children, className }: { title: string; chip?: ReturnType<typeof controlChip>; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className ?? ""}`} style={{ borderColor: "var(--app-border)" }}>
      <div className="mb-3 flex items-center gap-2.5 pb-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <span className="text-[13px] font-bold" style={{ color: "var(--app-text-primary)" }}>{title}</span>
        {chip && (
          <span
            className="rounded-[3px] px-[7px] py-px text-[11px] font-bold"
            style={chip.party
              ? { color: PARTY_COLOR[chip.party], background: `color-mix(in srgb, ${PARTY_COLOR[chip.party]} 14%, transparent)` }
              : { color: "var(--app-text-primary)", background: "var(--party-ind-subtle)" }}
          >
            {chip.text}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** The state page's hero: name, TPL, the one ballot sentence and today's control by level. */
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
  const federal = bodies.filter((b) => b.key.startsWith("us-"));
  const governor = bodies.find((b) => b.key === "governor");
  const chambers = bodies.filter((b) => !b.key.startsWith("us-") && b.key !== "governor");
  const state = [governor, ...chambers].filter((b): b is HeroBody => b != null);
  const chip = controlChip(governor, chambers);
  return (
    <div
      style={{
        background: tpl != null
          ? `linear-gradient(to bottom, transparent 45%, var(--app-bg) 100%), linear-gradient(135deg, color-mix(in srgb, ${isD ? "var(--party-dem)" : "var(--party-rep)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`
          : "var(--app-bg)",
      }}
    >
      <div className={`${PAGE_CONTAINER} pt-6 pb-4 sm:pb-6`}>
        <div className="flex flex-row items-start justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <div className="mb-3">
              <StateSwitcher id={abbr.toLowerCase()} />
            </div>
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
              <Link href={`/model/${abbr.toLowerCase()}`} className="group mt-1.5 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
                How it&apos;s computed <span className="inline-block transition-transform duration-200 group-hover:translate-x-[2px] motion-reduce:transition-none">→</span>
              </Link>
            </div>
          )}
        </div>

        {/* On a phone the TPL leaves the masthead and sits on its own line above the bodies. */}
        {tpl != null && (
          <div className="mt-4 flex items-baseline justify-between gap-3 pt-3 sm:hidden" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="flex items-baseline gap-2.5">
              <span className={LABEL} style={{ color: "var(--app-text-very-muted)" }}>State TPL</span>
              <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, color: isD ? "var(--party-dem)" : "var(--party-rep)" }}>
                {isD ? "D" : "R"}+{Math.abs(tpl).toFixed(1)}
              </span>
            </div>
            <Link href={`/model/${abbr.toLowerCase()}`} className="group text-xs font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}>
              How it&apos;s computed <span className="inline-block transition-transform duration-200 group-hover:translate-x-[2px] motion-reduce:transition-none">→</span>
            </Link>
          </div>
        )}

        {/* Today's control, Federal beside State. Current composition only — the 2026 projections
            live in the ballot section, where they sit next to the races that produce them. */}
        <div className="mt-5 grid gap-y-5 sm:mt-4 sm:grid-cols-[5fr_8fr] sm:gap-x-10">
          <BodyGroup title="Federal">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {federal.map((b) => <BodyCell key={b.key} body={b} />)}
            </div>
          </BodyGroup>
          <BodyGroup title="State" chip={chip}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-[1.4fr_1fr_1fr]">
              {state.map((b) => <BodyCell key={b.key} body={b} className={b.key === "governor" ? "col-span-2 sm:col-span-1" : undefined} />)}
            </div>
          </BodyGroup>
        </div>
      </div>
    </div>
  );
}
