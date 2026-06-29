import ForecastMap from "@/components/ForecastMap";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <ForecastMap initialTab={tab ?? null} />;
}
