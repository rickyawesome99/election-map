"use client";

import type { CSSProperties, ReactNode } from "react";
import type { PendingKind, PendingNav } from "@/lib/navPending";
import { PAGE_CONTAINER, PAGE_HERO_BG, PAGE_HERO_TOP, PAGE_TITLE_STYLE } from "@/lib/pageLayout";

// Greyed outlines of each page, shown between a click and the page's arrival (AppShell). Each
// follows its page's real layout, top to bottom, as far as the first screen or so: the top tabs
// carry their real title, the detail pages a "Loading …" line. Keep them in step when a page's
// layout changes.

const RULE: CSSProperties = { borderBottom: "1px solid var(--app-border)" };
const HEAVY_RULE: CSSProperties = { borderBottom: "2px solid var(--app-text-primary)", opacity: 0.85 };

/** One grey block. */
function Sk({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`nav-skeleton ${className}`} style={style} />;
}

function Lines({ widths, h = "h-3.5" }: { widths: string[]; h?: string }) {
  return <div className="space-y-2.5">{widths.map((w, i) => <Sk key={i} className={`${h} ${w}`} />)}</div>;
}

/** A section heading over its dark rule, as the pages draw them; `right` fills the far end. */
function SectionHead({ className = "", right }: { className?: string; right?: ReactNode }) {
  return (
    <div className={`flex items-end justify-between gap-4 pb-3 ${className}`} style={HEAVY_RULE}>
      <Sk className="h-3 w-28" />
      {right}
    </div>
  );
}

function Pills({ widths, className = "", h = "h-6" }: { widths: string[]; className?: string; h?: string }) {
  return <div className={`flex flex-wrap gap-2 ${className}`}>{widths.map((w, i) => <Sk key={i} className={`${h} rounded-full ${w}`} />)}</div>;
}

/** Big number over a small caps label, in `cols` columns split by thin dividers. */
function StatStrip({ cols, mobileCols = cols, big = "h-7" }: { cols: number; mobileCols?: number; big?: string }) {
  return (
    <div className={`grid gap-x-6 gap-y-5 ${GRID[mobileCols]} ${SM_GRID[cols]}`}>
      {Array.from({ length: cols }, (_, i) => (
        <div key={i} className="space-y-2">
          <Sk className={`${big} w-4/5 max-w-32`} />
          <Sk className="h-2.5 w-3/5 max-w-20" />
        </div>
      ))}
    </div>
  );
}
const GRID: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };
const SM_GRID: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" };

