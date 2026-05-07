import { electionYear } from "@/data/forecastData";
import AppHeader from "@/components/AppHeader";
import BackButton from "@/components/BackButton";
import OhioTreasurerContent from "@/components/OhioTreasurerContent";

export const metadata = {
  title: `Ohio State Treasurer Primary — ${electionYear} Analysis`,
  description: "Ohio State Treasurer GOP Primary results by county",
};

export default function OhioTreasurerPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <AppHeader back={<BackButton />} />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
            Ohio State Treasurer Primary
          </h1>
          <p style={{ color: "var(--app-text-muted)" }}>
            GOP Primary · Results by County
          </p>
        </div>
        <OhioTreasurerContent />
      </main>
    </div>
  );
}
