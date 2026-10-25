# Refinance Audit

A refinance readiness audit for car owners. One screen answers two questions that update together:

1. **How could refinancing look for you?** Sliders for loan length, rate, extra payment, payment habit, loan type and lender type, using the user's real-looking financial data from Capital One's Nessie API.
2. **Should you refinance, and if not, how do you get there?** A 1–100 score (red / yellow / green) with a factor breakdown that adds up to the score, a plain-language rationale, and next steps priced in points by the engine.

## Run it

```bash
npm install
cp .env.example .env.local   # add NESSIE_API_KEY; ANTHROPIC_API_KEY is optional
npm run seed                 # creates the 3 demo personas in Nessie, writes lib/nessie/seeded.json
npm run dev
npm test
```

Without `NESSIE_API_KEY` (or with `NESSIE_OFFLINE=1`) profiles come from bundled fixtures built from the same persona records. Without `ANTHROPIC_API_KEY`, `/api/advice` returns rule-based text. The demo never shows an empty panel.

## How the score works

`lib/scoring/engine.ts` is pure and deterministic and runs in the browser on every slider tick. It implements the research brief (`docs/refi-research.pdf`, §8) in two layers:

- **Research verdict (§8 S1–S5):** knockouts → approval High/Medium/Low → rate estimate (Experian Q2 2026 tier base + LTV, age, term and channel adjustments) → term-matched NPV economics → verdict: Well positioned, Possible with conditions, Keep current loan, Not yet, or Not eligible.
- **1–100 score:** 11 additive factors whose thresholds come from the brief; weights sum to 100 and points sum to the score. Bands: 1–39 red, 40–69 yellow, 70–100 green. "Keep current loan" shows green only for borrowers with high approval odds.

Every assumption that goes beyond the brief is marked `ASSUMPTION` in the code with the section it extends. Policy thresholds live in `lib/scoring/config.ts`.

The AI (Claude Sonnet 5.5, `/api/advice`) only explains. Every "+N points" is computed by re-running the engine with that step applied (`lib/advice/steps.ts`). The server recomputes the score and overwrites any number the model returns.

## Nessie notes

Nessie has no credit score on customers, no APR or term on loans, no bill due dates and no card limits. `lib/nessie/normalize.ts` documents each derivation; the seed encodes the missing fields in nicknames and descriptions, ASCII only. Three Nessie quirks to know:

- Non-ASCII characters in stored strings come back corrupted.
- `GET /accounts/{id}/bills` returns 400 for the whole account if any bill lacks `payment_date` or `recurring_date`, so every seeded bill has both.
- The API is reached over HTTPS (`https://api.nessieisreal.com`).

## Branding

Unbranded by default, following research brief §5: Toyota is named only to describe vehicles. `NEXT_PUBLIC_BRAND=tfs` switches in Toyota Financial Services copy. Use it only with TFS sign-off.

## Layout

```
app/            landing, setup/money, setup/car, audit, api/{profile,vehicle,advice}
components/     stage1 (sliders, comparison, chart), stage2 (gauge, factors, rationale, plan), chrome
lib/scoring/    types, engine, loanMath, rateModel, bands, config, schema
lib/nessie/     client, normalize, personas, seed, fixtures
lib/vehicle/    NHTSA VIN decode, mock owner-records provider, depreciation value model
lib/advice/     engine-priced steps, prompt, rule-based fallback
tests/          research worked examples, monotonic properties, persona bands, step pricing
docs/, design/  research brief and Claude Design artifact (references)
```
