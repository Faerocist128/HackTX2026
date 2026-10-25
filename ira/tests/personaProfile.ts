// Test helper: a persona's Nessie records normalized offline, so engine tests don't
// need the network. The app itself always reads live Nessie.
import { payment } from "@/lib/scoring/loanMath";
import { normalize } from "@/lib/nessie/normalize";
import { personaBundle, personaById } from "@/lib/nessie/personas";

export function personaProfile(id: string, asOf: Date) {
  const p = personaById(id)!;
  return normalize(personaBundle(p, payment(p.loan.amount, p.loan.apr, p.loan.term), asOf), asOf);
}
