"use client";
import { useEffect, useState } from "react";
import { Tip } from "@/components/ui/Tip";
import type { AutoLoan, LenderChannel, LoanType, PaymentBehavior, Scenario, ScoreResult } from "@/lib/scoring/types";

const TYPE_LABEL: Record<LoanType, string> = {
  fixed: "Standard fixed",
  variable: "Variable",
  "cash-out": "Cash-out",
  "lease-buyout": "Lease buyout",
};
const TYPE_HELP: Record<LoanType, string> = {
  fixed: "Your rate and payment stay the same the whole loan.",
  variable: "Starts about 0.75 percentage points lower but can rise later. Harder to plan around.",
  "cash-out": "Borrow $2,000 extra in cash. You'll owe more than you do now.",
  "lease-buyout": "Use a loan to buy the car at the end of your lease. Rates run a little higher.",
};
const CHANNEL_LABEL: Record<LenderChannel, string> = { creditUnion: "Credit union", bank: "Bank", financeCompany: "Finance company" };
const HABIT_LABEL: Record<PaymentBehavior, string> = { early: "Early", "on-time": "On time", late: "Late" };

function Range(props: {
  label: string; tip: string; value: number; min: number; max: number; step: number; display: string;
  minLabel: string; maxLabel: string; onChange: (v: number) => void;
  band?: [number, number]; bandLabel?: string; mark?: { value: number; label: string };
}) {
  const pct = (v: number) => ((Math.max(props.min, Math.min(props.max, v)) - props.min) / (props.max - props.min)) * 100;
  const id = props.label.replace(/\W+/g, "-").toLowerCase();
  const described = [props.bandLabel && `${id}-band`, props.mark && `${id}-mark`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mt-6 first:mt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label htmlFor={id} className="label flex items-center gap-1">{props.label}<Tip text={props.tip} label={props.label} /></label>
        <output htmlFor={id} className="text-[18px] sm:text-[20px] font-bold whitespace-nowrap">{props.display}</output>
      </div>
      <div className="slider mt-1">
        <div className="track"><div className="done" style={{ width: `${pct(props.value)}%` }} /></div>
        {props.band && (
          <div className="band" aria-hidden style={{ left: `${pct(props.band[0])}%`, width: `${Math.max(2, pct(props.band[1]) - pct(props.band[0]))}%` }} />
        )}
        {props.mark && <div className="mark" aria-hidden style={{ left: `${pct(props.mark.value)}%` }} />}
        <input id={id} className="range" type="range" min={props.min} max={props.max} step={props.step} value={props.value} aria-valuetext={props.display} aria-describedby={described} onChange={(e) => props.onChange(Number(e.target.value))} />
      </div>
      <div className="flex justify-between items-center hint text-[13px] gap-2">
        <span>{props.minLabel}</span>
        {props.bandLabel && <span id={`${id}-band`} className="font-semibold text-center" style={{ color: "var(--green)" }}>{props.bandLabel}</span>}
        <span>{props.maxLabel}</span>
      </div>
      {props.mark && (
        <p id={`${id}-mark`} className="hint text-[13px] mt-0.5 inline-flex items-center gap-1.5">
          <span className="inline-block w-[3px] h-3.5 rounded-sm" style={{ background: "var(--ink)" }} aria-hidden />
          {props.mark.label}
        </p>
      )}
    </div>
  );
}

