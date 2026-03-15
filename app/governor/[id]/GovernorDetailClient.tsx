"use client";

import TrendChart from "@/components/TrendChart";

type Props = {
  history: { date: string; value: number }[];
};

export default function GovernorDetailClient({ history }: Props) {
  return <TrendChart data={history} />;
}
