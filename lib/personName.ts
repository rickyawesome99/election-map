// Surnames of more than one word that don't start with a particle (de, van…), so they can't be
// told apart from a middle name by rule. Keyed by the full name as stored in the data.
const COMPOUND_SURNAMES: Record<string, string> = {
  "Catherine Cortez Masto": "Cortez Masto",
  "Lisa Blunt Rochester": "Blunt Rochester",
  "Michelle Lujan Grisham": "Lujan Grisham",
  "Jaime Herrera Beutler": "Herrera Beutler",
  "Nanette Diaz Barragán": "Barragán",
};

/** "Shelley Moore Capito" → "Capito"; "Chris Van Hollen" → "Van Hollen"; drops "Jr." and a
 *  trailing "(R)". Client-safe. */
export function lastName(name: string): string {
  const cleaned = name.replace(/\s*\([A-Z]\)\s*$/, "").replace(/,?\s+(Jr\.|Sr\.|II|III|IV)$/i, "").trim();
  if (COMPOUND_SURNAMES[cleaned]) return COMPOUND_SURNAMES[cleaned];
  const parts = cleaned.split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  const particle = parts.length > 2 ? parts[parts.length - 2] : "";
  return /^(de|da|di|du|del|della|la|le|van|von|der|den|bin|al)$/i.test(particle) ? `${particle} ${last}` : last;
}

/** A real candidate name rather than a stand-in like "Democrat" or "Republican candidate". */
export function isRealName(name: string): boolean {
  return !/^(Democrat|Republican|Independent)(ic)?( candidate)?$/i.test(name.trim());
}
