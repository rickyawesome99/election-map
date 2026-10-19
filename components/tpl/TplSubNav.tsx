"use client";

import Link from "next/link";
import { ArrowOut } from "./ui";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The TPL tab's own row under the site nav: Map · Candidates, with a slot on the right for the
// page's picker and a link to the model's methodology. State pages sit under Map, whose table
// is their index.

const ITEMS = [
  { key: "map", label: "Map", href: "/model", active: (p: string) => p.startsWith("/model") && !p.startsWith("/model/candidates") },
  { key: "candidates", label: "Candidates", href: "/model/candidates", active: (p: string) => p.startsWith("/model/candidates") },
];

export function TplSubNav({ right, methodologyHref = "/methodology/state-tpl", methodologyLabel = "How TPL works" }: { right?: ReactNode; methodologyHref?: string; methodologyLabel?: string }) {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 overflow-x-auto" style={{ borderBottom: "1px solid var(--app-border)" }}>
      {ITEMS.map((it) => {
        const on = it.active(pathname);
        return (
          <Link key={it.key} href={it.href} aria-current={on ? "page" : undefined} className="shrink-0 px-2.5 py-2.5 text-[13px] font-semibold sm:px-3"
            style={{ color: on ? "var(--app-text-primary)" : "var(--app-text-muted)", borderBottom: on ? "2px solid var(--app-text-primary)" : "2px solid transparent", marginBottom: -1 }}>
            {it.label}
          </Link>
        );
      })}
      <div className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-xs" style={{ color: "var(--app-text-muted)" }}>
        {right}
        <Link href={methodologyHref} className="hidden whitespace-nowrap hover:underline sm:inline">{methodologyLabel} <ArrowOut /></Link>
      </div>
    </div>
  );
}

// The Map and Candidates headers' closing row, in place of the sub-nav: a button over to the
// other view, and the matching methodology link on the right.
export function TplViewSwitch({ to }: { to: "map" | "candidates" }) {
  const toMap = to === "map";
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4" style={{ borderTop: "1px solid var(--app-border)" }}>
      <Link href={toMap ? "/model" : "/model/candidates"} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--app-tab-bg)]"
        style={{ border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}>
        {toMap ? "← Map view" : "Candidates view →"}
      </Link>
      <Link href={toMap ? "/methodology/war" : "/methodology/state-tpl"} className="whitespace-nowrap text-xs hover:underline" style={{ color: "var(--app-text-muted)" }}>
        {toMap ? "How WAR works" : "How TPL works"} <ArrowOut />
      </Link>
    </div>
  );
}
