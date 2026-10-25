"use client";
import { brand } from "@/lib/brand";
import type { AdviceStep } from "@/lib/advice/types";

const GREEN_TIPS = [
  "Compare offers from 2–3 lenders in the same week.",
  "Keep paying every bill on time until your new loan is signed.",
  "Pick the shortest loan length you can comfortably afford.",
];

/** Engine-priced next steps. `steps` already carry the AI's wording when it's ready. */
export function ActionPlan({ steps, ready, checked, onToggle }: {
  steps: AdviceStep[]; ready: boolean; checked: string[]; onToggle: (id: string) => void;
}) {
  return (
    <section id="plan" aria-labelledby="plan-h">
      <h2 id="plan-h" className="text-[22px] font-bold px-1">Your next steps</h2>
      {ready && (
        <div className="card p-6 mt-3">
          <p className="font-bold">You&apos;re in great shape. Here&apos;s how to lock in the best rate.</p>
          <ul className="mt-3 space-y-2">{GREEN_TIPS.map((t) => <li key={t} className="flex gap-2"><span style={{ color: "var(--green)" }} aria-hidden>✓</span>{t}</li>)}</ul>
        </div>
      )}
      {steps.length > 0 && <p className="hint mt-2 px-1">Check the steps you plan to take to see how much each would raise your scores.</p>}
      <ul className="mt-3 space-y-3">
        {steps.map((s, i) => {
          const on = checked.includes(s.id);
          return (
            <li key={s.id} className="card step p-5 rise" style={{ animationDelay: `${i * 50}ms`, boxShadow: on ? "inset 0 0 0 2px var(--green), var(--shadow)" : undefined }}>
              <label className="flex gap-4 cursor-pointer">
                <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(s.id)} />
                <span className="cbox" style={{ background: on ? "var(--green)" : "transparent", boxShadow: on ? "none" : "inset 0 0 0 2px var(--ink2)" }} aria-hidden>
                  {on && <svg width="16" height="16" viewBox="0 0 16 16"><path className="tick" d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-bold text-[17px]">{s.title}</span>
                    <span className="shrink-0 text-[13px] font-bold px-2.5 py-1 rounded-full" style={{ background: "var(--greenSoft)", color: "var(--green)" }}>{s.impact}</span>
                  </span>
                  <span className="block mt-1" style={{ color: "var(--ink2)" }}>{s.why}</span>
                  <span className="block mt-2 hint">ⓘ From your bank data: {s.nessieEvidence}</span>
                  <span className="block hint">◷ {s.timeframe}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {!ready && steps.length === 0 && (
        <p className="card p-5 mt-3">No step we can price would raise your scores right now. Keep paying on time and check back as your loan balance drops.</p>
      )}
      {brand.specialistCta && <button className="btn btn-ghost w-full mt-4">{brand.specialistCta}</button>}
    </section>
  );
}
