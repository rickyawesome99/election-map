"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Geo = "states" | "districts";

// The hub's States/Districts toggle, shared so the server-rendered header stats can follow it.
const GeoContext = createContext<{ geo: Geo; setGeo: (g: Geo) => void } | null>(null);

export function TplGeoProvider({ children }: { children: ReactNode }) {
  const [geo, setGeo] = useState<Geo>("states");
  // /model#districts (the old District Table's redirect) opens on the district map.
  useEffect(() => {
    // One-time sync from the URL after mount; the hash is not available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.hash === "#districts") setGeo("districts");
  }, []);
  return <GeoContext.Provider value={{ geo, setGeo }}>{children}</GeoContext.Provider>;
}

export function useTplGeo() {
  const ctx = useContext(GeoContext);
  if (!ctx) throw new Error("useTplGeo must be used inside TplGeoProvider");
  return ctx;
}

// "R states · D states", or the district split when the hub is on Districts.
export function SideCountStat({ states, districts }: { states: [number, number]; districts: [number, number] }) {
  const { geo } = useTplGeo();
  const [r, d] = geo === "states" ? states : districts;
  return (
    <>
      <div className="text-xl font-extrabold tabular-nums">
        <span style={{ color: "var(--party-rep)" }}>{r}</span> · <span style={{ color: "var(--party-dem)" }}>{d}</span>
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{geo === "states" ? "R states · D states" : "R districts · D districts"}</div>
    </>
  );
}
