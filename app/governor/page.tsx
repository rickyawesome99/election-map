import ChamberPage, { chamberMetadata } from "@/components/ChamberPage";

export const metadata = chamberMetadata("governor");

export default function GovernorPage() {
  return <ChamberPage office="governor" />;
}
