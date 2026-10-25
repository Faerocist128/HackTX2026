/*
 * npm run seed — creates the three demo personas in Nessie and writes their
 * customer ids to lib/nessie/seeded.json (read by /api/profile).
 * Requires NESSIE_API_KEY in ira/.env.local.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONAS } from "./personas";
import { writePerson } from "./write";

async function main() {
  const out: Record<string, string> = {};
  for (const p of PERSONAS) {
    out[p.id] = await writePerson(p);
    console.log(`✓ ${p.first} ${p.last} → customer ${out[p.id]}`);
  }
  const file = join(process.cwd(), "lib/nessie/seeded.json");
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${file}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
