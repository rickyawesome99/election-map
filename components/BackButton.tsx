"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

function getBackInfo(from: string | null): { href: string; label: string } {
  if (!from) return { href: "/", label: "Back to Map" };
  if (from === "/senate") return { href: "/senate", label: "Back to Senate" };
  if (from === "/house") return { href: "/house", label: "Back to House" };
  if (from === "/governor") return { href: "/governor", label: "Back to Governor" };
  if (from.startsWith("/states/")) {
    const abbr = from.split("/")[2]?.toUpperCase() ?? "";
    return { href: from, label: `Back to ${abbr}` };
  }
  return { href: "/", label: "Back to Map" };
}

export default function BackButton() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const { href, label } = getBackInfo(from);

  return (
    <Link
      href={href}
      className="flex items-center gap-2 text-sm transition-colors shrink-0"
      style={{ color: "var(--app-text-muted)" }}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {label}
    </Link>
  );
}
