import { TplCandidatesPage } from "@/components/tpl/TplCandidatesPage";
import { buildModelSummary, warSlice } from "@/lib/modelSlices";

export const metadata = {
  title: "Candidates — Wins Above Replacement",
  description: "Every scored race since 2016 with both nominees' Wins Above Replacement, and each candidate's record.",
};

// The newest cycle's rows are rendered in so the first paint is a full table; the whole
// table (every year) is fetched from /api/model/war once the page is open. The candidate
// record reads its selection (?c=slug) from the URL after mount.
export default function ModelCandidatesPage() {
  const summary = buildModelSummary();
  const year = summary.topWar.year;
  const initialRows = warSlice().filter((r) => r.year === year);
  return <TplCandidatesPage initialRows={initialRows} initialYear={year} totals={{ races: summary.racesScored, performances: summary.performances }} />;
}
