"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Header } from "@/components/chrome/Header";
import { PaymentComparison } from "@/components/stage1/PaymentComparison";
import { SavingsChart } from "@/components/stage1/SavingsChart";
import { ScenarioSliders } from "@/components/stage1/ScenarioSliders";
import { ScoreGauge } from "@/components/stage2/ScoreGauge";
import { BAND_COLORS } from "@/lib/scoring/bands";
import { scoreRefinance } from "@/lib/scoring/engine";
import { useAuditStore, useHydrated, useScoreInput } from "@/lib/store";

const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

export default function AuditPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { profile, vehicle, scenario, setScenario, resetScenario } = useAuditStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!profile) router.replace("/setup/money");
    else if (!vehicle || !scenario) router.replace("/setup/car");
  }, [hydrated, profile, vehicle, scenario, router]);

  // Synchronous, client-side: both scores move on every slider tick.
  const input = useScoreInput();
  const result = useMemo(() => (input ? scoreRefinance(input) : null), [input]);

  if (!hydrated || !input || !result || !profile || !vehicle || !scenario) {
    return (
      <>
        <Header step={3} />
        <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-10 py-10 grid gap-6 lg:grid-cols-[1.35fr_1fr]" aria-busy>
          <div className="space-y-6"><div className="card h-[520px] p-6"><div className="shimmer w-1/3" /></div></div>
          <div className="space-y-6"><div className="card h-[360px] p-6"><div className="shimmer w-1/3" /></div></div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header step={3} />
      <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-10 py-8 sm:py-10 pb-28 lg:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[32px] sm:text-[40px] font-extrabold leading-tight">Your refinance audit</h1>
            <p style={{ color: "var(--ink2)" }}>
              {profile.name.split(" ")[0]} · {vehicle.year} {vehicle.make} {vehicle.model}{vehicle.trim ? ` ${vehicle.trim}` : ""} · Worth about {usd(vehicle.estValue)}
            </p>
          </div>
          <div className="flex gap-4 font-semibold">
            <Link href="/setup/car">← Back to your car</Link>
            <Link href="/setup/money">Edit my info</Link>
          </div>
        </div>

        {result.knockouts.length > 0 && (
          <div className="mt-6 rounded-2xl p-4" role="status" style={{ background: "var(--redSoft)", color: "var(--redInk)" }}>
            <p className="font-bold">Most lenders would say no right now, and that&apos;s okay. Here&apos;s why:</p>
            <ul className="mt-1 list-disc pl-5">{result.knockouts.map((k) => <li key={k}>{k}</li>)}</ul>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr] items-start">
          <div className="space-y-6 min-w-0">
            <ScenarioSliders scenario={scenario} result={result} onChange={setScenario} onReset={resetScenario} />
            <PaymentComparison result={result} scenario={scenario} />
          </div>
          {/* Scores and chart stay on screen while the sliders move. */}
          <div className="space-y-4 min-w-0 lg:sticky lg:top-4">
            <div className="grid grid-cols-2 gap-4">
              <ScoreGauge scale="odds" score={result.odds.score} band={result.odds.band} verdict={result.verdict} compact />
              <ScoreGauge scale="worth" score={result.worth.score} band={result.worth.band} verdict={result.verdict} compact />
            </div>
            <SavingsChart profile={profile} scenario={scenario} result={result} compact />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-4">
          <button className="btn btn-ghost" onClick={() => router.push("/setup/car")}>Back</button>
          <button className="btn btn-primary" onClick={() => router.push("/scores")}>See what&apos;s driving your scores <span aria-hidden>→</span></button>
        </div>
      </main>

      {/* Phones: both scores pinned to the bottom of the screen. */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-4 py-3 flex gap-3" style={{ background: "var(--card)", borderTop: "1px solid var(--line)" }} aria-hidden>
        {([["Approval odds", result.odds], ["Refinance value", result.worth]] as const).map(([label, sc]) => (
          <div key={label} className="flex-1 rounded-2xl px-3 py-2 flex items-center justify-between" style={{ background: BAND_COLORS[sc.band].soft }}>
            <span className="text-[13px] font-bold" style={{ color: BAND_COLORS[sc.band].ink }}>{label}</span>
            <span className="text-[26px] font-extrabold" style={{ color: BAND_COLORS[sc.band].ink }}>{sc.score}</span>
          </div>
        ))}
      </div>
    </>
  );
}
