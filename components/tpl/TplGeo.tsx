"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Geo = "states" | "districts";

// The hub's States/Districts toggle, held in context so every part of the hub reads one setting.
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

