import StateCountyMap from "./StateCountyMap";

export default function PastElectionsCountyMap({
  stateAbbr,
  stateName,
  countyTpl,
}: {
  stateAbbr: string;
  stateName: string;
  countyTpl: Record<string, number | null>;
}) {
  return <StateCountyMap stateAbbr={stateAbbr} stateName={stateName} showTpl showLabel={false} countyTpl={countyTpl} />;
}
