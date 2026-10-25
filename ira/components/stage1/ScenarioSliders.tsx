"use client";
import { Tip } from "@/components/ui/Tip";
import type { LenderChannel, LoanType, PaymentBehavior, Scenario, ScoreResult } from "@/lib/scoring/types";

const TYPE_HELP: Record<LoanType, string> = {
  fixed: "Your rate and payment stay the same the whole loan.",
  variable: "Starts lower but can rise later. Harder to plan around.",
  "cash-out": "Borrow $2,000 extra in cash. You'll owe more than you do now.",
  "lease-buyout": "Use a loan to buy the car at the end of your lease.",
};

function Range(props: {
  label: string; tip: string; value: number; min: number; max: number; step: number; display: string;
  minLabel: string; maxLabel: string; onChange: (v: number) => void; band?: [number, number]; bandLabel?: string;
}) {
  const pct = (v: number) => ((v - props.min) / (props.max - props.min)) * 100;
  const id = props.label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div className="mt-6 first:mt-0">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label flex items-center gap-1">{props.label}<Tip text={props.tip} label={props.label} /></label>
        <output htmlFor={id} className="text-[20px] font-extrabold">{props.display}</output>
      </div>
      <div className="slider mt-1">
        <div className="track"><div className="done" style={{ width: `${pct(props.value)}%` }} /></div>
        {props.band && (
          <div className="band" aria-hidden style={{ left: `${pct(Math.max(props.min, props.band[0]))}%`, width: `${Math.max(2, pct(Math.min(props.max, props.band[1])) - pct(Math.max(props.min, props.band[0])))}%` }} />
        )}
        <input id={id} className="range" type="range" min={props.min} max={props.max} step={props.step} value={props.value} aria-valuetext={props.display} onChange={(e) => props.onChange(Number(e.target.value))} />
      </div>
      <div className="flex justify-between items-center hint text-[13px] gap-2">
        <span>{props.minLabel}</span>
        {props.bandLabel && <span className="font-semibold text-center" style={{ color: "var(--green)" }}>{props.bandLabel}</span>}
        <span>{props.maxLabel}</span>
      </div>
    </div>
  );
}

export function ScenarioSliders({ scenario, result, onChange, onReset }: {
  scenario: Scenario; result: ScoreResult; onChange: (p: Partial<Scenario>) => void; onReset: () => void;
}) {
  const yrs = scenario.termMonths / 12;
  const [lo, hi] = result.metrics.likelyAprRange;
  const below = scenario.targetApr < lo;
  return (
    <section className="card p-6" aria-labelledby="try-h">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="try-h" className="text-[22px] font-bold">Try it out</h2>
          <p className="hint">Move the sliders. Your score updates as you go.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onReset}>↺ Reset</button>
      </div>
      <div className="mt-6">
        <Range label="Loan length" tip="How many months you'll make payments. Longer means smaller payments but more interest." value={scenario.termMonths} min={24} max={84} step={6}
          display={`${scenario.termMonths} months${Number.isInteger(yrs) ? ` (${yrs} year${yrs > 1 ? "s" : ""})` : ""}`} minLabel="24 months" maxLabel="84 months" onChange={(v) => onChange({ termMonths: v })} />
        <Range label="Interest rate (APR)" tip="The yearly cost of borrowing, shown as a percent of what you owe." value={scenario.targetApr} min={2} max={20} step={0.1}
          display={`${scenario.targetApr.toFixed(1)}%`} minLabel="2%" maxLabel="20%" band={[lo, hi]}
          bandLabel={`Rates you'll likely qualify for: ${lo.toFixed(1)}%–${hi.toFixed(1)}%`} onChange={(v) => onChange({ targetApr: Math.round(v * 10) / 10 })} />
        {below && <p className="hint mt-1" role="status">Target is below what you&apos;d likely qualify for, so your score uses {result.metrics.creditedApr.toFixed(1)}%.</p>}
        <Range label="Extra each month" tip="Money you choose to add on top of your payment. It pays the loan off sooner." value={scenario.extraMonthlyPayment} min={0} max={500} step={25}
          display={`$${scenario.extraMonthlyPayment}/mo`} minLabel="$0" maxLabel="$500" onChange={(v) => onChange({ extraMonthlyPayment: v })} />
      </div>
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <div>
          <span className="label" id="habit-l">How you usually pay</span>
          <div className="seg-group mt-2" role="group" aria-labelledby="habit-l">
            {(["early", "on-time", "late"] as PaymentBehavior[]).map((h) => (
              <button key={h} className="seg" aria-pressed={scenario.paymentBehavior === h} onClick={() => onChange({ paymentBehavior: h })}>
                {h === "on-time" ? "On time" : h[0].toUpperCase() + h.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="label">Type of loan</span>
          <select className="field mt-2" value={scenario.loanType} onChange={(e) => onChange({ loanType: e.target.value as LoanType })}>
            <option value="fixed">Standard fixed</option>
            <option value="variable">Variable</option>
            <option value="cash-out">Cash-out</option>
            <option value="lease-buyout">Lease buyout</option>
          </select>
          <span className="hint block mt-1.5">{TYPE_HELP[scenario.loanType]}</span>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Where you&apos;d refinance</span>
          <select className="field mt-2" value={scenario.channel} onChange={(e) => onChange({ channel: e.target.value as LenderChannel })}>
            <option value="creditUnion">Credit union (usually lowest rates)</option>
            <option value="bank">Bank</option>
            <option value="financeCompany">Finance company</option>
          </select>
        </label>
      </div>
    </section>
  );
}
