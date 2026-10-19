import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { lastName } from "@/lib/personName";
import CandidateLink from "@/components/CandidateLink";

// The one county card for county maps: race-page and past-election county maps, House district
// county maps, the state page's County TPL layer and the national Counties map. Variants:
//   tooltip — the hover popup, a floating 228px box: the margin as a serif headline with the
//             vote total beside it, a share bar, then candidate rows by last name
//   card    — the tooltip's layout with no box of its own, for a container the map supplies
//             (the national map's floating selected box)
//   panel   — the click/tap panel in the page under a map, built like the state page's selected
//             House district: name and close on one line (no rating pill: these are results,
//             not ratings), candidate names in serif
//             with their % and votes, and the margin large on the right with the vote total
//             under it (full names when wide, surnames when compact). `size` "compact" where the map shares its row with something else (past
//             election pages, the state page), "wide" where the map has the full width (the
//             2026 race pages)
// Three layouts:
//   result  — candidates, margin, total votes (plus Other when anyone else got votes)
//   tpl     — the County TPL figure and the county's 2024 vote total
//   message — an optional headline and sentence (no result on file, outside the district,
//             uncontested)
// Positioning belongs to the caller: pass the useMapTooltip ref and the absolute classes. Cards
// and panels can carry a close control (`aside`) and a link below (`footer`).

type Party = "D" | "R" | "I";
/** `name` is the full name; the tooltip shortens it to the surname. `link` makes it a link to
 *  the candidate page (off for party words like "Democrat"). */
export type CountyTooltipSide = { name: string; party: Party; pct: number; votes: number | null; link?: boolean; /** A short tag after the name, e.g. "Inc." (the forecast map's cards). */ note?: string };

type Base = {
  title: string; subtitle?: string; boxRef?: Ref<HTMLDivElement>; className?: string;
  variant?: "tooltip" | "card" | "panel"; size?: "compact" | "wide" | "small"; aside?: ReactNode; footer?: ReactNode;
};
export type CountyTooltipProps = Base & (
  | { kind: "result"; dem: CountyTooltipSide; rep: CountyTooltipSide; /** R-positive. */ margin: number; totalVotes: number | null }
  | { kind: "tpl"; /** R-positive; null when the county has none. */ tpl: number | null; votes: number | null }
  | { kind: "message"; headline?: { text: string; party: Party }; message?: string }
);

const WIDTH = 228;

const partyText = (p: Party) => (p === "R" ? "var(--party-rep)" : p === "I" ? "var(--party-ind)" : "var(--party-dem)");
const partyFill = (p: Party) => (p === "R" ? "var(--party-rep-fill)" : p === "I" ? "var(--party-ind-fill)" : "var(--party-dem-fill)");
const fmtInt = (n: number) => n.toLocaleString("en-US");

function signed(margin: number, demParty: Party, repParty: Party): { text: string; color: string } {
  if (Math.abs(margin) < 0.05) return { text: "EVEN", color: "var(--app-text-primary)" };
  const party = margin > 0 ? repParty : demParty;
  return { text: `${party}+${Math.abs(margin).toFixed(1)}`, color: partyText(party) };
}

function otherShare(dem: CountyTooltipSide, rep: CountyTooltipSide, totalVotes: number | null) {
  const pct = Math.max(0, 100 - dem.pct - rep.pct);
  const votes = totalVotes != null && dem.votes != null && rep.votes != null ? Math.max(0, totalVotes - dem.votes - rep.votes) : null;
  return { pct, votes, show: pct >= 0.05 || (votes ?? 0) > 0 };
}

const label = "text-[10px] font-semibold uppercase tracking-[0.06em]";
const headlineStyle = { fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: 30, lineHeight: 1.05 } as const;

