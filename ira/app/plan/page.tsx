"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Header } from "@/components/chrome/Header";
import { ActionPlan } from "@/components/stage2/ActionPlan";
import { ScoreGauge } from "@/components/stage2/ScoreGauge";
import { useAdvice } from "@/components/stage2/useAdvice";
import { engineSteps, withAiWording } from "@/lib/advice/engineSteps";
import { candidateSteps, previewWithSteps } from "@/lib/advice/steps";
import { VERDICT_COPY } from "@/lib/scoring/bands";
import { scoreRefinance } from "@/lib/scoring/engine";
import { useAuditStore, useHydrated, useScoreInput } from "@/lib/store";

export default function PlanPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { profile, vehicle, scenario, checkedSteps, toggleStep } = useAuditStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!profile) router.replace("/setup/money");
    else if (!vehicle || !scenario) router.replace("/setup/car");
  }, [hydrated, profile, vehicle, scenario, router]);

  const input = useScoreInput();
  const result = useMemo(() => (input ? scoreRefinance(input) : null), [input]);
  const candidates = useMemo(() => (input && result ? candidateSteps(input, result) : []), [input, result]);
  const preview = useMemo(
    () => (input && checkedSteps.length ? previewWithSteps(input, candidates, checkedSteps) : null),
    [input, candidates, checkedSteps],
  );
  const { advice } = useAdvice(input);
  const steps = useMemo(() => withAiWording(engineSteps(candidates), advice?.steps), [candidates, advice]);

  if (!hydrated || !input || !result) {
    return (
      <>
        <Header step={5} />
        <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-10 py-10" aria-busy><div className="card h-[360px] p-6"><div className="shimmer w-1/3" /></div></main>
      </>
    );
  }

  const ready = result.odds.band === "green" && result.worth.band === "green";
  return (
    <>
      <Header step={5} />
      <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-10 py-8 sm:py-10 grid gap-8 lg:grid-cols-[1.5fr_1fr] items-start">
        <div className="min-w-0">
          <h1 className="text-[32px] sm:text-[40px] font-extrabold leading-tight">Your plan</h1>
          <p className="mt-1" style={{ color: "var(--ink2)" }}>
            {advice?.verdict ?? VERDICT_COPY[result.verdict].headline}. Each step is priced by re-running your scores with that change.
          </p>
          <div className="mt-6">
            <ActionPlan steps={steps} ready={ready} checked={checkedSteps} onToggle={toggleStep} />
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-4">
          <ScoreGauge scale="odds" score={result.odds.score} band={result.odds.band} verdict={result.verdict} preview={preview?.odds} />
          <ScoreGauge scale="worth" score={result.worth.score} band={result.worth.band} verdict={result.verdict} preview={preview?.worth} />
          <div className="flex justify-between gap-4">
            <button className="btn btn-ghost" onClick={() => router.push("/scores")}>← Back to your scores</button>
          </div>
        </aside>
      </main>
    </>
  );
}
