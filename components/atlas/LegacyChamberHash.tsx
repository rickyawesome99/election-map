"use client";

import { useEffect } from "react";

/** Old links opened the legislature page on a chamber with #house / #senate; those now have their own pages. */
export default function LegacyChamberHash({ stateId, chambers }: { stateId: string; chambers: string[] }) {
  useEffect(() => {
    const h = window.location.hash.slice(1).toLowerCase();
    if (chambers.includes(h)) window.location.replace(`/states/${stateId}/legislature/${h}`);
  }, [stateId, chambers]);
  return null;
}
