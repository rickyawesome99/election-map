import { notFound } from "next/navigation";
import YearPage from "@/components/years/YearPage";
import { YEAR_PAGE_YEARS, yearKind } from "@/lib/yearPageTypes";

// A past election year on the Years page; the newest year is /years itself.
export const dynamicParams = false;

export function generateStaticParams() {
  return YEAR_PAGE_YEARS.slice(1).map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
  const { year } = await params;
  return {
    title: `${year} Elections`,
    description: `The ${year} elections as a whole (${yearKind(Number(year)).toLowerCase()}): the national environment, seats won and lost in every office on the ballot, and each state's results.`,
  };
}

export default async function PastYearPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  if (!YEAR_PAGE_YEARS.slice(1).includes(year)) notFound();
  return <YearPage year={year} />;
}
