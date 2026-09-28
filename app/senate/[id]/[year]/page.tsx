import { notFound } from "next/navigation";
import PastElectionPage from "@/components/PastElectionPage";
import { getPastElection, listPastElections } from "@/lib/pastElections";

// One page per past Senate election, nested under its seat: the URL that seat pages,
// candidate pages, state pages and county pages link to for a specific past result.

export const dynamicParams = false;

export async function generateStaticParams() {
  return listPastElections("senate");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; year: string }> }) {
  const { id, year } = await params;
  const e = getPastElection("senate", id, parseInt(year, 10));
  if (!e) return { title: "Election Not Found" };
  const winner = e.winner === "dem" ? e.dem : e.rep;
  const loser = e.winner === "dem" ? e.rep : e.dem;
  return {
    title: `${e.stateName} ${e.officeLabel} ${e.year}${e.isSpecial ? " Special" : ""}: ${winner.name} defeats ${loser.name}`,
    description: `${e.year} ${e.stateName} ${e.officeLabel} election results: ${winner.name} ${winner.pct.toFixed(1)}%, ${loser.name} ${loser.pct.toFixed(1)}%. County map, TPL expected margin, WAR and polling error.`,
  };
}

export default async function Page({ params }: { params: Promise<{ id: string; year: string }> }) {
  const { id, year } = await params;
  const e = getPastElection("senate", id, parseInt(year, 10));
  if (!e) notFound();
  return <PastElectionPage election={e} />;
}
