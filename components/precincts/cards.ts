import type { CountyTooltipProps } from "@/components/CountyTooltip";
import { marginOf, OFFICE_LABEL, type Office } from "./types";

// The hover box on both precinct-page maps is the site's shared county card (components/CountyTooltip),
// so a precinct reads exactly like a county does on the Historical tab. Precinct files carry party
// sides rather than candidate names, so the two rows are labelled by party.
export function resultCard(title: string, subtitle: string, row: [number, number, number] | undefined, office: Office): CountyTooltipProps {
  const m = marginOf(row);
  if (!row || m === null) {
    return { kind: "message", title, subtitle, message: `No ${OFFICE_LABEL[office].toLowerCase()} votes here: no contest on this ballot, or the race was not counted.` };
  }
  const total = row[0] + row[1] + row[2];
  return {
    kind: "result",
    title,
    subtitle,
    dem: { name: "Democrat", party: "D", pct: (row[0] / total) * 100, votes: row[0], link: false },
    rep: { name: "Republican", party: "R", pct: (row[1] / total) * 100, votes: row[1], link: false },
    margin: m,
    totalVotes: total,
  };
}
