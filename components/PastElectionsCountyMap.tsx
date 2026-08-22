import StateCountyMap from "./StateCountyMap";

export default function PastElectionsCountyMap({
  stateAbbr,
  stateName,
}: {
  stateAbbr: string;
  stateName: string;
}) {
  return <StateCountyMap stateAbbr={stateAbbr} stateName={stateName} showTpl showLabel={false} />;
}
