"use client";
import { InfoTooltip } from "@/components/InfoTooltip";

export function WinProbabilityLabel() {
  return (
    <InfoTooltip label="Win Probability">
      Derived from projected margin via logistic function:
      <br />
      <span className="font-mono text-[10px]" style={{ color: "var(--app-text-primary)" }}>
        P(D) = 1 / (1 + e^(0.13 × margin))
      </span>
      <br />
      Clamped to 2–98%.
    </InfoTooltip>
  );
}
