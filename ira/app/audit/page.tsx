"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/chrome/Header";
import { PageBand } from "@/components/chrome/PageBand";
import { PaymentComparison } from "@/components/stage1/PaymentComparison";
import { SavingsChart } from "@/components/stage1/SavingsChart";
import { ScenarioSliders } from "@/components/stage1/ScenarioSliders";
import { ScoreGauge } from "@/components/stage2/ScoreGauge";
import { BAND_COLORS, displayLabel, SCALE_COPY } from "@/lib/scoring/bands";
import { scoreRefinance } from "@/lib/scoring/engine";
import type { ScoreResult } from "@/lib/scoring/types";
import { useAuditStore, useHydrated, useScoreInput } from "@/lib/store";

const usd = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;

/** The money answer, kept on screen next to the scores (PRODUCT.md: total cost over teaser payments). */
function costLine(r: ScoreResult) {
  const t = r.metrics.lifetimeInterestDelta;
  return Math.abs(t) < 1 ? "About the same overall" : t > 0 ? `Save ${usd(t)} overall` : `Costs ${usd(t)} more overall`;
}

function CostSummary({ result }: { result: ScoreResult }) {
  const m = result.metrics;
  const saves = m.lifetimeInterestDelta >= 0;
  return (
    <section className="card p-5" aria-labelledby="cost-h">
      <h2 id="cost-h" className="text-[15px] font-semibold" style={{ color: "var(--ink2)" }}>Refinancing this way</h2>
      <p className="mt-1 text-[32px] sm:text-[36px] font-bold leading-[1.1] tracking-tight" style={{ color: saves ? "var(--green)" : "var(--amber)" }}>{costLine(result)}</p>
      <p className="hint mt-1">
        {usd(m.newPayment)}/mo instead of {usd(m.currentPayment)}/mo · paid off in {m.monthsToPayoff} months instead of {m.currentMonthsLeft}
      </p>
    </section>
  );
}

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

  // One announcement for both scores and the cost, after the user stops moving a control,
  // instead of a live region per gauge firing on every arrow-key press.
  const summary = result
    ? `${SCALE_COPY.odds.title} ${result.odds.score}, ${displayLabel("odds", result.odds.band, result.verdict)}. ` +
      `${SCALE_COPY.worth.title} ${result.worth.score}, ${displayLabel("worth", result.worth.band, result.verdict)}. ${costLine(result)}.`
    : "";
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(summary), 600);
    return () => clearTimeout(t);
  }, [summary]);

  if (!hydrated || !input || !result || !profile || !vehicle || !scenario) {
    return (
      <>
        <Header step={3} />
        <main className="mx-auto w-full max-w-[1248px] px-4 sm:px-8 py-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]" aria-busy>
          <p className="sr-only" role="status">Loading your numbers…</p>
          <div className="space-y-6"><div className="card h-[520px] p-6"><div className="shimmer w-1/3" /></div></div>
          <div className="space-y-6"><div className="card h-[360px] p-6"><div className="shimmer w-1/3" /></div></div>
        </main>
      </>
    );
  }

  const knockedOut = result.knockouts.length > 0;
  const uncapped = result.odds.uncappedScore;
  // Cash-out adds to what's owed, so it alone can trip the 130% value limit; then the sliders can help.
  const cashOutCauses =
    knockedOut && scenario.loanType === "cash-out" &&
    scoreRefinance({ ...input, scenario: { ...scenario, loanType: "fixed" } }).knockouts.length < result.knockouts.length;

  return (
    <>
      <Header step={3} />
      <PageBand eyebrow="Step 3 of 5" title="Try it out">
        {profile.name.split(" ")[0]} · {vehicle.year} {vehicle.make} {vehicle.model}{vehicle.trim ? ` ${vehicle.trim}` : ""} · Worth about {usd(vehicle.estValue)}
      </PageBand>
      <main className="mx-auto w-full max-w-[1248px] px-4 sm:px-8 py-8 sm:py-10 pb-36 lg:pb-10">

        {knockedOut && (
          <section className="mb-6 rounded-lg p-5" aria-labelledby="ko-h" style={{ background: "var(--amberSoft)" }}>
            <h2 id="ko-h" className="font-semibold text-[17px]" style={{ color: "var(--amber)" }}>Lenders will likely say no for now</h2>
            <ul className="mt-1 list-disc pl-5" style={{ color: "var(--ink)" }}>{result.knockouts.map((k) => <li key={k}>{k}</li>)}</ul>
            <p className="mt-2" style={{ color: "var(--ink)" }}>
              {cashOutCauses
                ? <>The cash-out adds to what you&apos;d owe. Switch the loan type under More options to drop it.</>
                : <>Nothing on this page changes {result.knockouts.length > 1 ? "these" : "that"}, so your approval odds stay at {result.odds.score}
                    {uncapped !== undefined && <> (without {result.knockouts.length > 1 ? "them" : "it"}, they&apos;d be about {uncapped})</>}.
                    The sliders still show what refinancing would be worth once you qualify
                    {result.checkAgainMonths ? <>, and it&apos;s worth checking again in about {result.checkAgainMonths} months</> : null}.</>}
            </p>
            <Link href="/plan" className="mt-2 inline-block font-bold">See your path</Link>
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr] items-start">
          <div className="space-y-6 min-w-0">
            <ScenarioSliders scenario={scenario} current={profile.currentAutoLoan} result={result} onChange={setScenario} onReset={resetScenario} />
            <PaymentComparison result={result} scenario={scenario} />
          </div>
          {/* The money answer, both scores and the chart stay on screen while the sliders move. */}
          <div className="space-y-4 min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <CostSummary result={result} />
            <div className="grid grid-cols-2 gap-4">
              <ScoreGauge scale="odds" score={result.odds.score} band={result.odds.band} verdict={result.verdict} compact announce={false} />
              <ScoreGauge scale="worth" score={result.worth.score} band={result.worth.band} verdict={result.verdict} compact announce={false} celebrate={!knockedOut} />
            </div>
            <SavingsChart profile={profile} scenario={scenario} result={result} compact />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-between gap-4">
          <button className="btn btn-ghost" onClick={() => router.push("/setup/car")}>Back</button>
          <button className="btn btn-primary" onClick={() => router.push("/scores")}>See what&apos;s driving your scores <span aria-hidden>→</span></button>
        </div>
        <p className="sr-only" aria-live="polite">{announced}</p>
      </main>

      {/* Phones: the money answer and both scores pinned to the bottom of the screen. */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-4 pt-2 pb-3" style={{ background: "var(--card)", borderTop: "1px solid var(--line)" }} aria-hidden>
        <p className="text-[15px] font-bold" style={{ color: result.metrics.lifetimeInterestDelta >= 0 ? "var(--green)" : "var(--amber)" }}>{costLine(result)}</p>
        <div className="mt-1.5 flex gap-3">
          {(["odds", "worth"] as const).map((k) => {
            const sc = result[k];
            return (
              <div key={k} className="flex-1 min-w-0 rounded px-3 py-1.5 flex items-center justify-between gap-2" style={{ background: BAND_COLORS[sc.band].soft, color: BAND_COLORS[sc.band].ink }}>
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold">{SCALE_COPY[k].title}</span>
                  <span className="block text-[12px] leading-tight">{displayLabel(k, sc.band, result.verdict)}</span>
                </span>
                <span className="text-[24px] font-bold">{sc.score}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
