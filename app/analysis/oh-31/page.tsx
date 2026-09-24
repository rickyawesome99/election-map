import { permanentRedirect } from "next/navigation";

// The original OH-31 page lived here; it is now the first district on the generic
// precinct-district route. Keep the old link working.
export default function LegacyOH31Page() {
  permanentRedirect("/analysis/districts/oh-hd-31");
}
