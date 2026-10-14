"use client";

import { useEffect } from "react";

/**
 * /states/[id]/legislature is gone: a #house / #senate hash opened a chamber there, which now has
 * its own page; anything else lands on the state page's legislature section.
 */
export default function LegislatureRedirect({ stateId, chambers }: { stateId: string; chambers: string[] }) {
  useEffect(() => {
    const h = window.location.hash.slice(1).toLowerCase();
    window.location.replace(chambers.includes(h) ? `/states/${stateId}/legislature/${h}` : `/states/${stateId}#legislature`);
  }, [stateId, chambers]);
  return null;
}
