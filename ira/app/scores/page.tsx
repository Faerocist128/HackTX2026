"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Header } from "@/components/chrome/Header";
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
        <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-10 py-10" aria-busy><div className="card h-[360px] p-6"><div className="shimmer w-1/3" /></div></main>
      </>
    );
  }

  return (
    <>
      <Header step={4} />
      <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-10 py-8 sm:py-10">
        <h1 className="text-[32px] sm:text-[40px] font-extrabold leading-tight">Your scores</h1>
        <p className="mt-1" style={{ color: "var(--ink2)" }}>What&apos;s behind each score, for the loan you set up on the last page.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <ScoreGauge scale="odds" score={result.odds.score} band={result.odds.band} verdict={result.verdict} />
          <ScoreGauge scale="worth" score={result.worth.score} band={result.worth.band} verdict={result.verdict} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2 items-start">
          <Rationale advice={advice} updating={updating} error={error} />
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
