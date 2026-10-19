"use client";

import { useRouter } from "next/navigation";
import { statesData } from "@/data/statesData";
import { UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { pendingKindFor, setPendingNav } from "@/lib/navPending";

const STATES = [...statesData].sort((a, b) => a.name.localeCompare(b.name));

/** Pill-shaped state picker. On a state page it jumps to another state's page; given a chamber
 *  (legislature pages) it jumps to that chamber in the other state (Nebraska's single chamber is
 *  its senate, so a House page lands there). */
export default function StateSwitcher({ id, chamber }: { id: string; chamber?: Chamber }) {
  const router = useRouter();
  const go = (nextId: string) => {
    const s = STATES.find((x) => x.id === nextId);
    if (!s || nextId === id) return;
    const path = chamber
      ? `/states/${s.id}/legislature/${UNICAMERAL_STATES.has(s.abbr) ? "senate" : chamber}`
      : `/states/${s.id}`;
    const kind = pendingKindFor(path);
    if (kind) setPendingNav({ kind, path });
    router.push(path);
  };
  return (
    <select
      aria-label="Switch state"
      value={id}
      onChange={(e) => go(e.target.value)}
      className="cursor-pointer rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "none" }}
    >
      {STATES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}
