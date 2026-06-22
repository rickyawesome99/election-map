export function isCongressionalDistrictGeoid(
  geoid: string | undefined,
  stateFips?: string,
): geoid is string {
  return typeof geoid === "string"
    && /^\d{4}$/.test(geoid)
    && (!stateFips || geoid.startsWith(stateFips));
}
