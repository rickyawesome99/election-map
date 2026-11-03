"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px) and (hover: hover)";

/** A wide screen with a mouse: map clicks can open a page outright, since hover already shows the details. */
export function useDesktopPointer(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(QUERY); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
