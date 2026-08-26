import type { ChamberMapInfo } from "@/data/stateLegMapInfo";

type ChamberAboutData = {
  label: string;
  mapInfo: ChamberMapInfo | null;
  totalSeats: number | null;
};

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </div>
      <div className="text-xs font-semibold mt-0.5" style={{ color: "var(--app-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function ChamberAboutBlock({ label, mapInfo, totalSeats }: ChamberAboutData) {
  const tiles = [
    { label: "Total Seats", value: totalSeats != null ? String(totalSeats) : "TBD" },
    { label: "Seats Needed for Supermajority", value: mapInfo?.supermajoritySeats != null ? String(mapInfo.supermajoritySeats) : "TBD" },
    { label: "Election Frequency", value: mapInfo?.electionFrequency ?? "TBD" },
    { label: "Redistricting Authority", value: mapInfo?.source ?? "TBD" },
    { label: "Current Map Enacted", value: mapInfo?.enactedDate ? mapInfo.enactedDate.slice(0, 4) : "TBD" },
    { label: "First Election Year with Current Map", value: mapInfo?.firstCycle ? String(mapInfo.firstCycle) : "TBD" },
  ];
  // Pair tiles into two-column rows, each row divided from the next by a single full-width line.
  const rows: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));

  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </h3>
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-4 py-2.5"
            style={i < rows.length - 1 ? { borderBottom: "1px solid var(--app-border)" } : undefined}
          >
            {row.map((t) => (
              <StatItem key={t.label} label={t.label} value={t.value} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StateLegAboutSection({ blocks }: { blocks: ChamberAboutData[] }) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block) => (
        <ChamberAboutBlock key={block.label} {...block} />
      ))}
    </div>
  );
}
