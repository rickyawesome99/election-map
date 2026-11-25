"use client";

import { useEffect } from "react";

/** Until 2026-11-25 /results was the election-night page, whose races opened on a hash
 *  (/results#senate-TX, /results#house-4823). That page is now /enight; send old links there. */
export default function LegacyHashRedirect() {
  useEffect(() => {
    if (/^#(senate|governor|house)-/.test(window.location.hash)) window.location.replace(`/enight${window.location.hash}`);
  }, []);
  return null;
}
