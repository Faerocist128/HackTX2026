"use client";
import { useState } from "react";
import { SCALE_COPY } from "@/lib/scoring/bands";
import type { ScaleKey, ScoreResult } from "@/lib/scoring/types";

/** One bar per factor: points earned of max, one tab per scale. Deterministic, so it moves with the sliders. */
export function FactorBreakdown({ result }: { result: ScoreResult }) {
  const [tab, setTab] = useState<ScaleKey>("odds");
  const scale = result[tab];
  return (
    <section className="card p-6" aria-labelledby="factors-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="factors-h" className="text-[22px] font-semibold">What&apos;s driving your scores</h2>
        <span className="hint">points</span>
      </div>
      <div className="tabs mt-4" role="tablist">
        {(["odds", "worth"] as ScaleKey[]).map((k) => (
          <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {SCALE_COPY[k].title} · {result[k].score}
          </button>
        ))}
      </div>
      <ul className="mt-5 space-y-4" role="tabpanel">
        {scale.factors.map((f) => {
          const helps = f.direction === "helps";
          const ink = helps ? "var(--green)" : "var(--amber)";
          return (
            <li key={f.key}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{f.label}</span>
                <span className="text-[14px] font-bold" style={{ color: ink }}>
                  {helps ? "Helping" : "Hurting"} · {f.points.toFixed(f.points % 1 ? 1 : 0)}/{f.maxPoints}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full overflow-hidden" style={{ background: "var(--line)" }} role="meter" aria-label={f.label} aria-valuemin={0} aria-valuemax={f.maxPoints} aria-valuenow={f.points}>
                <div className="bar h-full rounded-full" style={{ width: `${Math.max(3, (f.points / f.maxPoints) * 100)}%`, background: ink }} />
              </div>
              <p className="hint mt-1">{f.note}</p>
            </li>
          );
        })}
      </ul>
      <p className="hint mt-5 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
        {scale.uncappedScore !== undefined
          ? <>These {scale.factors.length} factors add up to {scale.uncappedScore}, but your approval odds are capped at {scale.score} because most lenders won&apos;t refinance right now: {result.knockouts.map((k) => k.replace(/\.$/, "").toLowerCase()).join("; ")}. Fix that and your score can rise to {scale.uncappedScore}.</>
          : <>These {scale.factors.length} factors add up to your {SCALE_COPY[tab].title.toLowerCase()} score of {scale.score}. Same inputs, same score, every time.</>}
      </p>
    </section>
  );
}
