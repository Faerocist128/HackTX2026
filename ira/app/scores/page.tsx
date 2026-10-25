"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Header } from "@/components/chrome/Header";
import { PageBand } from "@/components/chrome/PageBand";
import { FactorBreakdown } from "@/components/stage2/FactorBreakdown";
import { Rationale } from "@/components/stage2/Rationale";
import { ScoreGauge } from "@/components/stage2/ScoreGauge";
import { useAdvice } from "@/components/stage2/useAdvice";
import { scoreRefinance } from "@/lib/scoring/engine";
import { useAuditStore, useHydrated, useScoreInput } from "@/lib/store";

export default function ScoresPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { profile, vehicle, scenario } = useAuditStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!profile) router.replace("/setup/money");
    else if (!vehicle || !scenario) router.replace("/setup/car");
  }, [hydrated, profile, vehicle, scenario, router]);

  const input = useScoreInput();
  const result = useMemo(() => (input ? scoreRefinance(input) : null), [input]);
  const { advice, updating, error } = useAdvice(input);

  if (!hydrated || !input || !result) {
    return (
      <>
        <Header step={4} />
        <main className="mx-auto w-full max-w-[1248px] px-4 sm:px-8 py-10" aria-busy><div className="card h-[360px] p-6"><div className="shimmer w-1/3" /></div></main>
      </>
    );
  }

  return (
    <>
      <Header step={4} />
      <PageBand eyebrow="Step 4 of 5" title="Your scores">What&apos;s behind each score, for the loan you set up on the last page.</PageBand>
      <main className="mx-auto w-full max-w-[1248px] px-4 sm:px-8 py-8 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] items-start">
          <div className="space-y-6 min-w-0 lg:sticky lg:top-24">
            <div className="grid gap-4 sm:grid-cols-2">
              <ScoreGauge scale="odds" score={result.odds.score} band={result.odds.band} verdict={result.verdict} compact />
              <ScoreGauge scale="worth" score={result.worth.score} band={result.worth.band} verdict={result.verdict} compact />
            </div>
            <Rationale advice={advice} updating={updating} error={error} />
          </div>
          <FactorBreakdown result={result} />
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-4">
          <button className="btn btn-ghost" onClick={() => router.push("/audit")}>← Back to sliders</button>
          <button className="btn btn-primary" onClick={() => router.push("/plan")}>See my plan <span aria-hidden>→</span></button>
        </div>
      </main>
    </>
  );
}
