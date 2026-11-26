import ChamberPage, { chamberMetadata } from "@/components/ChamberPage";

export const metadata = chamberMetadata("senate");

export default function SenatePage() {
  return <ChamberPage office="senate" />;
}
