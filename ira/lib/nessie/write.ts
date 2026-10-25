// Writes a person into Nessie: customer, accounts, bills, deposits and the auto
// loan. Used by `npm run seed` (demo personas) and /api/profile/manual (your own
// info), so both are read back through the same fetchBundle → normalize path.
import { payment } from "../scoring/loanMath";
import { requireKey } from "../env";
import { personaBills, personaDeposits, personaLoan, type PersonaSpec } from "./personas";

const BASE = process.env.NESSIE_BASE_URL ?? "https://api.nessieisreal.com";
/** Writes sent to Nessie at once; one at a time made saving "Use my own info" take 3–4 s. */
const BATCH = 8;

async function post<T = { objectCreated?: { _id: string } }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}?key=${requireKey("NESSIE_API_KEY")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Nessie POST ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

const idOf = (r: { objectCreated?: { _id: string } }) => {
  if (!r.objectCreated?._id) throw new Error(`No id in ${JSON.stringify(r)}`);
  return r.objectCreated._id;
};

/** Creates the person in Nessie and returns the new customer id. */
export async function writePerson(p: PersonaSpec, asOf = new Date()): Promise<string> {
  const customerId = idOf(
    await post("/customers", {
      first_name: p.first,
      last_name: p.last,
      address: { street_number: "1", street_name: "Main St", city: "Austin", state: "TX", zip: "78701" },
    }),
  );
  const acct = (type: string, nickname: string, balance: number) =>
    post(`/customers/${customerId}/accounts`, { type, nickname, rewards: 0, balance: Math.round(balance) }).then(idOf);
  const [chk] = await Promise.all([
    acct("Checking", "Everyday checking", p.checking),
    acct("Savings", "Savings", p.savings),
    p.card ? acct("Credit Card", `Card | limit ${p.card.limit}`, p.card.balance) : null,
  ]);

  // Nessie can answer a failed write with a message instead of an error status,
  // so every write must return the created object.
  const writes = [
    ...personaBills(p, asOf).map((b) => () => post(`/accounts/${chk}/bills`, b)),
    ...personaDeposits(p, asOf).map((d) => () => post(`/accounts/${chk}/deposits`, d)),
    () => post(`/accounts/${chk}/loans`, personaLoan(p, payment(p.loan.amount, p.loan.apr, p.loan.term))),
  ];
  for (let i = 0; i < writes.length; i += BATCH) await Promise.all(writes.slice(i, i + BATCH).map((w) => w().then(idOf)));
  return customerId;
}
