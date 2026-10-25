import type { Band, ScaleKey, Verdict } from "./types";
import { POLICY } from "./config";

// One color scale everywhere: gauges, factor bars, badges. Red is Toyota red per the plan;
// amber and green are the design's tokens (see app/globals.css).
export const BAND_COLORS: Record<Band, { ink: string; soft: string }> = {
  green: { ink: "var(--green)", soft: "var(--greenSoft)" },
  yellow: { ink: "var(--amber)", soft: "var(--amberSoft)" },
  red: { ink: "var(--redInk)", soft: "var(--redSoft)" },
};

export const SCALE_COPY: Record<ScaleKey, { title: string; question: string; bands: Record<Band, string> }> = {
  odds: {
    title: "Approval odds",
    question: "How likely is a lender to say yes?",
    bands: { green: "Likely to be approved", yellow: "Approval is possible", red: "Approval unlikely right now" },
  },
  worth: {
    title: "Refinance value",
    question: "Is refinancing worth it for you?",
    bands: { green: "Worth refinancing", yellow: "Some savings", red: "Not worth it yet" },
  },
};

export const bandOf = (score: number): Band =>
  score >= POLICY.bands.green ? "green" : score >= POLICY.bands.yellow ? "yellow" : "red";

/** Research §8 S5 verdicts, in plain language. */
export const VERDICT_COPY: Record<Verdict, { chip: string; headline: string }> = {
  wellPositioned: { chip: "Well positioned", headline: "Refinance now" },
  possible: { chip: "Possible, with conditions", headline: "Worth getting quotes" },
  keepCurrentLoan: { chip: "Keep current loan", headline: "Keep your loan" },
  notYet: { chip: "Not yet", headline: "Not yet, here's your path" },
  notEligible: { chip: "Not eligible yet", headline: "Not yet, here's your path" },
};

/** Gauge label. On the value scale, "Keep your loan" replaces the band label when it applies. */
export function displayLabel(scale: ScaleKey, band: Band, verdict: Verdict): string {
  if (scale === "worth" && verdict === "keepCurrentLoan") return "Your current loan already wins";
  return SCALE_COPY[scale].bands[band];
}
