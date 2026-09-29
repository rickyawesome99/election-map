import { redirect } from "next/navigation";

// The States tab moved under Analysis; keep old links working.
export default function StatesPage() {
  redirect("/analysis/delegation");
}
