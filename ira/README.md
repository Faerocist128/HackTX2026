# IRA

A refinance audit for car owners. It answers two questions with two separate 1–100 scores that update live as you move the sliders:

1. **Approval odds:** how likely is a lender to say yes?
2. **Refinance value:** is refinancing worth it for you?

Your money comes from Capital One's Nessie API, your car's value from Google Gemini plus the researched depreciation formula, and a separate plan page lists next steps priced in points by the engine.

## Where the API keys go

Both keys are **required**. The app shows a "Setup needed" screen and does nothing else until they are set.

| Key | What it's for | Get one |
| --- | --- | --- |
| `NESSIE_API_KEY` | Every profile is read from (and "Use my own info" is saved to) Nessie | http://api.nessieisreal.com |
| `GEMINI_API_KEY` | Car price and depreciation, a market-rate check, and the written explanation | https://aistudio.google.com/apikey |

Put them in **`ira/.env.local`** (copy `ira/.env.example`), then restart the server.

## Run it

```bash
cd ira
npm install
cp .env.example .env.local   # fill in NESSIE_API_KEY and GEMINI_API_KEY
npm run seed                 # creates the 3 demo personas in Nessie, writes lib/nessie/seeded.json
npm run dev
npm test
```

Re-run `npm run seed` whenever you change `NESSIE_API_KEY`: the seeded customer ids belong to the key that created them.

## How the scores work

`lib/scoring/engine.ts` is pure and deterministic and runs in the browser on every slider tick. It implements the research brief (`docs/refi-research.pdf`, §8) in two layers:

- **Research verdict (§8 S1–S5):** knockouts → approval High/Medium/Low → rate estimate (Experian Q2 2026 tier base + LTV, age, term, channel and loan-type adjustments, plus half of Gemini's market-rate gap capped at ±1.5 points) → term-matched NPV economics → verdict: Well positioned, Possible with conditions, Keep current loan, Not yet, or Not eligible.
- **Approval odds (1–100):** credit tier, payment history, LTV, DTI, PTI, car age and mileage, loan length and size. Any knockout shows it red.
- **Refinance value (1–100):** rate gap, total interest over the loan you built (including extra payments), NPV savings after fees, break-even, monthly payment change, loan type and length risk.

Each scale's weights sum to 100 and its factor points sum to its score. Bands: 1–39 red, 40–69 yellow, 70–100 green. Changing lender, loan type or loan length moves the target APR by the same amount as the likely rate (`applyScenarioPatch` in `lib/scoring/defaults.ts`). Tests check that every control on the audit page moves a score.

Every assumption that goes beyond the brief is marked `ASSUMPTION` in the code with the section it extends. Policy thresholds live in `lib/scoring/config.ts`.

## How Gemini is used

Gemini (`lib/ai/gemini.ts`, model set by `GEMINI_MODEL`) supplies inputs and words, never the score:

- **Car value:** base MSRP and 5-year depreciation for any year, make and model. The research brief's depreciation wins where it has data. `lib/vehicle/value.ts` applies the §4 formula, with a high-mileage fix: value fades to salvage between 200,000 and 300,000 miles, so a 900,000-mile car is worth scrap, not $9,000.
- **Market-rate check:** a typical APR for the borrower's credit tier, blended into the rate model.
- **Explanation:** the "Why these scores" text and step wording. Every "+N points" is computed by re-running the engine with that step applied (`lib/advice/steps.ts`). The server recomputes the scores and overwrites any number the model returns.

Years, makes and models come from NHTSA vPIC (free, no key) via `/api/vehicle/catalog`.

## Nessie notes

Nessie has no credit score on customers, no APR or term on loans, no bill due dates and no card limits. `lib/nessie/normalize.ts` documents each derivation; the seed encodes the missing fields in nicknames and descriptions, ASCII only. Three Nessie quirks to know:

- Non-ASCII characters in stored strings come back corrupted.
- `GET /accounts/{id}/bills` returns 400 for the whole account if any bill lacks `payment_date` or `recurring_date`, so every seeded bill has both.
- The API is reached over HTTPS (`https://api.nessieisreal.com`).

## Branding

Unbranded by default, following research brief §5: Toyota is named only to describe vehicles. `NEXT_PUBLIC_BRAND=tfs` switches in Toyota Financial Services copy. Use it only with TFS sign-off.

## Layout

```
app/            landing, setup/money, setup/car, audit, plan, api/{health,profile,profile/manual,vehicle,vehicle/catalog,advice}
components/     stage1 (sliders, comparison, chart), stage2 (gauges, factors, rationale, plan), chrome (header, KeyGate)
lib/scoring/    types, engine, loanMath, rateModel, bands, config, schema
lib/ai/         Gemini client: car specs, market-rate check, structured JSON
lib/env.ts      required API keys
lib/nessie/     client (reads), write (seed + manual entry), normalize, personas, seed
lib/vehicle/    NHTSA VIN decode, mock owner-records provider, depreciation value model
lib/advice/     engine-priced steps, prompt
tests/          research worked examples, monotonic properties, slider responsiveness, valuation, persona bands, step pricing
docs/, design/  research brief and Claude Design artifact (references)
```
