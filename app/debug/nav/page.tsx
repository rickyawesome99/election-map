import NavStallLog from "@/components/NavStallLog";

// Not linked from anywhere: the navigation stalls this browser has recorded (lib/navPending.ts),
// so a stall seen on a phone can be read off the phone.
export const metadata = { title: "Navigation log", robots: { index: false } };

export default function NavDebugPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6" style={{ color: "var(--app-text-primary)" }}>
      <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>Navigation log</h1>
      <NavStallLog />
    </main>
  );
}
