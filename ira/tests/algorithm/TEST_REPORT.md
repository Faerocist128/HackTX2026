# Refinance algorithm: test report

**Scope:** `scoreRefinance()` (`lib/scoring/engine.ts`) and everything it calls: `loanMath.ts`, `rateModel.ts`, `bands.ts`, `config.ts`, `validate.ts`, and `vehicleAgeYears()` in `lib/vehicle/value.ts`.

> **Status: all 9 bugs below are fixed.** Their tests now run as normal `BUG-n regression` tests, so there are no expected-fail tests left. See "Fixes applied" at the end. The bug descriptions are kept as found.
**Spec:** the research brief (`docs/refi-research.pdf`, §6 and §8 S1–S5), `config.ts`, and the code's `ASSUMPTION` notes. Details are in [SPEC_ASSUMPTIONS.md](SPEC_ASSUMPTIONS.md).

## How to run

```bash
cd ira
npm run test:algorithm             # this suite only
npm run test:algorithm:coverage    # same, plus branch coverage (HTML report in coverage/algorithm/)
npm test                           # everything, including the original 53 tests
SHOW_BUGS=1 npm run test:algorithm # turn the known-bug (xfail) tests into normal tests to see why each fails
FC_RUNS=5000 FC_SEED=1 npx vitest run tests/algorithm/d-properties.test.ts   # deeper property search
```

## Results

| Category | File | Pass | Expected fail (known bug) | Fail |
|---|---|---:|---:|---:|
| A. Typical borrowers, all 5 tiers | `a-happyPath.test.ts` | 34 | 0 | 0 |
| B. Thresholds: at, below and above (incl. rate ask) | `b-boundaries.test.ts` | 150 | 0 | 0 |
| C. Invalid input, percent vs decimal | `c-invalidInput.test.ts` | 59 | 0 | 0 |
| D. Property-based invariants (fast-check) | `d-properties.test.ts` | 26 | 0 | 0 |
| E. Financial math vs the reference | `e-financialMath.test.ts` | 30 | 0 | 0 |
| G. Fairness and compliance | `g-fairness.test.ts` | 8 | 0 | 0 |
| H. Golden table (20 scenarios) | `h-golden.test.ts` | 85 | 0 | 0 |
| I. Performance (10,000 inputs) | `i-performance.test.ts` | 1 | 0 | 0 |
| J. Remaining exports | `j-exports.test.ts` | 4 | 0 | 0 |
| S. Do the outputs make sense together? | `s-sanity.test.ts` | 38 | 0 | 0 |
| **Total** | | **435** | **0** | **0** |

