"use client";
import { useEffect, useRef, useState } from "react";
import { BAND_COLORS, displayLabel, SCALE_COPY } from "@/lib/scoring/bands";
import type { Band, ScaleKey, Verdict } from "@/lib/scoring/types";

// Semicircle dial: 1 at the left, 100 at the right. Segments match the bands.
const CX = 130, CY = 130, R = 104, W = 22;
const pt = (v: number, r = R) => {
  const a = Math.PI * (1 - v / 100);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
};
const arc = (from: number, to: number) => {
  const [x1, y1] = pt(from), [x2, y2] = pt(to);
  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
};
const SEGMENTS: { band: Band; from: number; to: number }[] = [
  { band: "red", from: 0, to: 39.4 },
  { band: "yellow", from: 40.6, to: 69.4 },
  { band: "green", from: 70.6, to: 100 },
];
const CONFETTI = ["#EB0A1E", "#137A3A", "#FFB547", "#1F5FD1", "#5BD68A"];

/** One dial per scale. Compact mode fits two side by side in the sticky score panel. */
export function ScoreGauge({ scale, score, band, verdict, preview, compact }: {
  scale: ScaleKey; score: number; band: Band; verdict: Verdict; preview?: number | null; compact?: boolean;
}) {
  const [shown, setShown] = useState(score);
  const [pulse, setPulse] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const from = useRef(score);
  const prevBand = useRef(band);
  const mounted = useRef(false);

  // Count-up animation for the number; the needle uses a CSS transition.
  useEffect(() => {
    const start = from.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || start === score) { setShown(score); from.current = score; return; }
    let raf = 0, t0 = 0;
    const dur = mounted.current ? 420 : 1100;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / dur);
      const v = start + (score - start) * (1 - Math.pow(1 - p, 3));
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  useEffect(() => {
    if (mounted.current && prevBand.current !== band) {
      setPulse(true);
      if (scale === "worth" && band === "green" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) setConfetti(true);
      const t = setTimeout(() => { setPulse(false); setConfetti(false); }, 1300);
      prevBand.current = band;
      return () => clearTimeout(t);
    }
    prevBand.current = band;
    mounted.current = true;
  }, [band, scale]);

  const copy = BAND_COLORS[band];
  const meta = SCALE_COPY[scale];
  const label = displayLabel(scale, band, verdict);
  const headingId = `score-h-${scale}`;
  const angle = -90 + (Math.max(1, Math.min(100, score)) / 100) * 180;

  return (
    <section className={`card ${compact ? "p-4" : "p-6"} relative overflow-hidden`} aria-labelledby={headingId}>
      <h2 id={headingId} className={`${compact ? "text-[17px]" : "text-[22px]"} font-bold`}>{meta.title}</h2>
      <p className="hint">{meta.question}</p>
      <div className={`relative mx-auto mt-2 w-full ${compact ? "max-w-[180px]" : "max-w-[300px]"} ${pulse ? "pulse" : ""}`}>
        <svg viewBox="0 0 260 150" className="w-full" aria-hidden>
          {SEGMENTS.map((s) => (
            <path key={s.band} d={arc(s.from, s.to)} fill="none" strokeWidth={W} stroke={s.band === band ? BAND_COLORS[s.band].ink : BAND_COLORS[s.band].soft} style={{ transition: "stroke 400ms ease" }} />
          ))}
          {preview != null && preview > score && (
            <circle cx={pt(preview, R)[0]} cy={pt(preview, R)[1]} r="7" fill="var(--card)" stroke="var(--green)" strokeWidth="3" strokeDasharray="3 2" />
          )}
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px`, transition: "transform 450ms cubic-bezier(.34,1.3,.64,1)" }}>
            <line x1={CX} y1={CY} x2={CX} y2={CY - R + 18} stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
          </g>
          <circle cx={CX} cy={CY} r="9" fill="var(--ink)" />
          <text x={pt(0, R)[0]} y={CY + 18} textAnchor="middle" fontSize="11" fill="var(--ink2)">1</text>
          <text x={pt(100, R)[0]} y={CY + 18} textAnchor="middle" fontSize="11" fill="var(--ink2)">100</text>
        </svg>
        {confetti && (
          <div aria-hidden>
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="confetti" style={{ background: CONFETTI[i % CONFETTI.length], ["--dx" as string]: `${Math.cos((i / 16) * Math.PI * 2) * 140}px`, ["--dy" as string]: `${Math.sin((i / 16) * Math.PI * 2) * 110 - 40}px`, ["--rot" as string]: `${i * 47}deg` }} />
            ))}
          </div>
        )}
      </div>
      <div className="text-center -mt-2">
        <div className={`${compact ? "text-[44px]" : "text-[64px]"} font-extrabold leading-none`} style={{ color: copy.ink, transition: "color 400ms ease" }}>{Math.round(shown)}</div>
        <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold ${compact ? "text-[13px]" : ""}`} style={{ background: copy.soft, color: copy.ink }}>
          <span aria-hidden>{band === "green" ? "✓" : band === "yellow" ? "!" : "→"}</span>
          {label}
        </div>
        {preview != null && preview > score && (
          <p className="mt-2 font-semibold text-[14px]" style={{ color: "var(--green)" }}>With your checked steps: {preview}</p>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{meta.title} {score} out of 100. {label}.</p>
    </section>
  );
}
