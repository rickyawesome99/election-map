import ChamberPage, { chamberMetadata } from "@/components/ChamberPage";

export const metadata = chamberMetadata("house");

export default function HousePage() {
  return <ChamberPage office="house" />;
}