- **Known-bug tests:** each one states the correct behavior and is marked `it.fails` (vitest's xfail). If a fix makes one pass, vitest flags it so the marker can be removed. Each was checked with `SHOW_BUGS=1` to confirm it fails on its own assertion, not on a crash or typo.
- **Main's update to the engine:** after pulling main (PR #11, "Lower approval odds when the target APR is below what lenders offer"), the suite caught the change right away. Five tests failed because the engine's rules had changed on purpose. They were updated to the new rule and checked against an independent copy of its formula (`specRateAsk`), and new tests cover the rule's thresholds: the likely rate, the low end of the range, and below it.
- **Property tests:** 400 runs each by default. They were also run at 5,000 runs on two extra seeds with no counterexample.
- **Performance:** 10,000 inputs score in about 0.5 s, about 0.05 ms per call. A slider tick allows about 16 ms.

## Coverage

v8 provider, run with `npm run test:algorithm:coverage`.

| File | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| engine.ts | 100% | 100% | 100% | 100% |
| loanMath.ts | 100% | 100% | 100% | 100% |
| rateModel.ts | 100% | 100% | 100% | 100% |
| bands.ts | 100% | 100% | 100% | 100% |
| config.ts | 100% | 100% | 100% | 100% |
| validate.ts | 100% | 100% | 100% | 100% |
| **All** | **100% (294/294)** | **100% (260/260)** | **100% (38/38)** | **100% (244/244)** |

One defensive branch in `rateAskMultiplier()` is marked `v8 ignore` because it can never run: the likely APR is always above the low end of its range.

`vehicleAgeYears()` is exercised through the engine, including the 10-year knockout boundary. The rest of `lib/vehicle/value.ts` (car valuation) produces the engine's `estValue` input upstream, so it is outside this scope. The original `tests/scoring.test.ts` covers it.

## What checks out

- **The money math is right.**
  - Payment, balance, payoff, present value and breakeven match an independent implementation of the brief's §6 formulas within ±$0.01.
  - The schedule reconciles: principal repaid equals the balance, and total paid equals principal + interest + fees.
  - It stays within n × half a cent of a cent-rounded servicer schedule.
  - 0% loans are handled (payment = P/n).
  - The brief's §9 worked examples reproduce.
- **Every threshold sits exactly where the brief puts it.** That covers knockouts, S2 approval, S3 rate brackets and S5 verdicts, each tested at, below and above. The `≤` / `<` choices match the brief's wording.
- **The engine moves in the right direction.** Better credit, more income, lower DTI, fewer lates, fewer miles, lower LTV, a lower target rate and lower fees never make a score worse, across 24 properties and 10,000+ random borrowers per property.
- **Scores are always integers from 1 to 100, never NaN, for valid input.** They are deterministic, the input is never mutated, and the band always matches the number.
- **Fairness:** no protected attributes or ZIP/address proxies are inputs. Name, customer id, make/model and the unused profile fields have no effect on the result.

## Bugs found

The severity scale reflects a consumer-facing financial tool, where a wrong answer can push someone into a bad loan.

### BUG-2 (High): the approval dial says "Likely to be approved" when the brief's approval rule says Low
- **Failing input:** golden G08, a deep-subprime borrower (score 470) with a 26% loan and otherwise clean numbers.
- **Expected:** approval "low" (S2: score < 601), so the odds dial is not green.
- **Actual:** approval "low" and verdict "notYet", yet the odds score is **75 (green)**: "Likely to be approved".
- **How common:** 230 of 20,000 random borrowers (1.2%) show "low" approval with a green dial. One example: a super-prime borrower (score 781) whose new payment is 21.9% of income, over every lender's 20% cap, scores 73 (green).
- **Suspected cause:** `ODDS_WEIGHTS` in `engine.ts:44`. Credit tier is only 22 of 100 points, and nothing ties the odds score to the S2 `approval` result (`engine.ts:209-212`). A borrower can max the other 78 points with any credit.
- **Tests:** `s-sanity.test.ts › BUG-2` (example and property).

### BUG-4 (High): the stated monthly payment is never checked against the loan
- **Failing input:** the baseline loan ($20,000, 12%, 48 months, payment $526.68) with the stated payment doubled to $1,053.36.
- **Expected:** a flag, or one consistent current payment throughout.
- **Actual:** NPV savings of **$24,322** against lifetime savings of **$1,708** in the same result, and the verdict "Well positioned". A stated payment of **$0** (missing data) gives NPV −$21,417 and "Keep your loan".
- **Suspected cause:** `engine.ts:142` takes `aOld = loan.monthlyPayment` as given and uses it for NPV, breakeven and payment fit. Lifetime interest instead calls `amortize(loan.balance, loan.apr, nRem)` (`engine.ts:175`), which computes its own payment. The two are never reconciled, and the schema allows a payment of 0.
- **Tests:** `s-sanity.test.ts › BUG-4` (×2), plus a test that pins the current numbers.

### BUG-1 (Medium): cash-out is subtracted twice from "savings after fees"
- **Failing input:** baseline loan, cash-out loan type, $2,000 out.
- **Expected:** the brief's §6 NPV, `PV(A_old) − PV(A_new) − costs + refunds`. A_new already includes repaying the $2,000.
- **Actual:** brief NPV **− $2,000**. Taking $2,000 out lowers displayed savings by $4,102, when repaying it costs about $2,100.
- **Suspected cause:** `engine.ts:164-170` (`- cashOut`). The verdict adds it back (`researchNpv = npvSavings + cashOut`, `engine.ts:218`), so the verdict is right but the "Savings after fees" note and the value score's `npvSavings` factor are understated.
- **Tests:** `s-sanity.test.ts › BUG-1` (×2), plus a test that pins the current numbers.

### BUG-8 (Medium): "Keep your loan" alongside a green "worth refinancing" value score
- **Failing input** (shrunk): deep subprime, $5,000 at 22.58% with 22 months left, refinanced over 29 months at 2% target with a **$424 extra payment** each month.
- **Expected:** a value score that isn't green when the verdict is "keep".
- **Actual:** verdict "keepCurrentLoan" with a green value score. It is rare: 2 of 20,000 random borrowers, leaving out subsidized loans, where "keep" is forced. It occurs whenever a large extra payment is combined with a small rate gain.
- **Suspected cause:** the `lifetimeCost` factor (`engine.ts:326`) compares the current loan *without* extra payments to the new loan *with* them. The interest those extra payments save is credited to the refinance, even though paying extra on the current loan would save the same. The verdict (term-matched, no extras) ignores it, so the two disagree. The UI swaps the label to "Your current loan already wins" but keeps the green 70+ number.
- **Tests:** `s-sanity.test.ts › BUG-8` (property, 20,000 runs).

### BUG-9 (Medium): "Refinance now" alongside a red "Not worth it yet" value score
- **Failing input:** $20,000 at 9% with 36 months left; the user builds an 84-month variable loan, paid late, at a 7.31% target with no fees.
- **Expected:** the verdict and the value dial don't contradict each other.
- **Actual:** verdict "wellPositioned" and value score **33 (red)**.
- **Suspected cause:** the S5 verdict uses only the term-matched comparison (`engine.ts:217-233`), while the value score uses the loan the user built (`engine.ts:174-182`). The brief does say to compare like for like, but the page shows both answers side by side for the same loan.
- **Tests:** `s-sanity.test.ts › BUG-9`.

### BUG-6 (Medium): an APR entered as a decimal is accepted silently
- **Failing input:** a current APR of `0.12` (meant as 12%) with the 12% payment.
- **Expected:** rejected or flagged. A 0.12% APR on a $527 payment for $20,000 is impossible.
- **Actual:** passes the schema (allowed range 0–40) and yields **"Keep your loan"** instead of "possible".
- **Suspected cause:** `schema.ts` (`apr: z.number().min(0).max(40)`) has no check that the rate is plausible next to the payment. The same applies to `discountRate`, where 0.05 is read as 0.05%.
- **Tests:** `c-invalidInput.test.ts › BUG-6`, plus a test that pins the current behavior.

### BUG-3 (Low–Medium): "Check again in 3 months" when waiting can't help
- **Failing input:** a super-prime borrower whose only problem is one of:
  - a car over 10 years old
  - over 150,000 miles
  - a balance under $5,000
  - fewer than 12 months left
- **Expected:** `checkAgainMonths = null`. These knockouts only get worse with time, and the brief (§8 S5) gives a date only for "Not yet".
- **Actual:** `checkAgainMonths = 3`.
- **Suspected cause:** `checkAgain()` (`engine.ts:435-459`) runs for every verdict except "well positioned" and "keep", and returns 3 when it has no candidate date.
- **Tests:** `s-sanity.test.ts › BUG-3` (×4).

### BUG-5 (Low; Medium if the client ever receives unvalidated data): the engine validates nothing and returns believable garbage
- **Failing inputs and results:**
  - NaN balance, APR, target APR or fees → NaN scores, shown as a red band with the verdict "notYet".
  - Unknown loan type or channel → NaN rate.
  - `termMonths = 0` → value score **93 (green)** and $24,996 of fake lifetime savings.
  - Extra payment of −$500 → $33,896 of fake lifetime savings.
- **Expected:** the engine throws, or at least never returns NaN or green for invalid input.
- **Context:** only `/api/advice` runs the zod schema. The audit, scores and plan pages call `scoreRefinance()` directly. Their inputs come from bounded sliders today, so the risk is latent.
- **Suspected cause:** no guard at the top of `scoreRefinance()` (`engine.ts:128`). `payment()` returns 0 when n ≤ 0 (`loanMath.ts:8`), and `amortize` then loops to its 600-month cap.
- **Tests:** `c-invalidInput.test.ts › BUG-5` (×9).

### BUG-7 (Low): the schema allows more months remaining than the original term
- **Failing input:** `monthsRemaining: 48, originalTerm: 36`.
- **Expected:** rejected.
- **Actual:** accepted. "Months paid" goes negative and pushes the subprime check-again date from 11 to 35 months.
- **Suspected cause:** `schema.ts` validates the two fields separately. `engine.ts:452` (`paid = originalTerm − monthsRemaining`) assumes they agree.
- **Tests:** `c-invalidInput.test.ts`, `s-sanity.test.ts › BUG-7 detail`.

## Findings that need a business decision (documented, not failed)

- **A8:** extra payments raise "refinance value" even when the new rate is no better. This is the root of BUG-8. The code says it's intentional (§7 "lead with total savings").
- **Rate ask (new on main):** asking for a rate far below the likely range turns the approval dial red, while the brief's S2 approval level and the verdict stay "high", because they don't look at the rate asked for. This follows from the change's design, but the dial and the verdict can now disagree.
- **A9:** choosing "pay early" on the new loan raises approval odds, so a borrower with one late payment gains points. Lenders judge past history, and the S2 approval level correctly doesn't move.
- **Stretched loans:** "Well positioned" often comes with a yellow value score for a stretched loan (a milder form of BUG-9).
- **Credit score range:** the schema accepts scores of 250–299 and 851–900, outside the 300–850 VantageScore range.
- **Edge handling:**
  - NaN income is treated as zero income (approval "low").
  - An unknown credit tier throws a TypeError, while an unknown loan type returns NaN.
  - A NaN or zero car value becomes LTV 9.99, so the knockout fires. That case is safe.
- **Ignored fields:** `creditUtilization`, `savingsBalance`, `totalBalances` and `profile.dti` are ignored. That's fine for fairness, but utilization is a major credit factor.

## Assumptions made

Full list in SPEC_ASSUMPTIONS.md §4 and §6. The ones that matter most:
- **BUG-1:** the brief's §6 NPV formula is the spec for "savings after fees", including for cash-out.
- **BUG-2:** the approval dial should not say "Likely to be approved" when the brief's S2 approval is Low.
- **BUG-3:** a check-again date should exist only when time can fix the problem.
- **Thresholds:** continuous ones are tested at ±0.0001, with "at" taken as threshold ∓ 1e-9 because of float division.
- **Money tolerance:** ±$0.01 against the reference. The engine keeps full float precision, and display code rounds.
- **Property inputs:** the generators use internally consistent loans. Inconsistent ones are tested on purpose in BUG-4.

## Tests that need business input before they can be written

1. **The cash-out rule.** Should cash-out be neutral (only the financing cost), the brief's formula, or an extra penalty? Then pin `npvSavings` for cash-out loans.
2. **How approval odds relate to S2 approval.** Should "low" cap the dial (say at 69), or should credit tier carry more weight? Then a property: approval low ⇒ odds ≤ X.
3. **The current-payment source of truth.** Should the stated payment be derived from balance, APR and months, or validated within some tolerance (±10%?)? Then a property tying NPV to lifetime savings for every input.
4. **Extra payments.** Should they count toward "refinance value", or be compared against the same extra paid on the current loan?
5. **Verdict vs. built loan.** Should the verdict consider the user's built loan (term, type, behavior), or should the UI label the verdict as like-for-like?
6. **Plausibility limits for rates.** What's the lowest believable APR and discount rate, so decimal entries get caught?
7. **Calibration.** Do approval odds track real approval rates? That needs outcome data (see brief §13). Until then the odds score is a heuristic, and no test can say whether 75 means 75%.
8. **Seasoning and lates.** Should check-again use when each late payment actually happened, rather than a flat 12 months?

## Fixes applied

All fixes are in `lib/scoring/engine.ts`, plus `validate.ts` (new), `schema.ts`, `types.ts` (`capReason`), and the cap explanations in `FactorBreakdown.tsx`, `app/audit/page.tsx` and `lib/advice/prompt.ts`.

| Bug | Fix |
|---|---|
| BUG-1 cash-out double count | `npvSavings` is the brief's §6 formula; the extra `− cashOut` is gone. The verdict and the displayed savings now use the same number. |
| BUG-2 green dial at Low approval | The S2 approval level caps the odds dial: low → 39 (red), medium → 69 (yellow). This works like the knockout cap, with `capReason: "approval"`, and the factor points still show the uncapped sum. Exported as `approvalCap()`. |
| BUG-3 pointless check-again date | `checkAgain()` returns null when a knockout can only get worse with time: car age, miles, balance under $5,000, or under 12 months left. |
| BUG-4 stated payment not checked | If the stated payment is more than 10% off the amortized payment (balance, APR, months left), or is $0, the engine uses the amortized payment and adds a reason telling the user to check their statement. |
| BUG-5 no input validation | New `validateScoreInput()` runs first and throws `ScoreInputError` (a `RangeError` subclass with a `field` property) on NaN, infinite, negative, out-of-range (on-time rate > 1, term < 1) or unknown values. |
| BUG-6 decimal APR | Caught by the BUG-4 check: a 0.12% APR with a 12% payment is flagged. |
| BUG-7 months > original term | The schema rejects it, and the engine floors "months paid" at 0. |
| BUG-8 "keep" with a green value dial | When the S5 "keep current loan" conditions hold, the value score is capped at 69 (`capReason: "keepLoan"`). The cap is applied even when a knockout also fires; the 5,000-run stress test showed that otherwise clearing a knockout could lower the score. |
| BUG-9 "refinance now" with a red value dial | "Well positioned" becomes "possible" when the user's built loan scores red on value. |

**Behavior changes to know about:**
- **The odds dial now never exceeds the S2 approval level.**
  - Near-prime and one-late borrowers top out at yellow (69).
  - Subprime and deep-subprime top out at red (39), unless S2 rates them medium or high.
  - Demo personas still land in their target bands: Rachel 84/74 green, Alex 61/53 yellow, Riley 20/11 red.
- **The engine now throws on invalid input** instead of returning NaN. The pages pass slider-bounded values, so this should never trigger in the app. If it does, the error names the field.
- **A9 is now limited by the BUG-2 cap.** The "pay early" boost still raises the history factor, but the dial can't pass the S2 level.

Still open (business decisions, not bugs): A8 (extra payments count toward refinance value) and the rest of "Findings that need a business decision" above.
