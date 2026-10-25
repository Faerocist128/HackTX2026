/*
 * npm run seed — creates the three demo personas in Nessie and writes their
 * customer ids to lib/nessie/seeded.json (read by /api/profile).
 * Requires NESSIE_API_KEY in .env.local.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { payment } from "../scoring/loanMath";
import { PERSONAS, personaBills, personaDeposits, personaLoan } from "./personas";

const BASE = process.env.NESSIE_BASE_URL ?? "https://api.nessieisreal.com";
const KEY = process.env.NESSIE_API_KEY;

async function post<T = { objectCreated?: { _id: string } }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

const idOf = (r: { objectCreated?: { _id: string } }) => {
  if (!r.objectCreated?._id) throw new Error(`No id in ${JSON.stringify(r)}`);
  return r.objectCreated._id;
};

async function main() {
  if (!KEY) throw new Error("Set NESSIE_API_KEY in .env.local first.");
  const out: Record<string, string> = {};
  for (const p of PERSONAS) {
    const customerId = idOf(
      await post("/customers", {
        first_name: p.first,
        last_name: p.last,
        address: { street_number: "1", street_name: "Main St", city: "Austin", state: "TX", zip: "78701" },
      }),
    );
    const acct = (type: string, nickname: string, balance: number) =>
      post(`/customers/${customerId}/accounts`, { type, nickname, rewards: 0, balance }).then(idOf);
    const chk = await acct("Checking", "Everyday checking", p.checking);
    await acct("Savings", "Savings", p.savings);
    await acct("Credit Card", `Card | limit ${p.card.limit}`, p.card.balance);

    // Nessie can answer a failed write with a message instead of an error status,
    // so every write must return the created object.
    for (const b of personaBills(p)) idOf(await post(`/accounts/${chk}/bills`, b));
    for (const d of personaDeposits(p)) idOf(await post(`/accounts/${chk}/deposits`, d));
    idOf(await post(`/accounts/${chk}/loans`, personaLoan(p, payment(p.loan.amount, p.loan.apr, p.loan.term))));

    out[p.id] = customerId;
    console.log(`✓ ${p.first} ${p.last} → customer ${customerId}`);
  }
  const file = join(process.cwd(), "lib/nessie/seeded.json");
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
