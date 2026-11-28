import YearPage from "@/components/years/YearPage";
import { YEAR_PAGE_YEARS } from "@/lib/yearPageTypes";

// The Years page: each election year as a whole. This is the newest year; the rest are
// /years/[year], under the same title and switcher (app/years/layout.tsx).
export const metadata = {
  title: `${YEAR_PAGE_YEARS[0]} Elections`,
  description: `Every election year from ${YEAR_PAGE_YEARS[YEAR_PAGE_YEARS.length - 1]} to ${YEAR_PAGE_YEARS[0]} as a whole: the national environment, the president, Senate, House, governors and state legislatures, and each state's results.`,
};

export default function YearsPage() {
  return <YearPage year={YEAR_PAGE_YEARS[0]} />;
}