export default function CountyTooltip(props: CountyTooltipProps) {
  if (props.variant === "panel") return <CountyPanel {...props} />;
  const { title, subtitle, boxRef, className = "", variant = "tooltip", aside, footer } = props;
  // The card (the national map's floating selected box) is a step smaller than the hover tooltip.
  const isCard = variant === "card";
  const headline = isCard ? { ...headlineStyle, fontSize: 24 } : headlineStyle;

  const nameText = <div className="min-w-0 text-[10.5px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--app-text-primary)", textWrap: "balance" }}>{title}</div>;
  const name = aside ? <div className="flex items-start justify-between gap-2">{nameText}<div className="shrink-0">{aside}</div></div> : nameText;
  const sub = subtitle ? <div className="mt-px text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{subtitle}</div> : null;
  const votesFigure = (n: number) => <div className="text-[13px] font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{fmtInt(n)}</div>;
  const votesLabel = <div className={label} style={{ color: "var(--app-text-muted)" }}>Votes</div>;

  let body;
  if (props.kind === "tpl") {
    const fig = props.tpl == null ? null : signed(props.tpl, "D", "R");
    // The Votes label shares the state/FIPS line and the number sits under it, beside the TPL
    // figure, so the county name keeps its line to itself.
    body = (
      <>
        <div className="grid items-baseline gap-x-3" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
          <div style={{ gridColumn: "1 / -1" }}>{name}</div>
          {sub ?? <div />}
          <div className="text-right">{props.votes != null && votesLabel}</div>
          {fig
            ? <div className="mt-1 tabular-nums" style={{ ...headlineStyle, color: fig.color }}>{fig.text}</div>
            : <div className="mt-1 text-[12px]" style={{ color: "var(--app-text-very-muted)" }}>TPL unavailable</div>}
          <div className="self-start text-right" style={{ lineHeight: 1.15 }}>{props.votes != null && votesFigure(props.votes)}</div>
        </div>
        <div className={`mt-0.5 ${label}`} style={{ color: "var(--app-text-muted)" }}>County TPL · partisan lean</div>
      </>
    );
  } else if (props.kind === "message") {
    body = (
      <>
        {name}
        {sub}
        {props.headline && (
          <div className="mt-1" style={{ ...headlineStyle, fontSize: 22, color: partyText(props.headline.party) }}>{props.headline.text}</div>
        )}
        {props.message && <div className="mt-1.5 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{props.message}</div>}
      </>
    );
  } else {
    const { dem, rep, margin, totalVotes } = props;
    const fig = signed(margin, dem.party, rep.party);
    const other = otherShare(dem, rep, totalVotes);
    // Projections (the forecast map) carry no vote counts, so the votes column drops out.
    const showVotes = dem.votes != null || rep.votes != null || totalVotes != null;
    const row = (who: string, pct: number, votes: number | null, color: string, muted = false, note?: string) => (
      <div className={`grid items-baseline ${isCard ? "gap-x-2" : "gap-x-2.5"}`} style={{ gridTemplateColumns: showVotes ? "minmax(0,1fr) auto auto" : "minmax(0,1fr) auto" }}>
        <span className="truncate" style={{ color, fontWeight: muted ? 500 : 600 }}>{who}{note && <span className="ml-1 text-[10px] font-medium" style={{ color: "var(--app-text-very-muted)" }}>{note}</span>}</span>
        <span className="text-right" style={{ color, fontWeight: muted ? 500 : 700 }}>{pct.toFixed(1)}%</span>
        {showVotes && <span className={`min-w-[4.6em] text-right ${isCard ? "text-[10px]" : "text-[11px]"}`} style={{ color: "var(--app-text-very-muted)" }}>{votes != null ? fmtInt(votes) : "—"}</span>}
      </div>
    );
    body = (
      <>
        {name}
        {sub}
        <div className="flex items-end justify-between gap-3">
          <div className="mt-1 tabular-nums" style={{ ...headline, color: fig.color }}>{fig.text}</div>
          {totalVotes != null && <div className="pb-[3px] text-right">{votesLabel}{votesFigure(totalVotes)}</div>}
        </div>
        <div className={`${isCard ? "mt-1.5 h-1" : "mt-2 h-1.5"} flex overflow-hidden rounded-full`} style={{ background: "var(--app-tab-bg)" }}>
          <i style={{ width: `${dem.pct}%`, background: partyFill(dem.party) }} />
          <i style={{ width: `${other.pct}%`, background: "var(--app-text-very-muted)", opacity: 0.45 }} />
          <i style={{ width: `${rep.pct}%`, background: partyFill(rep.party) }} />
        </div>
        <div className={`grid tabular-nums ${isCard ? "mt-1.5 gap-px text-[11px]" : "mt-2 gap-[3px] text-[12px]"}`}>
          {row(lastName(dem.name), dem.pct, dem.votes, partyText(dem.party), false, dem.note)}
          {row(lastName(rep.name), rep.pct, rep.votes, partyText(rep.party), false, rep.note)}
          {other.show && row("Other", other.pct, other.votes, "var(--app-text-very-muted)", true)}
        </div>
      </>
    );
  }

  if (variant === "card") {
    return (
      <div ref={boxRef} className={className} data-county-card="card" style={{ color: "var(--app-text-primary)" }}>
        {body}
        {footer && <div className="mt-1.5">{footer}</div>}
      </div>
    );
  }
  return (
    <div
      ref={boxRef}
      className={`pointer-events-none rounded-lg ${className}`}
      style={{ width: WIDTH, padding: "10px 12px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", color: "var(--app-text-primary)" }}
    >
      {body}
    </div>
  );
}