export function ScenarioSliders({ scenario, current, result, onChange, onReset }: {
  scenario: Scenario; current: AutoLoan; result: ScoreResult; onChange: (p: Partial<Scenario>) => void; onReset: () => void;
}) {
  const yrs = scenario.termMonths / 12;
  const [lo, hi] = result.metrics.likelyAprRange;
  const below = scenario.targetApr < lo;
  // Subprime rates can top 20%; the track always reaches past the likely range.
  const aprMax = Math.max(20, Math.ceil(hi + 1));

  // Reset wipes a tuned scenario in one click, so offer an undo for a few seconds.
  const [undo, setUndo] = useState<Scenario | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8_000);
    return () => clearTimeout(t);
  }, [undo]);

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="try-h">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="try-h" className="text-[22px] font-semibold">Set up a new loan</h2>
          <p className="hint">Move the sliders. Your scores and total cost update as you go.</p>
        </div>
        {undo ? (
          <button className="btn btn-ghost btn-sm" onClick={() => { onChange(undo); setUndo(null); }}>Undo reset</button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => { setUndo(scenario); onReset(); }}>Reset</button>
        )}
      </div>
      <div className="mt-6">
        <Range label="Loan length" tip="How many months you'll make payments. Longer means smaller payments but more interest." value={scenario.termMonths} min={24} max={84} step={6}
          display={`${scenario.termMonths} months${Number.isInteger(yrs) ? ` (${yrs} year${yrs > 1 ? "s" : ""})` : ""}`} minLabel="24 months" maxLabel="84 months"
          mark={{ value: current.monthsRemaining, label: `Your loan today: ${current.monthsRemaining} months left` }} onChange={(v) => onChange({ termMonths: v })} />
        <Range label="Interest rate (APR)" tip="The yearly cost of borrowing, shown as a percent of what you owe." value={scenario.targetApr} min={2} max={aprMax} step={0.1}
          display={`${scenario.targetApr.toFixed(1)}%`} minLabel="2%" maxLabel={`${aprMax}%`} band={[lo, hi]}
          bandLabel={`Rates you'll likely qualify for: ${lo.toFixed(1)}%–${hi.toFixed(1)}%`}
          mark={{ value: current.apr, label: `Your loan today: ${current.apr}%` }} onChange={(v) => onChange({ targetApr: Math.round(v * 10) / 10 })} />
        {below && (
          <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--amber)" }}>
            Your scores use {result.metrics.creditedApr.toFixed(1)}%, the best rate you&apos;d likely get. Lenders are unlikely to offer less.
          </p>
        )}
        <Range label="Pay extra toward the loan each month (optional)" tip="An optional amount you choose to pay on top of the required payment. All of it goes to what you owe, so you finish sooner and pay less interest. Your required payment doesn't change." value={scenario.extraMonthlyPayment} min={0} max={500} step={25}
          display={`+$${scenario.extraMonthlyPayment}/mo`} minLabel="$0" maxLabel="$500" onChange={(v) => onChange({ extraMonthlyPayment: v })} />
        <p className="hint mt-1">
          {scenario.extraMonthlyPayment > 0
            ? <>Paying ${scenario.extraMonthlyPayment} more each month pays the loan off <span className="font-semibold">{result.metrics.extraMonthsSooner} months sooner</span> and saves about <span className="font-semibold">${Math.round(result.metrics.extraInterestSaved).toLocaleString("en-US")}</span> in interest.</>
            : "Leave at $0 to see the loan as-is, or slide to see how paying a little extra shortens it."}
        </p>
      </div>

      <div className="mt-7">
        <span className="label" id="habit-l">What if you paid the new loan…</span>
        <div className="seg-group mt-2 max-w-[440px]" role="group" aria-labelledby="habit-l">
          {(["early", "on-time", "late"] as PaymentBehavior[]).map((h) => (
            <button key={h} className="seg" aria-pressed={scenario.paymentBehavior === h} onClick={() => onChange({ paymentBehavior: h })}>
              {HABIT_LABEL[h]}
            </button>
          ))}
        </div>
      </div>

      <details className="mt-6 rounded-lg" style={{ boxShadow: "inset 0 0 0 1.5px var(--line)" }}>
        <summary className="cursor-pointer px-4 py-3 font-semibold flex flex-wrap items-center justify-between gap-2">
          <span>More options</span>
          <span className="hint font-normal">{TYPE_LABEL[scenario.loanType]} · {CHANNEL_LABEL[scenario.channel]}</span>
        </summary>
        <div className="px-4 pb-4 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Type of loan</span>
            <select className="field mt-2" value={scenario.loanType} onChange={(e) => onChange({ loanType: e.target.value as LoanType })}>
              {(Object.keys(TYPE_LABEL) as LoanType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <span className="hint block mt-1.5">{TYPE_HELP[scenario.loanType]}</span>
          </label>
          <label className="block">
            <span className="label">Where you&apos;d refinance</span>
            <select className="field mt-2" value={scenario.channel} onChange={(e) => onChange({ channel: e.target.value as LenderChannel })}>
              <option value="creditUnion">Credit union</option>
              <option value="bank">Bank</option>
              <option value="financeCompany">Finance company</option>
            </select>
            <span className="hint block mt-1.5">Credit unions usually charge about 0.5 percentage points less than banks; finance companies about 0.5 more.</span>
          </label>
        </div>
      </details>
    </section>
  );
}
