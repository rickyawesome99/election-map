import { gradeTint } from "@/lib/pollsterDisplay";

/** Letter-grade chip; "NR" (not rated) for a pollster with fewer than five graded polls. */
export default function PollsterGradeChip({ grade, title }: { grade: string | null; title?: string }) {
  return (
    <span
      className="inline-flex h-5 min-w-[1.9rem] items-center justify-center rounded px-1 text-[11px] font-bold tabular-nums"
      style={{ background: gradeTint(grade), color: grade ? "var(--app-text-primary)" : "var(--app-text-very-muted)", border: grade ? "none" : "1px dashed var(--app-border)" }}
      title={title ?? (grade ? `Historical accuracy grade ${grade}` : "Not rated — fewer than five graded polls")}
    >
      {grade ?? "NR"}
    </span>
  );
}