function CountyPanel(props: CountyTooltipProps) {
  const { title, subtitle, boxRef, className = "", size = "compact", aside, footer } = props;
  const wide = size === "wide";
  // "small": compact with smaller type and no state/FIPS line, for past election pages, where
  // the panel has to fit in the space beside the left column without lengthening the page.
  const small = size === "small";
  const nameSize = wide ? "1.1rem" : small ? "0.9rem" : "1rem";
  // Close to the county name (1rem) so the margin reads as part of the header, not a headline.
  const figSize = small ? "1.1rem" : "1.25rem";


  let left: ReactNode = null;
  let right: ReactNode = null;
  if (props.kind === "result") {
    const { dem, rep, margin, totalVotes } = props;
    const fig = signed(margin, dem.party, rep.party);
    const other = otherShare(dem, rep, totalVotes);
    // Projections (the forecast map) carry no vote counts, so the votes column drops out.
    const showVotes = dem.votes != null || rep.votes != null || totalVotes != null;
    const side = (s: CountyTooltipSide) => {
      const style = { fontFamily: "var(--font-serif)", fontSize: nameSize, fontWeight: 700, color: partyText(s.party) };
      // Compact panels sit beside other content, so they use the surname, like the tooltip.
      const shown = wide ? s.name : lastName(s.name);
      return (
        <>
          <span className="flex min-w-0 items-baseline gap-2">
            {s.link
              ? <CandidateLink name={s.name} className="truncate hover:underline" style={style}>{shown}</CandidateLink>
              : <span className="truncate" style={style}>{shown}</span>}
            <span className="shrink-0 text-xs font-semibold" style={{ color: "var(--app-text-very-muted)" }}>({s.party}){s.note ? ` · ${s.note}` : ""}</span>
          </span>
          <span className={`text-right font-bold tabular-nums ${small ? "text-xs" : "text-sm"}`} style={{ color: partyText(s.party) }}>{s.pct.toFixed(1)}%</span>
          {showVotes && <span className="text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{s.votes != null ? fmtInt(s.votes) : "—"}</span>}
        </>
      );
    };
    left = (
      <div
        className={`grid w-full items-baseline gap-x-3 ${wide ? "mt-1 gap-y-0.5" : small ? "gap-y-0 leading-tight" : "mt-1 gap-y-0.5 leading-tight"}`}
        style={{ gridTemplateColumns: showVotes ? "minmax(0,1fr) auto minmax(3.5rem,auto)" : "minmax(0,1fr) auto" }}
      >
        {side(dem)}
        {side(rep)}
        {other.show && (
          <>
            <span className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>Other</span>
            <span className="text-right text-sm tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{other.pct.toFixed(1)}%</span>
            <span className="text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{other.votes != null ? fmtInt(other.votes) : "—"}</span>
          </>
        )}
        {/* The link and the total close the table rather than sitting in the header, so the header
            is one line and the candidate rows follow the county name with no gap. */}
        {(footer || totalVotes != null) && (
          <div className={`flex items-baseline justify-between gap-3 ${small ? "mt-0.5" : "mt-1"}`} style={{ gridColumn: "1 / -1" }}>
            <span>{footer}</span>
            {totalVotes != null && <span className="text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtInt(totalVotes)} votes</span>}
          </div>
        )}
      </div>
    );
    right = <div className="font-extrabold tabular-nums" style={{ fontSize: figSize, lineHeight: 1, color: fig.color }}>{fig.text}</div>;
  } else if (props.kind === "tpl") {
    const fig = props.tpl == null ? null : signed(props.tpl, "D", "R");
    right = (
      <>
        {fig
          ? (
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>TPL</span>
              <span className="font-extrabold tabular-nums" style={{ fontSize: figSize, lineHeight: 1, color: fig.color }}>{fig.text}</span>
            </div>
          )
          : <div className="text-sm" style={{ color: "var(--app-text-very-muted)" }}>TPL unavailable</div>}
        {props.votes != null && <div className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--app-text-muted)" }}>{fmtInt(props.votes)} votes in 2024</div>}
      </>
    );
  } else {
    left = (
      <>
        {props.headline && <div className="text-sm font-bold" style={{ color: partyText(props.headline.party) }}>{props.headline.text}</div>}
        {props.message && <div className="text-sm" style={{ color: "var(--app-text-muted)" }}>{props.message}</div>}
      </>
    );
  }

  // Results: the rows run the full width under the header, so % and votes line up on the right
  // edge beneath the margin.
  const rowsBelow = props.kind === "result";

  return (
    <div ref={boxRef} className={className} data-county-card="panel" style={{ color: "var(--app-text-primary)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`flex flex-wrap items-center gap-2 ${small ? "mb-0.5" : "mb-1.5"}`}>
            <span className={`font-bold ${small ? "text-sm" : "text-base"}`} style={{ color: "var(--app-text-primary)" }}>{title}</span>
            {aside}
          </div>
          {subtitle && !small && <div className={`-mt-1 text-xs ${rowsBelow ? "mb-1" : "mb-1.5"}`} style={{ color: "var(--app-text-very-muted)" }}>{subtitle}</div>}
          {!rowsBelow && left}
          {!rowsBelow && footer && <div className="mt-3">{footer}</div>}
        </div>
        {right && <div className="shrink-0 text-right">{right}</div>}
      </div>
      {rowsBelow && left}
    </div>
  );
}

/** The close control, for `aside`: a 28px target with a large ×, pulled into the header line
 *  by negative margins so it doesn't make the line taller. */
export function CountyCardClose({ onClick, label = "Close county details", small = false }: { onClick: () => void; label?: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`-my-1 flex items-center justify-center rounded leading-none hover:bg-[var(--app-tab-bg)] ${small ? "-mr-1 h-6 w-6 text-[18px]" : "h-7 w-7 text-[22px]"}`}
      style={{ color: "var(--app-text-muted)" }}
    >
      ×
    </button>
  );
}

/** The link out, for `footer`. */
export function CountyCardLink({ href, children = "Go to county page →" }: { href: string; children?: ReactNode }) {
  return <Link prefetch={false} href={href} className="inline-block text-xs font-bold hover:underline" style={{ color: "var(--app-text-primary)" }}>{children}</Link>;
}
