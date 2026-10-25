// Offline fallback (NESSIE_OFFLINE=1, or Nessie unreachable): the same persona
// records the seed script writes, normalized the same way.
import { payment } from "../scoring/loanMath";
import type { FinancialProfile } from "../scoring/types";
import { normalize } from "./normalize";
import { PERSONAS, personaBundle, personaById } from "./personas";

export function fixtureProfile(personaId: string, asOf = new Date()): FinancialProfile | null {
  const p = personaById(personaId);
  if (!p) return null;
  const bundle = personaBundle(p, payment(p.loan.amount, p.loan.apr, p.loan.term), asOf);
  return normalize(bundle, asOf, "fixture");
}

export const fixtureIds = () => PERSONAS.map((p) => p.id);