function TableRows({ rows, cols = 3 }: { rows: number; cols?: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 py-3" style={RULE}>
          <Sk className="h-3.5 w-32" />
          <div className="flex gap-6">
            {Array.from({ length: cols }, (_, j) => <Sk key={j} className={`h-3.5 w-12 ${j > 1 ? "hidden sm:block" : ""}`} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The US map most tabs open with: a wide, short block, centered. */
function UsMap({ className = "" }: { className?: string }) {
  return <Sk className={`mx-auto aspect-[1.6] w-full max-w-[680px] rounded-xl ${className}`} />;
}

function Legend({ items = 8 }: { items?: number }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {Array.from({ length: items }, (_, i) => <Sk key={i} className="h-2.5 w-12" />)}
    </div>
  );
}

/** A race card in the two-column key-race grids: state, two candidate names, margin + rating. */
function RaceCard({ names = true }: { names?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4" style={RULE}>
      <div className="space-y-2.5">
        <Sk className="h-3.5 w-20" />
        {names && <><Sk className="h-4 w-32" /><Sk className="h-4 w-28" /></>}
        {!names && <Sk className="h-2.5 w-16" />}
      </div>
      <div className="flex flex-col items-end space-y-2"><Sk className="h-5 w-14" /><Sk className={names ? "h-4 w-12 rounded-full" : "h-2.5 w-10"} /></div>
    </div>
  );
}

function CandidateRow() {
  return (
    <div className="flex items-center gap-4 py-4" style={RULE}>
      <Sk className="h-16 w-16 shrink-0 rounded-lg sm:h-20 sm:w-20" />
      <div className="flex-1 space-y-2"><Sk className="h-5 w-40" /><Sk className="h-3 w-20" /></div>
      <div className="flex flex-col items-end space-y-2"><Sk className="h-7 w-20" /><Sk className="h-3 w-24" /></div>
    </div>
  );
}

/** The tinted header band the top tabs and detail pages share. */
function Hero({ children, className = "pb-6" }: { children: ReactNode; className?: string }) {
  return (
    <div style={{ background: PAGE_HERO_BG }}>
      <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} ${className}`}>{children}</div>
    </div>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div className={PAGE_CONTAINER}>{children}</div>;
}

/** A top tab's real title, so the page reads as arrived before its data has. */
function Title({ children }: { children: ReactNode }) {
  return <h1 style={{ ...PAGE_TITLE_STYLE, color: "var(--app-text-primary)" }}>{children}</h1>;
}

function LoadingText({ children = "Loading…" }: { children?: ReactNode }) {
  return <p className="text-sm font-medium" style={{ color: "var(--app-text-muted)" }}>{children}</p>;
}

// ── Top tabs ────────────────────────────────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <>
      <Hero>
        <div className="min-w-0 space-y-3"><Title>2026 Outlook</Title><Sk className="h-4 w-72 max-w-full" /><LoadingText /></div>

        <div className="mt-7 grid grid-cols-6 gap-2 sm:gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Sk key={i} className={`h-[92px] w-full rounded-md sm:h-[108px] ${i < 2 ? "col-span-3" : "col-span-2"} lg:col-span-1`} />)}</div>
      </Hero>
      <Body>
        <SectionHead className="mt-8" right={<Sk className="h-2.5 w-24" />} />
        <UsMap className="mt-8" />
        <div className="mt-6 pt-3" style={{ borderTop: "1px solid var(--app-border)" }}><Legend /></div>
        <SectionHead className="mt-8" right={<Sk className="h-2.5 w-24" />} />
        <Sk className="mt-4 h-[230px] w-full rounded-[3px] sm:h-[245px]" />
        <SectionHead className="mt-10" />
        <div className="grid gap-x-8 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <RaceCard key={i} names={false} />)}</div>
      </Body>
    </>
  );
}

function ForecastSkeleton({ path }: { path: string }) {
  const chamber = path.slice(1);
  const title = chamber === "house" ? "U.S. House" : chamber === "governor" ? "Governors" : "U.S. Senate";
  return (
    <>
      <Hero className="pb-0">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2"><Title>{title}</Title><Sk className="mb-1 h-7 w-20" /><Sk className="mb-1.5 h-3.5 w-16" /></div>
        <div className="mt-4 flex gap-5" style={RULE}>
          {["house", "senate", "governor"].map((c) => (
            <span key={c} className="pb-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: c === chamber ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: c === chamber ? "2px solid var(--app-text-primary)" : "2px solid transparent" }}>
              {c}
            </span>
          ))}
        </div>
      </Hero>
      <Body>
        <div className="mt-3"><LoadingText /></div>
        <UsMap className="mt-6" />
        <div className="mt-6"><Legend items={9} /></div>
        <SectionHead className="mt-10" />
        <div className="grid gap-x-8 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <RaceCard key={i} />)}</div>
      </Body>
    </>
  );
}

function LegislaturesSkeleton() {
  return (
    <>
      <Hero>
        <Title>State Legislatures</Title>
        <div className="mt-4"><Lines widths={["w-full max-w-3xl", "w-11/12 max-w-3xl", "w-1/3"]} /></div>
        <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
          <div className="flex items-end justify-between"><div className="space-y-2"><Sk className="h-2.5 w-44" /><Sk className="h-7 w-20" /><Sk className="h-2.5 w-16" /></div><div className="flex flex-col items-end space-y-2"><Sk className="h-7 w-20" /><Sk className="h-2.5 w-16" /></div></div>
          <Sk className="mt-3 h-3.5 w-full rounded-full" />
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-3"><Sk className="h-2.5 w-40" /><div className="flex items-center gap-3"><Sk className="h-2.5 w-14" /><Sk className="h-3 flex-1" /><Sk className="h-3 w-8" /></div><div className="flex items-center gap-3"><Sk className="h-2.5 w-14" /><Sk className="h-3 w-1/4" /><Sk className="h-3 w-8" /></div></div>
            ))}
          </div>
        </div>
      </Hero>
      <Body>
        <LoadingText />
        <SectionHead className="mt-6" right={<div className="flex gap-2"><Sk className="h-6 w-36 rounded-md" /><Sk className="h-6 w-28 rounded-md" /></div>} />
        <UsMap className="mt-8" />
        <div className="mt-6"><Legend items={6} /></div>
        <SectionHead className="mt-10" right={<Sk className="h-6 w-56 rounded-md" />} />
        <TableRows rows={4} cols={5} />
      </Body>
    </>
  );
}

function HistoricalSkeleton() {
  return (
    <>
      <Hero className="pb-0">
        <Title>Historical Results</Title>
        <div className="mt-4 flex flex-wrap gap-2"><Sk className="h-7 w-24 rounded-md" /><Sk className="h-7 w-28 rounded-md" /><Sk className="h-7 w-44 rounded-md sm:ml-auto" /></div>
      </Hero>
      <Body>
        <div className="mt-4 py-4" style={{ borderTop: "2px solid var(--app-text-primary)", borderBottom: "1px solid var(--app-border)" }}>
          <StatStrip cols={4} mobileCols={2} />
        </div>
        <div className="mt-3"><LoadingText /></div>
        <UsMap className="mt-6" />
        <div className="mt-6 flex justify-center"><Legend /></div>
        <div className="mt-10 flex items-end justify-between pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}><Sk className="h-3 w-40" /><Sk className="hidden h-7 w-64 rounded-md sm:block" /></div>
        <TableRows rows={8} cols={3} />
      </Body>
    </>
  );
}

function ModelSkeleton() {
  return (
    <>
      <Hero>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-4"><Title>True Partisan Lean</Title><Lines widths={["w-full max-w-xl", "w-3/4 max-w-md"]} /></div>
          <div className="flex items-end justify-between gap-6 sm:justify-end sm:gap-8">
            <div className="flex flex-col space-y-2 sm:items-end"><Sk className="h-3 w-28" /><Sk className="h-12 w-36" /><Sk className="h-3 w-36" /></div>
            <div className="flex flex-col items-end space-y-2"><Sk className="h-10 w-36 rounded-full" /><Sk className="h-3 w-24" /></div>
          </div>
        </div>
      </Hero>
      <Body>
        <LoadingText />
        <SectionHead className="mt-6" right={<Sk className="h-2.5 w-40" />} />
        <div className="mt-4 flex items-center justify-between"><Pills widths={["w-10", "w-12", "w-12", "w-12", "w-12", "w-12"]} /><Sk className="hidden h-7 w-28 rounded-full sm:block" /></div>
        <Sk className="mt-4 aspect-[1.75] w-full rounded-xl" />
        <div className="mt-10"><Pills widths={["w-16", "w-14", "w-14", "w-20"]} /></div>
        <div className="mt-4"><TableRows rows={6} cols={4} /></div>
      </Body>
    </>
  );
}

function AnalysisSkeleton() {
  return (
    <>
      <Hero className="pb-3"><Title>Analysis</Title></Hero>
      <Body>
        {[3, 2].map((rows, s) => (
          <div key={s} className={s ? "mt-10" : "mt-2"}>
            <SectionHead />
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 py-6 md:grid-cols-[minmax(0,1fr)_minmax(14rem,19rem)] md:gap-8 md:items-center" style={RULE}>
                <div className="space-y-2.5"><Sk className="h-5 w-20 rounded-full" /><Sk className="h-6 w-56" /><Lines widths={["w-full", "w-2/3"]} h="h-3" /></div>
                <Sk className="h-20 w-full" />
              </div>
            ))}
          </div>
        ))}
      </Body>
    </>
  );
}

function FinderSkeleton() {
  return (
    <div className="px-4 pt-3 sm:px-6">
      <div className="relative h-[calc(100svh-8rem)] w-full overflow-hidden rounded-xl" style={{ border: "1px solid var(--app-border)" }}>
        <Sk className="absolute inset-0 rounded-none" />
        <div className="absolute left-3 top-3 flex gap-2">
          <div className="h-11 w-64 max-w-[60vw] rounded-md" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }} />
          <div className="h-11 w-20 rounded-md" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }} />
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2"><LoadingText>Loading the map…</LoadingText></div>
      </div>
    </div>
  );
}

// ── Detail pages ────────────────────────────────────────────────────────────────────────────

function RaceSkeleton({ path }: { path: string }) {
  const house = path.startsWith("/house/");
  return (
    <>
      <Hero className="pb-0">
        <LoadingText>Loading race…</LoadingText>
        <Pills className="mt-3" widths={["w-20", "w-20", "w-14", "w-28"]} />
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <Sk className="h-14 w-4/5 max-w-sm sm:h-16" />
            {!house && <Sk className="h-14 w-1/2 max-w-xs sm:h-16" />}
            <Sk className="h-3.5 w-full max-w-md" />
          </div>
          <div className="flex flex-col space-y-2 sm:items-end"><Sk className="h-3 w-28" /><Sk className="h-14 w-44" /></div>
        </div>
        <div className="mt-6 py-6" style={{ borderTop: "1px solid var(--app-border)" }}><StatStrip cols={3} /></div>
      </Hero>
      <Body>
        {house && (
          <div className="flex items-center gap-5 py-4" style={{ borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)" }}>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center gap-2"><Sk className="h-8 w-8 rounded-full" /><Sk className="h-9 w-64 max-w-[55vw] rounded-lg" /><Sk className="h-8 w-8 rounded-full" /></div>
              <Sk className="h-2.5 w-64 max-w-full" />
            </div>
            <Sk className="hidden h-24 w-44 rounded-md sm:block" />
          </div>
        )}
        <SectionHead className="mt-8" />
        <div className="mt-4"><Lines widths={["w-full", "w-full", "w-2/3"]} /></div>
        {house && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">{Array.from({ length: 6 }, (_, i) => <Sk key={i} className="h-3.5 w-20" />)}</div>}
        <div className="mt-4 flex gap-6"><Sk className="h-3 w-36" /><Sk className="h-3 w-24" /></div>
        <SectionHead className="mt-10" />
        <Sk className="mt-4 h-3 w-full rounded-full" />
        <CandidateRow />
        <CandidateRow />
      </Body>
    </>
  );
}

function PastSkeleton() {
  return (
    <Body>
      <div className="flex items-center justify-between pt-5 pb-3" style={HEAVY_RULE}><Sk className="h-4 w-56" /><Sk className="h-5 w-14" /></div>
      <div className="mt-5 grid gap-8 md:grid-cols-2">
        <div>
          <LoadingText>Loading results…</LoadingText>
          <Sk className="mt-3 h-3 w-48" />
          <div className="mt-4 space-y-2"><Sk className="h-8 w-11/12" /><Sk className="h-8 w-3/4" /></div>
          <Sk className="mt-4 h-3.5 w-4/5" />
          <Sk className="mt-6 h-3 w-full rounded-full" />
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 py-4" style={RULE}>
              <Sk className="h-12 w-12 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2"><Sk className="h-4 w-32" /><Sk className="h-3 w-24" /></div>
              <Sk className="h-6 w-16" />
            </div>
          ))}
          <div className="mt-5"><StatStrip cols={3} big="h-6" /></div>
        </div>
        <Sk className="h-64 md:h-auto md:min-h-80" />
      </div>
      <div className="mt-10 pt-5" style={{ borderTop: "2px solid var(--app-text-primary)" }}><StatStrip cols={3} big="h-6" /></div>
      <SectionHead className="mt-10" />
      <TableRows rows={8} cols={4} />
    </Body>
  );
}

function ChamberSkeleton() {
  return (
    <>
      <Hero className="pb-0">
        <LoadingText>Loading chamber…</LoadingText>
        <Pills className="mt-3" widths={["w-24"]} />
        <div className="mt-4 space-y-3"><Sk className="h-14 w-4/5 max-w-md sm:h-16" /><Sk className="h-14 w-1/2 max-w-xs sm:h-16" /></div>
        <div className="mt-6 flex gap-6 pb-3" style={RULE}><Sk className="h-4 w-20" /><Sk className="h-4 w-20" /></div>
      </Hero>
      <Body>
        {/* ChamberSummary: seats now → 2026 with two stacked bars | vote margin, then the 3-stat facts row. */}
        <div className="mt-6 grid gap-x-10 gap-y-6 pt-3 md:grid-cols-[1.45fr_1fr]" style={{ borderTop: "2px solid var(--app-text-primary)" }}>
          <div className="space-y-3"><Sk className="h-3.5 w-44" /><Sk className="h-10 w-64 max-w-full" /><Sk className="h-2 w-full rounded-full" /><Sk className="h-3.5 w-full rounded-full" /><Sk className="h-3 w-2/3" /></div>
          <div className="space-y-3"><Sk className="h-3.5 w-36" /><Sk className="h-7 w-52 max-w-full" /><Sk className="h-5 w-44 max-w-full" /><Sk className="h-3 w-40" /></div>
        </div>
        <div className="mt-7 py-5" style={{ borderTop: "1px solid var(--app-border)" }}><StatStrip cols={3} mobileCols={2} big="h-5" /></div>
        <Pills widths={["w-28", "w-20", "w-24", "w-24"]} />
        <div className="mt-6 grid gap-6 md:grid-cols-[3fr_2fr]">
          <Sk className="h-64 sm:h-80" />
          <div className="grid grid-cols-8 content-start gap-1">
            {Array.from({ length: 64 }, (_, i) => <Sk key={i} className="aspect-[3/2] rounded-sm" />)}
          </div>
        </div>
        <SectionHead className="mt-10" />
        <TableRows rows={6} cols={5} />
      </Body>
    </>
  );
}

function StateSkeleton() {
  return (
    <>
      <Hero>
        <LoadingText>Loading state…</LoadingText>
        <Pills className="mt-3" widths={["w-24"]} />
        <div className="mt-3 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3"><Sk className="h-14 w-4/5 max-w-md sm:h-16" /><Sk className="h-3.5 w-40" /></div>
          <div className="flex flex-col space-y-2 sm:items-end"><Sk className="h-3 w-20" /><Sk className="h-14 w-40" /><Sk className="h-3 w-28" /></div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-6 pt-6 sm:grid-cols-5" style={{ borderTop: "1px solid var(--app-border)" }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-2"><Sk className="h-2.5 w-16" /><Sk className="h-6 w-full" /><Sk className="h-1.5 w-full rounded-full" /></div>
          ))}
        </div>
      </Hero>
      <Body>
        <div className="mt-6 flex gap-6 pb-3" style={RULE}><Sk className="h-4 w-20" /><Sk className="h-4 w-20" /><Sk className="h-4 w-20" /></div>
        <div className="mt-4"><Pills widths={["w-28", "w-12", "w-12", "w-12", "w-12", "w-12"]} /></div>
        <Sk className="mx-auto mt-6 aspect-[1.75] w-full max-w-xl" />
        <SectionHead className="mt-10" right={<Sk className="h-2.5 w-40" />} />
        <div className="mt-5"><StatStrip cols={3} big="h-5" /></div>
      </Body>
    </>
  );
}

function CandidateSkeleton() {
  return (
    <div style={{ background: "linear-gradient(to bottom, color-mix(in srgb, var(--app-text-muted) 8%, var(--app-bg)), var(--app-bg) 40%)" }}>
      <div className="mx-auto max-w-[960px] px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between"><Sk className="h-3.5 w-28" /><LoadingText>Loading candidate…</LoadingText></div>
        <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-[260px_1fr]">
          <div className="space-y-4">
            <Sk className="h-48 w-36 rounded-lg" />
            <Sk className="h-8 w-48" />
            <Sk className="h-3.5 w-24" />
            <Pills widths={["w-20", "w-16"]} />
            <div className="space-y-2 pt-2"><Sk className="h-2.5 w-20" /><Sk className="h-5 w-16" /></div>
            <div className="flex gap-8"><div className="space-y-2"><Sk className="h-2.5 w-16" /><Sk className="h-5 w-12" /></div><div className="space-y-2"><Sk className="h-2.5 w-14" /><Sk className="h-5 w-12" /></div></div>
          </div>
          <div>
            <SectionHead />
            <div className="flex items-start justify-between py-5" style={RULE}>
              <div className="space-y-2.5"><Sk className="h-2.5 w-32" /><Sk className="h-5 w-36" /><Sk className="h-5 w-32" /></div>
              <div className="flex flex-col items-end space-y-2"><Sk className="h-6 w-16" /><Sk className="h-4 w-14 rounded-full" /></div>
            </div>
            <SectionHead className="mt-8" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2.5 py-4" style={RULE}>
                <Sk className="h-4 w-48" /><Sk className="h-2 w-full rounded-full" /><Sk className="h-3 w-56" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A past-result card in the county page's right column: year + office, two candidates, bar. */
function ResultCard() {
  return (
    <div className="space-y-3 py-5" style={RULE}>
      <div className="flex items-center justify-between"><Sk className="h-5 w-36" /><Sk className="h-4 w-12" /></div>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4"><Sk className="h-4 w-36" /><div className="flex gap-4"><Sk className="h-4 w-12" /><Sk className="h-3.5 w-14" /></div></div>
      ))}
      <div className="flex items-center justify-between"><Sk className="h-2.5 w-12" /><Sk className="h-2 w-28 rounded-full" /></div>
    </div>
  );
}

function CountySkeleton() {
  return (
    <>
      <div style={{ background: "color-mix(in srgb, var(--app-text-muted) 9%, var(--app-bg))" }}>
        <div className={`${PAGE_CONTAINER} pt-5 pb-8`}>
          <div className="flex items-center justify-between"><Sk className="h-3.5 w-28" /><LoadingText>Loading county…</LoadingText></div>
          <Pills className="mt-6" widths={["w-24", "w-16"]} />
          <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3"><Sk className="h-14 w-4/5 max-w-md sm:h-16" /><Sk className="h-3.5 w-40" /></div>
            <div className="flex flex-col space-y-2 sm:items-end"><Sk className="h-3 w-24" /><Sk className="h-14 w-48" /></div>
          </div>
          <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--app-border)" }}><StatStrip cols={3} mobileCols={2} /></div>
        </div>
      </div>
      <Body>
        <Sk className="mx-auto mt-8 aspect-[1.75] w-full max-w-md" />
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <div>
            <SectionHead />
            <div className="mt-4"><Lines widths={["w-4/5", "w-full", "w-2/3"]} /></div>
            <SectionHead className="mt-8" />
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">{Array.from({ length: 6 }, (_, i) => <Sk key={i} className="h-4 w-24" />)}</div>
            <SectionHead className="mt-8" />
            <div className="mt-4 space-y-3"><Sk className="h-4 w-24" /><Sk className="h-3 w-full" /><Sk className="h-3 w-full rounded-full" /><Sk className="h-3 w-3/4" /></div>
          </div>
          <div>
            <SectionHead />
            <ResultCard />
            <ResultCard />
            <ResultCard />
          </div>
        </div>
      </Body>
    </>
  );
}

function ResultsSkeleton() {
  return (
    <Body>
      <Sk className="mt-3 h-4 w-24 rounded-full" />
      <Sk className="mt-3 h-10 w-72" />
      <Sk className="mt-4 h-4 w-80" />
      <div className="mt-6 grid gap-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:gap-8">
        <div><SectionHead /><Sk className="mx-auto mt-4 h-[300px] w-full sm:h-[440px]" /></div>
        <div><SectionHead /><div className="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-1">{Array.from({ length: 3 }, (_, i) => <Sk key={i} className="h-44 w-full" />)}</div></div>
      </div>
      <SectionHead className="mt-10" />
      <div className="mt-4 space-y-3">{Array.from({ length: 8 }, (_, i) => <Sk key={i} className="h-8 w-full" />)}</div>
    </Body>
  );
}

const SKELETONS: Record<PendingKind, (p: { path: string }) => ReactNode> = {
  results: ResultsSkeleton,
  overview: OverviewSkeleton,
  forecast: ForecastSkeleton,
  legislatures: LegislaturesSkeleton,
  historical: HistoricalSkeleton,
  model: ModelSkeleton,
  analysis: AnalysisSkeleton,
  finder: FinderSkeleton,
  race: RaceSkeleton,
  past: PastSkeleton,
  chamber: ChamberSkeleton,
  state: StateSkeleton,
  candidate: CandidateSkeleton,
  county: CountySkeleton,
};

/** Placeholder page shown between a click and the new page's arrival. It covers the whole
 *  viewport, behind the sticky header (z-50), so no strip of the old page shows through when
 *  the tab bar below lg is collapsed or mid-slide; its padding starts the skeleton where page
 *  content starts (under the header, and under the tab bar's reserved space below lg). */
export default function PendingPage({ nav }: { nav: PendingNav }) {
  const Skeleton = SKELETONS[nav.kind];
  return (
    <div
      role="status"
      aria-label="Loading"
      className="nav-pending-cover fixed inset-0 z-40 overflow-hidden pt-[calc(var(--app-chrome-h,56px)+45px)] lg:pt-[var(--app-chrome-h,56px)]"
      style={{ background: "var(--app-bg)" }}
    >
      <Skeleton path={nav.path} />
    </div>
  );
}
