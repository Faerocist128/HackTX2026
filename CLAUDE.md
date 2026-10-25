# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The app lives in `ira/` (Next.js 15 App Router, React 19, TypeScript, Tailwind v4, zustand, recharts, zod v4, vitest). Run every command from `ira/`. The root `build.gradle` (Nessie Android SDK) and root `README.md` are leftovers and not part of the app. `ira/docs/refi-research.pdf` is the research brief the scoring cites by section (§1–§13); `ira/design/refinance-audit.html` is the original design reference.

## Commands

```bash
cd ira
npm install
npm run dev                              # http://localhost:3000
npm test                                 # vitest run (all tests)
npx vitest run tests/scoring.test.ts     # one file
npx vitest run -t "car value"            # tests whose name matches
npm run lint
npm run build                            # also type-checks; route files may only export Next route fields
npm run seed                             # writes demo personas to Nessie, updates lib/nessie/seeded.json
npx tsx scripts/personas-report.ts       # prints each persona's scores and factor points (for tuning)
```

## Required API keys

`ira/.env.local` (copy `ira/.env.example`) must contain `NESSIE_API_KEY` and `GEMINI_API_KEY`; `GEMINI_MODEL` optionally overrides the default in `lib/ai/gemini.ts`. There is deliberately **no offline or rule-based fallback**: `lib/env.ts` `requireKey()` throws `MissingKeyError`, routes turn it into 503, and `components/chrome/KeyGate.tsx` (wrapping everything in `app/layout.tsx`) blocks the UI using `/api/health`. Don't reintroduce fixtures or silent fallbacks in app code.

`lib/nessie/seeded.json` holds customer ids that belong to the key that created them; after changing `NESSIE_API_KEY`, re-run `npm run seed` or persona loads fail with 502.

## Architecture

**Data flow:** Nessie profile → car valuation (NHTSA + Gemini) → deterministic engine in the browser → Gemini explanation.

- **Nessie is a bank-shaped database we write ourselves.** It has no APR, term, card limits or due dates, so `lib/nessie/personas.ts` encodes them in strings (`loan.description "apr x | term n | paid k"`, `account.nickname "... | limit N"`, `bill.nickname "<payee> | due YYYY-MM-DD | debt"`) and `lib/nessie/normalize.ts` parses them back into a `FinancialProfile`. Keep stored strings ASCII (Nessie corrupts non-ASCII), and give every bill both `payment_date` and `recurring_date` (otherwise `GET /bills` 400s for the whole account). `lib/nessie/write.ts` (no `server-only`, so the tsx seed script can import it) is shared by `npm run seed` and `/api/profile/manual`, which writes "Use my own info" into Nessie and reads it back through the same `fetchBundle → normalize` path. `manualSpec()` back-solves the original loan amount so the typed balance round-trips.
- **The engine (`lib/scoring/engine.ts`) is pure and synchronous** and runs on every slider tick. It produces two independent 1–100 scales, `odds` (approval odds) and `worth` (refinance value). Each is an additive sum of factor points (weights per scale sum to 100), plus the research §8 verdict and knockouts. Caps keep the dials consistent with the verdict:
  - Any knockout caps odds at 39 (red).
  - The S2 approval level caps odds too: low → 39, medium → 69.
  - When the current loan wins (S5 "keep" conditions), value is capped at 69.

  Each cap is recorded in `capReason`, and `uncappedScore` keeps the factor sum. "Well positioned" drops to "possible" when the user's built loan scores red on value. `validateScoreInput()` (`lib/scoring/validate.ts`) throws `ScoreInputError` on NaN, negative or unknown inputs. A stated monthly payment more than 10% off the amortized payment is replaced by the amortized one, with a reason. Approval odds are also multiplied by `rateAskMultiplier()` (1 at the likely APR, steeply lower for a target below the likely range), so a lower target APR can lower odds while refinance value still uses the floored `creditedApr`. Assumptions beyond the brief are marked `ASSUMPTION` with the section they extend; policy thresholds live in `lib/scoring/config.ts`.
- **Target vs. likely APR:** the economics never credit a rate below the low end of `estimateApr()`'s range (`lib/scoring/rateModel.ts`). Because of that floor, scenario changes to lender, loan type or term must go through `applyScenarioPatch()` (`lib/scoring/defaults.ts`, used by the store's `setScenario`), which shifts `targetApr` by the change in likely rate; otherwise those controls wouldn't move the score.
- **Gemini supplies inputs and words, never scores** (`lib/ai/gemini.ts`, structured JSON via `responseJsonSchema` + zod):
  - `lookupVehicleSpecs`: MSRP and 5-year depreciation. The research δ table in `lib/vehicle/value.ts` wins when it has the model.
  - `marketRateCheck`: blended into the rate model, half-weight, capped at ±1.5 points.
  - The `/api/advice` explanation: the server recomputes the result and overwrites step ids, order and impacts with engine values (`withAiWording`).
- **Step pricing:** every "+N points" in the plan comes from re-running `scoreRefinance()` with the step applied (`lib/advice/steps.ts`), giving `{ odds, worth }` deltas. Tests assert this equality.
- **Valuation (`lib/vehicle/value.ts`):** the §4 depreciation formula, plus a high-mileage fix (exponential decay past 100k excess miles, fading to `salvageValue` between 200k and 300k miles). `valueAt()` stays the literal §4 formula for the worked-example tests.
- **Car catalog:** NHTSA vPIC (no key) via `/api/vehicle/catalog`, limited to 20 makes; models are queried across the car, MPV and truck vehicle types. VIN decode is in `lib/vehicle/decode.ts`. Recall data there is a mock provider.
- **Client state:** one zustand store (`lib/store.ts`) persisted to sessionStorage holds profile, vehicle, market rate, scenario, checked steps and the car-page draft. Re-editing the same person keeps their car and slider choices (`carryChoices`). Pages read the engine input via `useScoreInput()`, and `useAdvice` caches Gemini responses by input so `/scores` and `/plan` don't re-call Gemini.
- **Page flow** (`components/chrome/Header.tsx` STEPS): `/setup/money` → `/setup/car` → `/audit` (sliders, sticky dials and chart, comparison) → `/scores` (factor breakdown and explanation) → `/plan` (next steps).

## Tests

`tests/` runs offline: `tests/personaProfile.ts` normalizes persona records via `personaBundle()` without the network, and vitest aliases `server-only` to a stub. `tests/algorithm/` is the full algorithm suite (`npm run test:algorithm`; `TEST_REPORT.md` and `SPEC_ASSUMPTIONS.md` there). Tests cover the research worked examples, monotonicity (APR, LTV, extra payment), that each audit-page control moves a score, the valuation bounds, and the demo personas landing in their target bands on both scales (Rachel green, Alex yellow, Riley red). After changing engine weights or ramps, check the persona bands with `scripts/personas-report.ts`.

## Branding

`lib/brand.ts`: the product name is "IRA" (don't spell out "Integrated Refinancing Audit" on the site). Unbranded by default; `NEXT_PUBLIC_BRAND=tfs` switches to Toyota Financial Services copy and should be used only with TFS sign-off.
