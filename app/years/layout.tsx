import type { ReactNode } from "react";
import YearsShell from "@/components/years/YearsShell";

// The Years page's shell: the title and year switcher live here, so moving between /years and
// /years/[year] swaps only the year's content under them.
export default function YearsLayout({ children }: { children: ReactNode }) {
  return <YearsShell>{children}</YearsShell>;
}
