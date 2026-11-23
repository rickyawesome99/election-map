import Link from "next/link";
import { ArrowOut } from "./ui";

// The methodology link that closes the TPL and WAR page headers. "row" (sm and up) is the
// header's last row above a rule; "inline" (phones) sits to the right of the headline stat.
const TARGETS = {
  tpl: { href: "/analysis/internal-methodology/state-tpl", label: "How TPL works" },
  war: { href: "/analysis/internal-methodology/war", label: "How WAR works" },
};

export function HeaderMethodLink({ model, layout = "row" }: { model: keyof typeof TARGETS; layout?: "row" | "inline" }) {
  const { href, label } = TARGETS[model];
  const row = layout === "row";
  return (
    <div
      className={row ? "mt-2 hidden items-center pb-5 sm:flex" : "flex shrink-0 items-end sm:hidden"}
      style={row ? { borderBottom: "1px solid var(--app-border)" } : undefined}
    >
      <Link href={href} className="whitespace-nowrap text-xs hover:underline" style={{ color: "var(--app-text-muted)" }}>
        {label} <ArrowOut />
      </Link>
    </div>
  );
}
