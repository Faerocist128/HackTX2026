import type { Band, Verdict } from "./types";
import { POLICY } from "./config";

// One color scale everywhere: gauge, factor bars, badges. Red is Toyota red per the plan;
// amber and green are the design's tokens (see app/globals.css).
export const BAND_COPY: Record<Band, { label: string; ink: string; soft: string }> = {
  green: { label: "Good time to refinance", ink: "var(--green)", soft: "var(--greenSoft)" },
  yellow: { label: "Almost there", ink: "var(--amber)", soft: "var(--amberSoft)" },
  red: { label: "Not yet, here's your path", ink: "var(--redInk)", soft: "var(--redSoft)" },
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

/** Gauge label: "Keep your loan" overrides the band label when it applies. */
export function displayLabel(band: Band, verdict: Verdict): string {
  if (verdict === "keepCurrentLoan" && band === "green") return "Keep your loan";
  return BAND_COPY[band].label;
}
