"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer, Header } from "@/components/chrome/Header";
import { PaymentComparison } from "@/components/stage1/PaymentComparison";
import { SavingsChart } from "@/components/stage1/SavingsChart";
import { ScenarioSliders } from "@/components/stage1/ScenarioSliders";
import { ActionPlan } from "@/components/stage2/ActionPlan";
import { FactorBreakdown } from "@/components/stage2/FactorBreakdown";
import { Rationale } from "@/components/stage2/Rationale";
import { ScoreGauge } from "@/components/stage2/ScoreGauge";
import { useAdvice } from "@/components/stage2/useAdvice";
import { candidateSteps, previewWithSteps } from "@/lib/advice/steps";
import { scoreRefinance } from "@/lib/scoring/engine";
import { useAuditStore, useHydrated } from "@/lib/store";

const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

export default function AuditPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { profile, vehicle, scenario, checkedSteps, setScenario, resetScenario, toggleStep } = useAuditStore();
  const [onPlan, setOnPlan] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!profile) router.replace("/setup/money");
    else if (!vehicle || !scenario) router.replace("/setup/car");
  }, [hydrated, profile, vehicle, scenario, router]);

  // Stepper: step 4 ("Your plan") once the plan section is on screen.
  useEffect(() => {
    const el = document.getElementById("plan");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnPlan(e.isIntersecting), { rootMargin: "0px 0px -40% 0px" });
    io.observe(el);
    return () => io.disconnect();
  });

  // Synchronous, client-side: the score moves on every slider tick.
  const input = useMemo(() => (profile && vehicle && scenario ? { profile, vehicle, scenario } : null), [profile, vehicle, scenario]);
  const result = useMemo(() => (input ? scoreRefinance(input) : null), [input]);
  const steps = useMemo(() => (input && result ? candidateSteps(input, result) : []), [input, result]);
  const preview = useMemo(() => {
    if (!input || !checkedSteps.length) return null;
    return previewWithSteps(input, steps, checkedSteps);
  }, [input, steps, checkedSteps]);
  const { advice, updating, error } = useAdvice(input);

  if (!hydrated || !input || !result || !profile || !vehicle || !scenario) {
    return (
      <>
        <Header step={3} />
        <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-10 py-10 grid gap-6 lg:grid-cols-[1.45fr_1fr]" aria-busy>
          <div className="space-y-6"><div className="card h-[520px] p-6"><div className="shimmer w-1/3" /></div><div className="card h-[300px]" /></div>
          <div className="space-y-6"><div className="card h-[360px] p-6"><div className="shimmer w-1/3" /></div></div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header step={onPlan ? 4 : 3} />
      <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-10 py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[32px] sm:text-[40px] font-extrabold leading-tight">Your refinance audit</h1>
            <p style={{ color: "var(--ink2)" }}>
              {profile.name.split(" ")[0]} · {vehicle.year} {vehicle.make} {vehicle.model}{vehicle.trim ? ` ${vehicle.trim}` : ""} · Worth about {usd(vehicle.estValue)}
            </p>
          </div>
          <Link href="/setup/money" className="font-semibold">Edit my info</Link>
        </div>

        {result.knockouts.length > 0 && (
          <div className="mt-6 rounded-2xl p-4" role="status" style={{ background: "var(--redSoft)", color: "var(--redInk)" }}>
            <p className="font-bold">Most lenders would say no right now, and that&apos;s okay. Here&apos;s why:</p>
            <ul className="mt-1 list-disc pl-5">{result.knockouts.map((k) => <li key={k}>{k}</li>)}</ul>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_1fr] items-start">
          {/* Stage 1: how refinancing could look */}
          <div className="space-y-6 order-2 lg:order-1 min-w-0">
            <ScenarioSliders scenario={scenario} result={result} onChange={setScenario} onReset={resetScenario} />
            <PaymentComparison result={result} scenario={scenario} />
            <SavingsChart profile={profile} scenario={scenario} result={result} />
          </div>
          {/* Stage 2: should you refinance */}
          <div className="space-y-6 order-1 lg:order-2 min-w-0">
            <ScoreGauge score={result.score} band={result.band} verdict={result.verdict} preview={preview} />
            <FactorBreakdown factors={result.factors} score={result.score} />
            <Rationale advice={advice} updating={updating} error={error} />
            <ActionPlan advice={advice} band={result.band} checked={checkedSteps} onToggle={toggleStep} checkBackMonths={result.checkAgainMonths} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
