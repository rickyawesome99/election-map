import { forecastIsFinal, FORECAST_FINAL_LABEL } from "@/lib/forecastClock";
import { PILL } from "@/components/RaceHeroPills";

// The "Final forecast" marker (user, 2026-11-03): the forecast is locked (lib/forecastClock.ts
// FORECAST_FINAL_AT) and every page that shows it says so. Same size as the race-page pill row; an
// outlined neutral pill with a lock glyph, so it reads as a status, not a rating. Renders nothing
// while the forecast is live.
export default function FinalForecastPill({ className = "" }: { className?: string }) {
  if (!forecastIsFinal) return null;
  return (
    <span
      className={`${PILL} inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}
      style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-text-primary)" }}
      title={`Final forecast. ${FORECAST_FINAL_LABEL}; it will not change.`}
      aria-label={`Final forecast, ${FORECAST_FINAL_LABEL.toLowerCase()}`}
    >
      <svg width="10" height="11" viewBox="0 0 10 11" aria-hidden="true" fill="currentColor">
        <path d="M2.5 4.5V3.25a2.5 2.5 0 0 1 5 0V4.5h.5A1 1 0 0 1 9 5.5v4.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1zm1.25 0h2.5V3.25a1.25 1.25 0 0 0-2.5 0z" />
      </svg>
      Final forecast
    </span>
  );
}
